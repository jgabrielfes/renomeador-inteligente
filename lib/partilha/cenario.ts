/**
 * Motor de CENÁRIOS de partilha — um motor, dois públicos.
 *
 * A seção III (partilha diferenciada do advogado) e o Espaço do Espólio
 * (cenários propostos pela família) usam ESTE módulo: a matriz de alocações
 * (bem → participante → célula "33,33" ou "1/3"; linha vazia segue a
 * proporção exata do direito) vira titularidades em FRAÇÕES EXATAS e passa
 * pelo `apurarAtribuicao` — nenhuma regra de cálculo é duplicada.
 *
 * Além da apuração técnica (posições, tornas, tributos), o módulo produz a
 * LEITURA LEIGA: uma linha por participante (direito, o que recebe em bens,
 * o que paga/recebe em dinheiro, ajuste de despesas adiantadas, total), o
 * resumo em até três frases e a validação com mensagens leigas — inclusive
 * o bloqueio cogente (menor/incapaz não pode abrir mão de valor).
 *
 * Motor PURO (sem relógio/aleatoriedade): datas e isenções vêm de fora.
 * Testes: npx tsx lib/partilha/cenario.test.ts
 */

import {
  apurarAtribuicao,
  TABELA_SP_2026,
  type ResultadoAtribuicao,
  type TituloCessao,
  type TitularidadeBem,
} from './atribuicao';
import type { Bem, Caso, Resultado } from './types';

/* ---------- células da matriz: percentual E fração exata ---------- */

/** Célula da matriz que é FRAÇÃO ("1/3", "2/5") em vez de percentual. */
export const ehFracao = (v: string | undefined): boolean => /^\s*\d+\s*\/\s*\d+\s*$/.test(v ?? '');

/**
 * Célula da matriz da partilha → percentual numérico. Aceita percentual com
 * vírgula ("33,33") E fração exata ("1/3" = 33,333…%) — a fração existe para
 * a dízima não fabricar torna que a família não combinou.
 */
export const pctNum = (v: string | undefined): number => {
  if (!v) return 0;
  const m = v.trim().match(/^(\d+)\s*\/\s*(\d+)$/);
  if (m && Number(m[2]) > 0) return (Number(m[1]) / Number(m[2])) * 100;
  const n = Number(v.replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? n : 0;
};

/**
 * Célula como fração EXATA {n, d} do bem (1 = bem inteiro): "1/3" vira 1/3
 * de verdade; percentual vira n/1.000.000 (até 4 casas). É o que a
 * atribuição usa para montar titularidades sem erro de arredondamento.
 */
export const fracaoDaCelula = (v: string | undefined): { n: number; d: number } => {
  if (!v) return { n: 0, d: 1 };
  const m = v.trim().match(/^(\d+)\s*\/\s*(\d+)$/);
  if (m && Number(m[2]) > 0) return { n: Number(m[1]), d: Number(m[2]) };
  return { n: Math.round(pctNum(v) * 10000), d: 1_000_000 };
};

export const mdc = (a: number, b: number): number => (b === 0 ? a : mdc(b, a % b));
export const mmc = (a: number, b: number): number => (a / mdc(a, b)) * b;

/**
 * Percentual → fração "bonita" (denominador pequeno) quando o valor casa de
 * perto com uma — "33,33" e "33,34" viram "1/3", "50" vira "1/2". Sem
 * casamento limpo, devolve null (a célula fica como está).
 */
export const fracaoBonita = (pct: number): string | null => {
  const v = pct / 100;
  if (v <= 0 || v > 1) return null;
  for (let d = 1; d <= 99; d++) {
    const n = Math.round(v * d);
    if (n > 0 && Math.abs(n / d - v) <= 0.0001) {
      const g = mdc(n, d);
      return `${n / g}/${d / g}`;
    }
  }
  return null;
};

/* ---------- participantes e direitos (derivados do Resultado) ---------- */

export interface Participante {
  id: string;
  nome: string;
}

/** Matriz de alocações: bemId → participanteId → célula ("33,33" | "1/3").
 *  É o MESMO formato persistido pela seção III (`atribuicoesPct` do caso) —
 *  "levar para a partilha" é uma cópia direta, sem tradução. */
export type Alocacoes = Record<string, Record<string, string>>;

/** Quem tem direito no caso (meação e/ou quinhão) — as opções do "fica com". */
export function participantesDoResultado(resultado: Resultado): Participante[] {
  const lista: Participante[] = [];
  if (resultado.meacao) {
    lista.push({ id: '__sobrevivente__', nome: resultado.meacao.beneficiario });
  }
  for (const q of resultado.quinhoes) {
    if (!lista.some((x) => x.id === q.herdeiroId)) lista.push({ id: q.herdeiroId, nome: q.nome });
  }
  return lista;
}

/** Quinhão de direito em R$ por participante (meação + quinhões). */
export function direitosDoResultado(resultado: Resultado): Record<string, number> {
  const mapa: Record<string, number> = {};
  if (resultado.meacao) mapa['__sobrevivente__'] = Number(resultado.meacao.valor);
  for (const q of resultado.quinhoes)
    mapa[q.herdeiroId] = (mapa[q.herdeiroId] ?? 0) + Number(q.valor);
  return mapa;
}

/** Alguma linha da matriz foi preenchida? (Tudo vazio = proporção do direito
 *  — a seção III nem monta a apuração nesse caso.) */
export function temAlocacao(
  alocacoes: Alocacoes,
  bens: Bem[],
  participantes: Participante[],
): boolean {
  return bens.some((b) => {
    const linha = alocacoes[b.id] ?? {};
    return participantes.some((p) => pctNum(linha[p.id]) > 0);
  });
}

/** Fração do motor ("1/6", "2/3" ou inteira "1") → {n, d} exato; null se não parsear. */
const fracaoDoMotor = (v: string | undefined): { n: number; d: number } | null => {
  const m = (v ?? '').trim().match(/^(\d+)(?:\s*\/\s*(\d+))?$/);
  if (!m) return null;
  const d = m[2] ? Number(m[2]) : 1;
  return d > 0 ? { n: Number(m[1]), d } : null;
};

/** Soma exata de frações, reduzida a cada passo (denominadores não explodem). */
const somarFracoes = (a: { n: number; d: number }, b: { n: number; d: number }) => {
  const n = a.n * b.d + b.n * a.d;
  const d = a.d * b.d;
  const g = mdc(n, d) || 1;
  return { n: n / g, d: d / g };
};

/**
 * Matriz PRÉ-PREENCHIDA com a proporção exata do DIREITO de cada um — a
 * mesma divisão da partilha igualitária, célula a célula, em FRAÇÕES EXATAS
 * (não fabrica torna de dízima). É o ponto de partida da partilha
 * diferenciada: o quadro abre completo e o usuário altera só o bem que
 * interessa. A meação por bem sai por diferença (1 − Σ dos quinhões daquela
 * natureza), o que vale inclusive na comunhão universal, em que a meação
 * alcança também os bens de natureza particular. Fração que fecha o bem
 * inteiro vira "100" (percentual exato) em vez de "1/1".
 */
export function alocacoesDoDireito(resultado: Resultado, bens: Bem[]): Alocacoes {
  const linhaDaNatureza = (comum: boolean): Record<string, string> => {
    const mapa = new Map<string, { n: number; d: number }>();
    for (const q of resultado.quinhoes) {
      const f = fracaoDoMotor(comum ? q.fracaoBemComum : q.fracaoBemParticular);
      if (!f || f.n === 0) continue;
      const atual = mapa.get(q.herdeiroId);
      mapa.set(q.herdeiroId, atual ? somarFracoes(atual, f) : f);
    }
    if (resultado.meacao) {
      let soma = { n: 0, d: 1 };
      for (const f of mapa.values()) soma = somarFracoes(soma, f);
      if (soma.d - soma.n > 0) mapa.set('__sobrevivente__', { n: soma.d - soma.n, d: soma.d });
    }
    const linha: Record<string, string> = {};
    for (const [id, f] of mapa) {
      const g = mdc(f.n, f.d) || 1;
      const n = f.n / g;
      const d = f.d / g;
      linha[id] = d === 1 ? String(n * 100) : `${n}/${d}`;
    }
    return linha;
  };

  const comuns = linhaDaNatureza(true);
  const particulares = linhaDaNatureza(false);
  const alocacoes: Alocacoes = {};
  for (const bem of bens) {
    const linha = bem.natureza === 'COMUM' ? comuns : particulares;
    if (Object.keys(linha).length > 0) alocacoes[bem.id] = { ...linha };
  }
  return alocacoes;
}

/**
 * Completa a matriz LINHA A LINHA com a proporção do direito: bem sem
 * nenhuma célula digitada recebe a linha do direito; bem com qualquer
 * célula preenchida fica exatamente como está (o que o usuário digitou
 * nunca é sobrescrito). Devolve null quando nada muda — caso salvo com
 * parte da matriz preenchida ganha só as linhas que faltavam.
 */
export function completarComDireito(atual: Alocacoes, direito: Alocacoes): Alocacoes | null {
  let mudou = false;
  const nova: Alocacoes = { ...atual };
  for (const [bemId, linha] of Object.entries(direito)) {
    const existente = nova[bemId];
    if (existente && Object.values(existente).some((v) => v && v.trim())) continue;
    nova[bemId] = linha;
    mudou = true;
  }
  return mudou ? nova : null;
}

/* ---------- despesas adiantadas (Espaço do Espólio) ---------- */

export interface DespesaAdiantada {
  /** Quem adiantou (participanteId — herdeiro ou '__sobrevivente__'). */
  participanteId: string;
  descricao?: string;
  valor: number;
  /** ressarcir = o espólio devolve em dinheiro antes de partir;
   *  compensar = entra como crédito no quinhão. A conta líquida é a mesma —
   *  o rótulo muda a apresentação e a operacionalização. */
  tratamento: 'ressarcir' | 'compensar';
}

/* ---------- apuração do cenário ---------- */

export interface LinhaCenario {
  id: string;
  nome: string;
  /** Quinhão a que tem direito pela lei (R$). */
  direito: number;
  /** O que recebe em bens neste cenário (R$, pela avaliação lançada). */
  recebeEmBens: number;
  /** Acerto em DINHEIRO (título oneroso): positivo recebe, negativo paga. */
  acertoEmDinheiro: number;
  /** Título gratuito: o que este participante cede aos demais sem reposição
   *  (positivo = abre mão desse valor). */
  cedeGratuitamente: number;
  /** Despesas adiantadas: o que recebe de volta − a parte que lhe cabe no
   *  rateio de TODAS as reconhecidas. */
  reembolsoDespesas: number;
  abateDespesas: number;
  /** Valor final com que sai do cenário (bens + dinheiro + despesas). */
  total: number;
}

export interface ApuracaoCenario {
  /** Apuração técnica (posições, transferências, tributos) — null quando a
   *  matriz está inválida ou o caso não comporta apuração. */
  atribuicao: ResultadoAtribuicao | null;
  bloqueios: string[];
  avisos: string[];
  totalTorna: string;
  linhas: LinhaCenario[];
  totalDespesasReconhecidas: number;
}

export interface EntradaCenario {
  caso: Caso;
  resultado: Resultado;
  alocacoes: Alocacoes;
  /** Título da cessão dos desvios (GRATUITO = doação; ONEROSO = torna). */
  titulo?: TituloCessao;
  /** Isenção anual de doação por donatário em R$ (2.500 UFESPs em SP) —
   *  vem de fora porque a UFESP muda por exercício (motor puro). */
  isencaoDoacaoAnual?: number;
  /** Despesas adiantadas RECONHECIDAS pelo advogado. */
  despesas?: DespesaAdiantada[];
}

const round2 = (v: number) => Math.round(v * 100) / 100;

export function apurarCenario({
  caso,
  resultado,
  alocacoes,
  titulo = 'GRATUITO',
  isencaoDoacaoAnual,
  despesas = [],
}: EntradaCenario): ApuracaoCenario {
  const vazio: ApuracaoCenario = {
    atribuicao: null,
    bloqueios: [],
    avisos: [],
    totalTorna: '0.00',
    linhas: [],
    totalDespesasReconhecidas: 0,
  };
  if (resultado.bloqueios.length > 0 || caso.bens.length === 0) return vazio;
  const participantes = participantesDoResultado(resultado);
  if (participantes.length === 0) return vazio;

  const linhasMatriz = caso.bens.map((b, i) => {
    const linha = alocacoes[b.id] ?? {};
    const pcts = participantes.map((p) => pctNum(linha[p.id]));
    return { bem: b, indice: i, pcts, total: pcts.reduce((a, v) => a + v, 0) };
  });

  // Linha preenchida tem de fechar 100% (tolerância de dízima: ±0,05).
  const invalidas = linhasMatriz.filter((l) => l.total > 0 && Math.abs(l.total - 100) > 0.05);
  if (invalidas.length > 0) {
    return {
      ...vazio,
      bloqueios: invalidas.map(
        (l) =>
          `Bem ${l.indice + 1}: os percentuais somam ${l.total.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}% — a linha precisa fechar 100% (ou ficar toda vazia para seguir a proporção do direito).`,
      ),
    };
  }

  const direitoPorParticipante = direitosDoResultado(resultado);
  const direitoCents = new Map<string, number>();
  for (const [id, v] of Object.entries(direitoPorParticipante)) {
    direitoCents.set(id, Math.round(v * 100));
  }
  const totalCents = [...direitoCents.values()].reduce((a, v) => a + v, 0);
  if (totalCents <= 0) return vazio;

  const titularidades: TitularidadeBem[] = [];
  for (const l of linhasMatriz) {
    if (l.total === 0) {
      // Linha vazia: o bem segue a proporção EXATA do direito de cada um.
      for (const [id, cents] of direitoCents) {
        if (cents <= 0) continue;
        titularidades.push({
          bemId: l.bem.id,
          titularId: id,
          direito: 'PLENA',
          fracao: `${cents}/${totalCents}`,
        });
      }
      continue;
    }
    // Frações EXATAS normalizadas pela PRÓPRIA soma (o motor exige soma 1
    // por bem): "33,33" três vezes vira 3333/9999 = 1/3 de cada — a dízima
    // é absorvida na proporção, sem despejar o resto numa das partes.
    // Célula em fração ("1/3") já entra exata.
    const celulas = participantes.map((p) => fracaoDaCelula((alocacoes[l.bem.id] ?? {})[p.id]));
    const den = celulas.reduce((a, f) => (f.n > 0 ? mmc(a, f.d) : a), 1);
    const pesos = celulas.map((f) => (f.n > 0 ? f.n * (den / f.d) : 0));
    const somaPesos = pesos.reduce((a, v) => a + v, 0);
    participantes.forEach((p, i) => {
      if (pesos[i] > 0)
        titularidades.push({
          bemId: l.bem.id,
          titularId: p.id,
          direito: 'PLENA',
          fracao: `${pesos[i]}/${somaPesos}`,
        });
    });
  }

  const atribuicao = apurarAtribuicao(caso, resultado, {
    titularidades,
    titulosPorCedente: Object.fromEntries(participantes.map((p) => [p.id, titulo])),
    tabela: {
      ...TABELA_SP_2026,
      isencaoDoacaoAnualPorDonatario:
        isencaoDoacaoAnual !== undefined ? isencaoDoacaoAnual.toFixed(2) : undefined,
    },
  });

  /* --- leitura leiga: uma linha por participante --- */
  const totalDespesas = round2(despesas.reduce((a, d) => a + (Number(d.valor) || 0), 0));
  const linhas: LinhaCenario[] = participantes.map((p) => {
    const pos = atribuicao.posicoes.find((x) => x.titularId === p.id);
    const direito = pos ? Number(pos.valorDeDireito) : direitoPorParticipante[p.id] ?? 0;
    const recebeEmBens = pos ? Number(pos.valorAtribuido) : 0;
    const desvio = round2(direito - recebeEmBens);
    const acertoEmDinheiro = titulo === 'ONEROSO' ? desvio : 0;
    const cedeGratuitamente = titulo === 'GRATUITO' && desvio > 0 ? desvio : 0;
    const reembolsoDespesas = round2(
      despesas.filter((d) => d.participanteId === p.id).reduce((a, d) => a + (Number(d.valor) || 0), 0),
    );
    const abateDespesas =
      totalCents > 0 ? round2((totalDespesas * (direitoCents.get(p.id) ?? 0)) / totalCents) : 0;
    return {
      id: p.id,
      nome: p.nome,
      direito: round2(direito),
      recebeEmBens: round2(recebeEmBens),
      acertoEmDinheiro,
      cedeGratuitamente,
      reembolsoDespesas,
      abateDespesas,
      total: round2(recebeEmBens + acertoEmDinheiro + reembolsoDespesas - abateDespesas),
    };
  });

  return {
    atribuicao,
    bloqueios: atribuicao.bloqueios,
    avisos: atribuicao.avisos,
    totalTorna: atribuicao.totalTorna,
    linhas,
    totalDespesasReconhecidas: totalDespesas,
  };
}

/* ---------- validação com mensagens leigas ---------- */

const brl = (v: number) =>
  `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export interface ValidacaoCenario {
  bloqueios: string[];
  avisos: string[];
}

/**
 * Regras que a família não pode "combinar por fora": menor/incapaz não abre
 * mão de valor (bloqueio); adulto capaz pode ceder, mas o cenário AVISA em
 * linguagem leiga o quanto cada um estaria cedendo sem reposição.
 */
export function validarCenario(caso: Caso, apuracao: ApuracaoCenario): ValidacaoCenario {
  const bloqueios: string[] = [...apuracao.bloqueios];
  const avisos: string[] = [];
  const TOLERANCIA = 1; // R$ 1 de dízima não é cessão

  for (const linha of apuracao.linhas) {
    const cede = linha.direito - (linha.recebeEmBens + linha.acertoEmDinheiro);
    if (cede <= TOLERANCIA) continue;
    const herdeiro = caso.herdeiros.find((h) => h.id === linha.id);
    if (herdeiro?.menorOuIncapaz) {
      bloqueios.push(
        `${linha.nome} é menor ou incapaz e este cenário lhe dá ${brl(cede)} a menos do que a lei garante — a lei não permite que abra mão dessa diferença, nem com a concordância do representante (é preciso reposição ou novo desenho).`,
      );
    } else {
      avisos.push(
        `Neste cenário, ${linha.nome} recebe ${brl(cede)} a menos do que o cálculo legal lhe atribui. A diferença vale como cessão gratuita (doação) aos demais e só se sustenta com a concordância expressa dele(a).`,
      );
    }
  }
  return { bloqueios, avisos };
}

/* ---------- resumo em linguagem leiga (até 3 frases) ---------- */

export function resumoDoCenario(apuracao: ApuracaoCenario): string[] {
  if (apuracao.bloqueios.length > 0) {
    return ['Este cenário ainda não fecha — veja os pontos a corrigir acima.'];
  }
  if (apuracao.linhas.length === 0) return [];
  const frases: string[] = [];

  const maior = [...apuracao.linhas].sort((a, b) => b.recebeEmBens - a.recebeEmBens)[0];
  if (maior && maior.recebeEmBens > 0) {
    frases.push(
      `Neste cenário, ${maior.nome} fica com a maior parte dos bens (${brl(maior.recebeEmBens)}).`,
    );
  }

  const pagam = apuracao.linhas.filter((l) => l.acertoEmDinheiro < -1);
  const cedem = apuracao.linhas.filter((l) => l.cedeGratuitamente > 1);
  if (pagam.length > 0) {
    frases.push(
      `${pagam.map((l) => `${l.nome} repõe ${brl(-l.acertoEmDinheiro)}`).join('; ')} em dinheiro aos demais.`,
    );
  } else if (cedem.length > 0) {
    frases.push(
      `${cedem.map((l) => `${l.nome} cede ${brl(l.cedeGratuitamente)}`).join('; ')} sem reposição — vale como doação e depende da concordância de quem cede.`,
    );
  }

  if (apuracao.totalDespesasReconhecidas > 0) {
    frases.push(
      `As despesas adiantadas reconhecidas (${brl(apuracao.totalDespesasReconhecidas)}) entram na conta: quem pagou recebe de volta e o custo é dividido na proporção do direito de cada um.`,
    );
  } else if (pagam.length === 0 && cedem.length === 0) {
    frases.push('Com os acertos deste cenário, cada um termina com o valor a que tem direito.');
  }

  return frases.slice(0, 3);
}
