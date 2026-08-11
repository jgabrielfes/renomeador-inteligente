/**
 * Motor de partilha — função pura.
 *
 * Sem rede, sem banco, sem LLM. Entra `Caso`, sai `Resultado`.
 * Toda linha de quinhão carrega o fundamento legal que a produziu.
 *
 * Codifica CC arts. 1.658/1.660, 1.784, 1.811, 1.816, 1.829, 1.832,
 * 1.836-1.838, 1.841, 1.845-1.846, 1.851-1.853.
 */

import {
  Rat,
  ZERO,
  ONE,
  MEIO,
  UM_TERCO,
  UM_QUARTO,
  alocarCentavos,
  centsToStr,
} from './rational';
import type {
  Caso,
  Classe,
  Divergencia,
  Herdeiro,
  QuinhaoSaida,
  Resultado,
} from './types';

export const VERSAO_MOTOR = '1.0.0';

const P_STJ_PARCIAL = 'STJ, REsp 1.368.123/SP (2ª Seção); Enunciado 270 CJF';
const P_STJ_SEPARACAO = 'STJ, REsp 1.382.170/SP (2ª Seção)';
const P_TEMA_809 = 'STF, Tema 809 (RE 878.694 e RE 646.721)';

interface ParteFr {
  id: string;
  fr: Rat;
  por?: QuinhaoSaida['por'];
}

interface Distribuicao {
  partes: ParteFr[];
  reservaAplicada: boolean;
}

/* ------------------------------------------------------------------ */
/* Estirpes e representação                                            */
/* ------------------------------------------------------------------ */

/**
 * Representantes de um herdeiro pré-morto/excluído, por estirpe (art. 1.851).
 * Renunciante não transmite (art. 1.811) — sai da árvore.
 */
function representantes(paiId: string, todos: Herdeiro[]): ParteFr[] {
  const filhos = todos.filter((h) => h.ascendenteId === paiId);
  const estirpes: ParteFr[][] = [];

  for (const f of filhos) {
    if (f.status === 'ATIVO') {
      estirpes.push([{ id: f.id, fr: ONE }]);
    } else if (f.status === 'PRE_MORTO' || f.status === 'EXCLUIDO') {
      const netos = representantes(f.id, todos);
      if (netos.length > 0) estirpes.push(netos);
    }
    // RENUNCIANTE: não representa, não ocupa estirpe
  }

  if (estirpes.length === 0) return [];
  const n = Rat.int(estirpes.length);
  return estirpes.flatMap((e) =>
    e.map((m) => ({ id: m.id, fr: m.fr.div(n), por: 'ESTIRPE' as const })),
  );
}

interface Estirpe {
  chefeId: string;
  membros: ParteFr[];
  filhoDoSobrevivente: boolean;
  representada: boolean;
}

function montarEstirpesDescendentes(herdeiros: Herdeiro[]): {
  estirpes: Estirpe[];
  renunciaTotal: boolean;
} {
  const cabecas = herdeiros.filter(
    (h) => h.classe === 'DESCENDENTE' && h.grau === 1,
  );
  const estirpes: Estirpe[] = [];

  for (const c of cabecas) {
    if (c.status === 'ATIVO') {
      estirpes.push({
        chefeId: c.id,
        membros: [{ id: c.id, fr: ONE, por: 'CABECA' }],
        filhoDoSobrevivente: c.filhoDoSobrevivente === true,
        representada: false,
      });
    } else if (c.status === 'PRE_MORTO' || c.status === 'EXCLUIDO') {
      const reps = representantes(c.id, herdeiros);
      if (reps.length > 0) {
        estirpes.push({
          chefeId: c.id,
          membros: reps,
          filhoDoSobrevivente: c.filhoDoSobrevivente === true,
          representada: true,
        });
      }
    }
  }

  // Art. 1.811, in fine: renunciando todos os da classe, a seguinte
  // herda por direito próprio e por cabeça.
  const todosRenunciaram =
    cabecas.length > 0 && cabecas.every((c) => c.status === 'RENUNCIANTE');

  if (estirpes.length === 0 && todosRenunciaram) {
    const netos = herdeiros.filter(
      (h) => h.classe === 'DESCENDENTE' && h.grau === 2 && h.status === 'ATIVO',
    );
    for (const n of netos) {
      estirpes.push({
        chefeId: n.id,
        membros: [{ id: n.id, fr: ONE, por: 'CABECA' }],
        filhoDoSobrevivente: n.filhoDoSobrevivente === true,
        representada: false,
      });
    }
    return { estirpes, renunciaTotal: true };
  }

  return { estirpes, renunciaTotal: false };
}

/* ------------------------------------------------------------------ */
/* Distribuidores por classe                                           */
/* ------------------------------------------------------------------ */

function distribuirDescendentes(
  herdeiros: Herdeiro[],
  concorre: boolean,
  aplicarReserva: boolean,
): Distribuicao {
  const { estirpes } = montarEstirpesDescendentes(herdeiros);
  const heads = estirpes.length;
  if (heads === 0) return { partes: [], reservaAplicada: false };

  let cota = ZERO;
  let reservaAplicada = false;

  if (concorre) {
    cota = Rat.make(1n, BigInt(heads + 1));
    if (aplicarReserva && cota.lt(UM_QUARTO)) {
      cota = UM_QUARTO;
      reservaAplicada = true;
    }
  }

  const restante = ONE.sub(cota);
  const porEstirpe = restante.div(Rat.int(heads));

  const partes: ParteFr[] = [];
  if (concorre) partes.push({ id: '__sobrevivente__', fr: cota, por: 'CABECA' });
  for (const e of estirpes) {
    for (const m of e.membros) {
      partes.push({ id: m.id, fr: m.fr.mul(porEstirpe), por: m.por });
    }
  }
  return { partes, reservaAplicada };
}

function distribuirAscendentes(
  herdeiros: Herdeiro[],
  temSobrevivente: boolean,
): Distribuicao {
  const asc = herdeiros.filter(
    (h) => h.classe === 'ASCENDENTE' && h.status === 'ATIVO',
  );
  if (asc.length === 0) return { partes: [], reservaAplicada: false };

  const grauMin = Math.min(...asc.map((a) => a.grau));
  const nivel = asc.filter((a) => a.grau === grauMin);

  // Art. 1.837: 1/3 se concorre com ambos os genitores; 1/2 nos demais casos.
  let cota = ZERO;
  if (temSobrevivente) {
    cota = grauMin === 1 && nivel.length >= 2 ? UM_TERCO : MEIO;
  }
  const restante = ONE.sub(cota);

  const partes: ParteFr[] = [];
  if (temSobrevivente) {
    partes.push({ id: '__sobrevivente__', fr: cota, por: 'CABECA' });
  }

  const pat = nivel.filter((a) => a.linha === 'PATERNA');
  const mat = nivel.filter((a) => a.linha === 'MATERNA');

  // Art. 1.836, §2º: igualdade de grau e diversidade de linha -> metade a cada.
  if (pat.length > 0 && mat.length > 0) {
    const porLinha = restante.mul(MEIO);
    for (const a of pat) {
      partes.push({ id: a.id, fr: porLinha.div(Rat.int(pat.length)), por: 'LINHA' });
    }
    for (const a of mat) {
      partes.push({ id: a.id, fr: porLinha.div(Rat.int(mat.length)), por: 'LINHA' });
    }
  } else {
    for (const a of nivel) {
      partes.push({ id: a.id, fr: restante.div(Rat.int(nivel.length)), por: 'CABECA' });
    }
  }

  return { partes, reservaAplicada: false };
}

function distribuirColaterais(herdeiros: Herdeiro[]): {
  dist: Distribuicao;
  avisos: string[];
} {
  const avisos: string[] = [];
  const col = herdeiros.filter((h) => h.classe === 'COLATERAL');
  const relevantes = col.filter(
    (h) => h.status === 'ATIVO' || h.status === 'PRE_MORTO' || h.status === 'EXCLUIDO',
  );
  if (relevantes.length === 0) {
    return { dist: { partes: [], reservaAplicada: false }, avisos };
  }

  const grauMin = Math.min(...relevantes.map((c) => c.grau));

  if (grauMin > 2) {
    const nivel = relevantes.filter((c) => c.grau === grauMin && c.status === 'ATIVO');
    avisos.push(
      'Sucessão colateral além do 2º grau: conferir manualmente as regras dos arts. 1.840 a 1.843.',
    );
    const partes = nivel.map((c) => ({
      id: c.id,
      fr: ONE.div(Rat.int(nivel.length)),
      por: 'CABECA' as const,
    }));
    return { dist: { partes, reservaAplicada: false }, avisos };
  }

  // Irmãos: art. 1.841 — unilateral herda metade do que herda cada bilateral.
  const irmaos = relevantes.filter((c) => c.grau === 2);
  const grupos: { peso: Rat; membros: ParteFr[] }[] = [];

  for (const i of irmaos) {
    const peso = i.vinculoIrmao === 'UNILATERAL' ? ONE : Rat.int(2);
    if (i.status === 'ATIVO') {
      grupos.push({ peso, membros: [{ id: i.id, fr: ONE, por: 'PESO' }] });
    } else {
      const sobrinhos = representantes(i.id, herdeiros);
      if (sobrinhos.length > 0) grupos.push({ peso, membros: sobrinhos });
    }
  }

  if (grupos.length === 0) {
    return { dist: { partes: [], reservaAplicada: false }, avisos };
  }

  const total = grupos.reduce((a, g) => a.add(g.peso), ZERO);
  const partes: ParteFr[] = [];
  for (const g of grupos) {
    const quota = g.peso.div(total);
    for (const m of g.membros) {
      partes.push({ id: m.id, fr: m.fr.mul(quota), por: m.por ?? 'PESO' });
    }
  }
  return { dist: { partes, reservaAplicada: false }, avisos };
}

/* ------------------------------------------------------------------ */
/* Motor                                                               */
/* ------------------------------------------------------------------ */

interface Computo {
  classe: Classe | 'SOBREVIVENTE_EXCLUSIVO' | null;
  distComum: Distribuicao;
  distParticular: Distribuicao;
  avisos: string[];
  reservaAplicada: boolean;
  filiacaoHibrida: boolean;
}

function computar(caso: Caso, aplicarReservaHibrida: boolean): Computo {
  const h = caso.herdeiros;
  const s = caso.sobrevivente ?? null;
  const opts = caso.opcoes ?? {};
  const baseParcial = opts.baseConcorrenciaParcial ?? 'PARTICULARES';
  const avisos: string[] = [];

  const { estirpes } = montarEstirpesDescendentes(h);
  const temDescendentes = estirpes.length > 0;
  const temAscendentes = h.some(
    (x) => x.classe === 'ASCENDENTE' && x.status === 'ATIVO',
  );
  const temParticulares = caso.bens.some((b) => b.natureza === 'PARTICULAR');

  // Reserva de 1/4 (art. 1.832): só se o sobrevivente for ascendente
  // de todos os descendentes com quem concorre.
  const chefesComuns = estirpes.filter((e) => e.filhoDoSobrevivente);
  const todosComuns = temDescendentes && chefesComuns.length === estirpes.length;
  const nenhumComum = chefesComuns.length === 0;
  const filiacaoHibrida = temDescendentes && !todosComuns && !nenhumComum;
  const aplicarReserva = todosComuns || (filiacaoHibrida && aplicarReservaHibrida);

  const concorreDescendentes = (bolsa: 'COMUM' | 'PARTICULAR'): boolean => {
    if (!s) return false;
    switch (s.regime) {
      case 'COMUNHAO_UNIVERSAL':
      case 'SEPARACAO_OBRIGATORIA':
        return false;
      case 'SEPARACAO_CONVENCIONAL':
        return true;
      case 'COMUNHAO_PARCIAL':
        if (!temParticulares) return false;
        return baseParcial === 'TOTAL' ? true : bolsa === 'PARTICULAR';
      default:
        return false;
    }
  };

  if (temDescendentes) {
    return {
      classe: 'DESCENDENTE',
      distComum: distribuirDescendentes(h, concorreDescendentes('COMUM'), aplicarReserva),
      distParticular: distribuirDescendentes(
        h,
        concorreDescendentes('PARTICULAR'),
        aplicarReserva,
      ),
      avisos,
      reservaAplicada: false,
      filiacaoHibrida,
    };
  }

  if (temAscendentes) {
    // Art. 1.829, II: concorrência independe do regime de bens.
    const d = distribuirAscendentes(h, s !== null);
    return {
      classe: 'ASCENDENTE',
      distComum: d,
      distParticular: d,
      avisos,
      reservaAplicada: false,
      filiacaoHibrida: false,
    };
  }

  if (s) {
    // Art. 1.838: na falta de descendentes e ascendentes, herda a totalidade.
    const d: Distribuicao = {
      partes: [{ id: '__sobrevivente__', fr: ONE }],
      reservaAplicada: false,
    };
    return {
      classe: 'SOBREVIVENTE_EXCLUSIVO',
      distComum: d,
      distParticular: d,
      avisos,
      reservaAplicada: false,
      filiacaoHibrida: false,
    };
  }

  const { dist, avisos: av } = distribuirColaterais(h);
  return {
    classe: dist.partes.length ? 'COLATERAL' : null,
    distComum: dist,
    distParticular: dist,
    avisos: av,
    reservaAplicada: false,
    filiacaoHibrida: false,
  };
}

function fundamentoDe(
  classe: Computo['classe'],
  ehSobrevivente: boolean,
  vinculo: string | undefined,
): { fundamento: string; precedente?: string } {
  if (classe === 'DESCENDENTE') {
    return ehSobrevivente
      ? { fundamento: 'CC art. 1.829, I e art. 1.832 — concorrência com descendentes', precedente: P_STJ_PARCIAL }
      : { fundamento: 'CC art. 1.829, I — sucessão dos descendentes' };
  }
  if (classe === 'ASCENDENTE') {
    return ehSobrevivente
      ? { fundamento: 'CC art. 1.829, II e art. 1.837 — concorrência com ascendentes' }
      : { fundamento: 'CC art. 1.829, II e art. 1.836 — sucessão dos ascendentes' };
  }
  if (classe === 'SOBREVIVENTE_EXCLUSIVO') {
    return {
      fundamento: 'CC art. 1.829, III e art. 1.838 — herda a totalidade',
      precedente: vinculo === 'UNIAO_ESTAVEL' ? P_TEMA_809 : undefined,
    };
  }
  return { fundamento: 'CC art. 1.829, IV e arts. 1.839-1.843 — sucessão colateral' };
}

export function partilhar(caso: Caso): Resultado {
  const avisos: string[] = [];
  const bloqueios: string[] = [];
  const divergencias: Divergencia[] = [];
  const s = caso.sobrevivente ?? null;
  const opts = caso.opcoes ?? {};

  /* ---------- validações ---------- */

  if (s?.regime === 'PARTICIPACAO_FINAL_AQUESTOS') {
    bloqueios.push(
      'Regime de participação final nos aquestos exige apuração própria (CC arts. 1.672-1.686). Cálculo não suportado.',
    );
  }
  if (caso.bens.length === 0) {
    bloqueios.push('Acervo vazio: nenhum bem informado.');
  }
  for (const a of caso.herdeiros) {
    if (a.classe === 'ASCENDENTE' && a.grau >= 2 && !a.linha) {
      bloqueios.push(
        `Ascendente "${a.nome}" de grau ${a.grau} sem linha paterna/materna definida (CC art. 1.836, §2º).`,
      );
    }
    if (a.classe === 'COLATERAL' && a.grau === 2 && !a.vinculoIrmao) {
      bloqueios.push(
        `Irmão "${a.nome}" sem vínculo bilateral/unilateral definido (CC art. 1.841).`,
      );
    }
  }

  /* ---------- acervo ---------- */

  const somar = (xs: { valor: string; natureza: string }[], nat: string) =>
    xs.filter((x) => x.natureza === nat).reduce((a, x) => a.add(Rat.decimal(x.valor)), ZERO);

  const dividas = caso.dividas ?? [];
  const bensComuns = somar(caso.bens, 'COMUM');
  const bensParticulares = somar(caso.bens, 'PARTICULAR');
  const divComuns = somar(dividas, 'COMUM');
  const divParticulares = somar(dividas, 'PARTICULAR');

  const massaComum = bensComuns.sub(divComuns);
  const massaParticular = bensParticulares.sub(divParticulares);
  const massa = massaComum.add(massaParticular);

  if (massa.isNeg() || massa.isZero()) {
    bloqueios.push('Massa partilhável nula ou negativa: acervo insolvente ou mal informado.');
  }

  /* ---------- meação ---------- */

  let meacao = ZERO;
  let meacaoInfo: Resultado['meacao'] = null;

  if (s) {
    if (s.regime === 'COMUNHAO_UNIVERSAL') {
      meacao = massa.mul(MEIO);
      meacaoInfo = {
        beneficiario: s.nome ?? 'Sobrevivente',
        fracao: '1/2 da massa',
        valor: '',
        fundamento: 'CC art. 1.667 — comunhão universal de bens',
      };
    } else if (s.regime === 'COMUNHAO_PARCIAL') {
      meacao = massaComum.mul(MEIO);
      meacaoInfo = {
        beneficiario: s.nome ?? 'Sobrevivente',
        fracao: '1/2 dos bens comuns',
        valor: '',
        fundamento: 'CC arts. 1.658 e 1.660 — comunhão parcial de bens',
      };
    } else if (s.regime === 'SEPARACAO_OBRIGATORIA' && s.sumula377EsforcoComumProvado) {
      meacao = massaComum.mul(MEIO);
      meacaoInfo = {
        beneficiario: s.nome ?? 'Sobrevivente',
        fracao: '1/2 dos aquestos',
        valor: '',
        fundamento: 'Súmula 377/STF, com prova do esforço comum',
      };
      avisos.push(
        'Súmula 377/STF aplicada com base em esforço comum declarado. O STJ exige prova; confirmar a instrução do caso.',
      );
    }
  }

  let herancaComum = massaComum;
  let herancaParticular = massaParticular;
  if (s?.regime === 'COMUNHAO_UNIVERSAL') {
    herancaComum = massaComum.mul(MEIO);
    herancaParticular = massaParticular.mul(MEIO);
  } else if (
    s?.regime === 'COMUNHAO_PARCIAL' ||
    (s?.regime === 'SEPARACAO_OBRIGATORIA' && s.sumula377EsforcoComumProvado)
  ) {
    herancaComum = massaComum.mul(MEIO);
  }
  const heranca = herancaComum.add(herancaParticular);

  /* ---------- elegibilidade extrajudicial ---------- */

  let elegivel = true;
  if (caso.herdeiros.some((x) => x.menorOuIncapaz)) {
    elegivel = false;
    avisos.push('Há herdeiro menor ou incapaz: via judicial (CPC art. 610).');
  }
  if (caso.testamento?.existe) {
    elegivel = false;
    avisos.push(
      'Há testamento: conferir a hipótese de dispensa na versão vigente do Código Nacional de Normas do CNJ antes de optar pelo extrajudicial.',
    );
  }
  if (caso.litigioEntreHerdeiros) {
    elegivel = false;
    avisos.push('Litígio declarado entre herdeiros: via judicial.');
  }

  if (bloqueios.length > 0) {
    return montar(caso, {
      bloqueios,
      avisos,
      divergencias,
      elegivel: false,
      classe: null,
      partes: [],
      meacao,
      meacaoInfo,
      bensComuns,
      bensParticulares,
      dividasTotal: divComuns.add(divParticulares),
      massa,
      herancaComum,
      herancaParticular,
      heranca,
      reservaAplicada: false,
    });
  }

  /* ---------- distribuição ---------- */

  const hibridaOpt = opts.filiacaoHibridaAplicaReserva ?? null;
  const c = computar(caso, hibridaOpt === true);
  avisos.push(...c.avisos);

  const partes = consolidar(c, herancaComum, herancaParticular, heranca);

  /* ---------- testamento ---------- */

  let partesFinais = partes;
  const legados = caso.testamento?.legados ?? [];
  if (legados.length > 0) {
    const totalLegado = legados.reduce((a, l) => a.add(Rat.fraction(l.fracaoDaHeranca)), ZERO);
    const temNecessarios =
      c.classe === 'DESCENDENTE' ||
      c.classe === 'ASCENDENTE' ||
      c.classe === 'SOBREVIVENTE_EXCLUSIVO';
    const disponivel = temNecessarios ? MEIO : ONE;
    if (totalLegado.gt(disponivel)) {
      bloqueios.push(
        `Legados somam ${totalLegado.toString()} da herança, acima da parte disponível (${disponivel.toString()}). Redução necessária (CC art. 1.967).`,
      );
    }
    const fator = ONE.sub(totalLegado);
    partesFinais = partes.map((p) => ({ ...p, fr: p.fr.mul(fator) }));
    legados.forEach((l, i) => {
      partesFinais.push({
        id: `__legatario_${i}__`,
        fr: Rat.fraction(l.fracaoDaHeranca),
        nome: l.beneficiario,
        papel: 'LEGATARIO',
      });
    });
  }

  return montar(caso, {
    bloqueios,
    avisos,
    divergencias: montarDivergencias(caso, c, herancaComum, herancaParticular, heranca, divergencias),
    elegivel,
    classe: c.classe,
    partes: partesFinais,
    meacao,
    meacaoInfo,
    bensComuns,
    bensParticulares,
    dividasTotal: divComuns.add(divParticulares),
    massa,
    herancaComum,
    herancaParticular,
    heranca,
    reservaAplicada: c.distParticular.reservaAplicada || c.distComum.reservaAplicada,
  });
}

/* ------------------------------------------------------------------ */
/* Consolidação das duas bolsas em fração da herança total             */
/* ------------------------------------------------------------------ */

interface ParteConsolidada {
  id: string;
  fr: Rat;
  por?: QuinhaoSaida['por'];
  nome?: string;
  papel?: QuinhaoSaida['papel'];
}

function consolidar(
  c: Computo,
  herancaComum: Rat,
  herancaParticular: Rat,
  heranca: Rat,
): ParteConsolidada[] {
  const acc = new Map<string, Rat>();
  const por = new Map<string, QuinhaoSaida['por']>();

  const aplicar = (d: { partes: ParteFr[] }, valorBolsa: Rat) => {
    if (heranca.isZero()) return;
    const peso = valorBolsa.div(heranca);
    for (const p of d.partes) {
      acc.set(p.id, (acc.get(p.id) ?? ZERO).add(p.fr.mul(peso)));
      if (p.por && !por.has(p.id)) por.set(p.id, p.por);
    }
  };

  aplicar(c.distComum, herancaComum);
  aplicar(c.distParticular, herancaParticular);

  return [...acc.entries()]
    .filter(([, fr]) => !fr.isZero())
    .map(([id, fr]) => ({ id, fr, por: por.get(id) }));
}

function montarDivergencias(
  caso: Caso,
  c: Computo,
  hc: Rat,
  hp: Rat,
  h: Rat,
  base: Divergencia[],
): Divergencia[] {
  const out = [...base];
  const opts = caso.opcoes ?? {};

  if (c.filiacaoHibrida && (opts.filiacaoHibridaAplicaReserva ?? null) === null) {
    const alt = computar(caso, true);
    const partesAlt = consolidar(alt, hc, hp, h);
    out.push({
      tema: 'Filiação híbrida e reserva de 1/4 (CC art. 1.832)',
      descricao:
        'Parte dos descendentes não é filha do sobrevivente. Há controvérsia sobre a incidência da reserva de 1/4.',
      cenarioAdotado: 'Enunciado 527 CJF — reserva afastada, divisão por cabeça',
      cenarioAlternativo: 'Reserva de 1/4 aplicada mesmo em filiação híbrida',
      quinhoesAlternativos: partesAlt.map((p) => ({
        herdeiroId: p.id,
        nome: nomeDe(caso, p.id),
        papel: p.id === '__sobrevivente__' ? 'SOBREVIVENTE' : 'HERDEIRO',
        fracaoHeranca: p.fr.toString(),
        valor: centsToStr(p.fr.mul(h).floorCents()),
        fundamento: 'Cenário alternativo — reserva de 1/4 aplicada',
      })),
    });
  }

  if (
    c.classe === 'DESCENDENTE' &&
    caso.sobrevivente?.regime === 'COMUNHAO_PARCIAL' &&
    caso.bens.some((b) => b.natureza === 'PARTICULAR')
  ) {
    out.push({
      tema: 'Base da concorrência na comunhão parcial',
      descricao:
        'Divergência sobre a concorrência recair só nos bens particulares ou em toda a herança.',
      cenarioAdotado: `Somente bens particulares — ${P_STJ_PARCIAL}`,
      cenarioAlternativo: 'Concorrência sobre a totalidade da herança',
      quinhoesAlternativos: [],
    });
  }

  if (c.classe === 'DESCENDENTE' && caso.sobrevivente?.regime === 'SEPARACAO_CONVENCIONAL') {
    out.push({
      tema: 'Concorrência na separação convencional',
      descricao: 'Doutrina diverge sobre a concorrência sucessória havendo pacto de separação.',
      cenarioAdotado: `Há concorrência — ${P_STJ_SEPARACAO}`,
      cenarioAlternativo: 'Ausência de concorrência, por respeito ao pacto',
      quinhoesAlternativos: [],
    });
  }

  return out;
}

function nomeDe(caso: Caso, id: string): string {
  if (id === '__sobrevivente__') return caso.sobrevivente?.nome ?? 'Sobrevivente';
  return caso.herdeiros.find((x) => x.id === id)?.nome ?? id;
}

/* ------------------------------------------------------------------ */
/* Montagem do resultado + invariantes                                 */
/* ------------------------------------------------------------------ */

interface Ctx {
  bloqueios: string[];
  avisos: string[];
  divergencias: Divergencia[];
  elegivel: boolean;
  classe: Computo['classe'];
  partes: ParteConsolidada[];
  meacao: Rat;
  meacaoInfo: Resultado['meacao'];
  bensComuns: Rat;
  bensParticulares: Rat;
  dividasTotal: Rat;
  massa: Rat;
  herancaComum: Rat;
  herancaParticular: Rat;
  heranca: Rat;
  reservaAplicada: boolean;
}

function montar(caso: Caso, ctx: Ctx): Resultado {
  const herancaCents = ctx.heranca.floorCents();
  const { alocacoes, ajustados } = alocarCentavos(
    ctx.partes.map((p) => ({ id: p.id, fr: p.fr })),
    herancaCents,
  );
  const porId = new Map(alocacoes.map((a) => [a.id, a.cents]));

  const quinhoes: QuinhaoSaida[] = ctx.partes.map((p) => {
    const ehSobrev = p.id === '__sobrevivente__';
    const f = fundamentoDe(ctx.classe, ehSobrev, caso.sobrevivente?.vinculo);
    return {
      herdeiroId: p.id,
      nome: p.nome ?? nomeDe(caso, p.id),
      papel: p.papel ?? (ehSobrev ? 'SOBREVIVENTE' : 'HERDEIRO'),
      fracaoHeranca: p.fr.toString(),
      valor: centsToStr(porId.get(p.id) ?? 0n),
      fundamento: p.papel === 'LEGATARIO' ? 'CC art. 1.857 — disposição testamentária' : f.fundamento,
      precedente: f.precedente,
      por: p.por,
      reservaUmQuartoAplicada: ehSobrev ? ctx.reservaAplicada : undefined,
    };
  });

  /* invariantes */
  const avisos = [...ctx.avisos];
  const bloqueios = [...ctx.bloqueios];

  if (ctx.partes.length > 0) {
    const soma = ctx.partes.reduce((a, p) => a.add(p.fr), ZERO);
    if (!soma.eq(ONE)) {
      bloqueios.push(`INVARIANTE VIOLADA: frações somam ${soma.toString()}, esperado 1.`);
    }
    if (ctx.partes.some((p) => p.fr.isNeg())) {
      bloqueios.push('INVARIANTE VIOLADA: quinhão negativo.');
    }
    const somaCents = alocacoes.reduce((a, x) => a + x.cents, 0n);
    if (somaCents !== herancaCents) {
      bloqueios.push('INVARIANTE VIOLADA: soma em centavos difere da herança.');
    }
  }

  avisos.push(
    'Excesso de quinhão em partilha desigual pode configurar doação — verificar ITCMD adicional.',
    'Cálculo não substitui análise jurídica. Revisão obrigatória antes da lavratura.',
  );

  const temNecessarios =
    ctx.classe === 'DESCENDENTE' ||
    ctx.classe === 'ASCENDENTE' ||
    ctx.classe === 'SOBREVIVENTE_EXCLUSIVO';
  const legitima = temNecessarios ? ctx.heranca.mul(MEIO) : ZERO;

  return {
    casoId: caso.casoId,
    calculadoEm: new Date().toISOString(),
    versaoMotor: VERSAO_MOTOR,
    elegivelExtrajudicial: ctx.elegivel && bloqueios.length === 0,
    classeVocacao: ctx.classe,
    acervo: {
      bensComuns: centsToStr(ctx.bensComuns.floorCents()),
      bensParticulares: centsToStr(ctx.bensParticulares.floorCents()),
      dividas: centsToStr(ctx.dividasTotal.floorCents()),
      massaPartilhavel: centsToStr(ctx.massa.floorCents()),
    },
    meacao: ctx.meacaoInfo
      ? { ...ctx.meacaoInfo, valor: centsToStr(ctx.meacao.floorCents()) }
      : null,
    heranca: {
      comum: centsToStr(ctx.herancaComum.floorCents()),
      particular: centsToStr(ctx.herancaParticular.floorCents()),
      total: centsToStr(ctx.heranca.floorCents()),
      legitima: centsToStr(legitima.floorCents()),
      disponivel: centsToStr(ctx.heranca.sub(legitima).floorCents()),
    },
    quinhoes,
    divergencias: ctx.divergencias,
    bloqueios,
    avisos,
    residuo: { criterio: 'maior resto fracionário', ajustados },
  };
}
