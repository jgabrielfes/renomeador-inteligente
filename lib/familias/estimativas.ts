/**
 * Estimativas da área "Para famílias" — MOTOR PURO (a data de hoje entra por
 * parâmetro; nada de relógio aqui).
 *
 * A regra de ouro é a HONESTIDADE da precisão:
 *  - Base em SÃO PAULO → o MOTOR REAL do módulo (lib/partilha/itcmd.ts para o
 *    imposto com atualização/multas/Selic; lib/partilha/custas.ts para
 *    escritura/registros/taxa judiciária, tabelas oficiais 2026).
 *  - Base em OUTRA UF → FAIXA pela tabela de alíquotas (itcmd-uf.ts) e, nas
 *    custas, a tabela paulista como referência com margem — sempre com aviso.
 *
 * Competência do ITCMD (CF, art. 155, §1º): IMÓVEL paga na UF do imóvel;
 * bens móveis (dinheiro, veículos, quotas) pagam na UF onde corre o
 * inventário (aqui: o domicílio do falecido).
 */

import { provisionarItcmd } from '@/lib/partilha/itcmd';
import { projetarCustos } from '@/lib/partilha/custas';
import { ufespDoAno } from '@/lib/partilha/itcmd';
import { estimarItcmdUf } from './itcmd-uf';
import { faixaDoAcervo, type ViaIndicada } from './triagem';
import { LIMITES_FAIXA, type RespostasFamilia } from './tipos';

export interface FaixaEstimada {
  min: number;
  max: number;
}

export interface EstimativaItcmdPorUf {
  uf: string;
  faixa: FaixaEstimada;
  /** 'motor-sp' = cálculo do módulo (SP); 'tabela-uf' = faixa por alíquota. */
  precisao: 'motor-sp' | 'tabela-uf';
  avisos: string[];
}

export interface EstimativaCompleta {
  /** Acervo declarado (soma das faixas). */
  acervo: FaixaEstimada;
  /** ITCMD por UF competente (imóvel na UF dele; móveis no domicílio). */
  itcmd: EstimativaItcmdPorUf[];
  itcmdTotal: FaixaEstimada;
  /** Escritura+registros (extrajudicial) OU custas judiciais. */
  custos: {
    rotulo: string;
    faixa: FaixaEstimada;
    precisao: 'tabelas-sp' | 'referencia-sp';
    avisos: string[];
  };
  /** Prazos e multa de abertura. */
  prazo: {
    limiteAbertura: string; // óbito + 60 dias (CPC art. 611)
    aberturaVencida: boolean;
    texto: string;
  };
  avisos: string[];
}

const somarDias = (data: string, dias: number): string => {
  const [a, m, d] = data.split('-').map(Number);
  return new Date(Date.UTC(a, m - 1, d) + dias * 86_400_000).toISOString().slice(0, 10);
};

const somarMeses = (data: string, meses: number): string => {
  const [a, m, d] = data.split('-').map(Number);
  return new Date(Date.UTC(a, m - 1 + meses, d)).toISOString().slice(0, 10);
};

/** Reparte o acervo por UF competente: imóveis nas UFs deles (em partes
 *  iguais entre as listadas), o resto no domicílio do falecido. */
function basesPorUf(r: RespostasFamilia): Map<string, FaixaEstimada> {
  const mapa = new Map<string, FaixaEstimada>();
  const somar = (uf: string, min: number, max: number) => {
    const atual = mapa.get(uf) ?? { min: 0, max: 0 };
    mapa.set(uf, { min: atual.min + min, max: atual.max + max });
  };
  if (r.bens.imoveis) {
    const f = LIMITES_FAIXA[r.bens.imoveis];
    const ufs = r.bens.imoveisUfs.length > 0 ? r.bens.imoveisUfs : [r.ufFalecido];
    for (const uf of ufs) somar(uf, f.min / ufs.length, f.max / ufs.length);
  }
  let moveisMin = 0;
  let moveisMax = 0;
  for (const fx of [r.bens.veiculos, r.bens.financeiro, r.bens.outros]) {
    if (!fx) continue;
    moveisMin += LIMITES_FAIXA[fx].min;
    moveisMax += LIMITES_FAIXA[fx].max;
  }
  if (moveisMin > 0 || moveisMax > 0) somar(r.ufFalecido, moveisMin, moveisMax);
  return mapa;
}

/** ITCMD de SP pelo MOTOR REAL: totais (imposto + atualização + encargos
 *  projetados até hoje) para as pontas da faixa. */
function itcmdSp(base: FaixaEstimada, dataObito: string, hoje: string): EstimativaItcmdPorUf {
  const min = provisionarItcmd({ dataObito, dataReferencia: hoje, baseCalculo: base.min });
  const max = provisionarItcmd({ dataObito, dataReferencia: hoje, baseCalculo: base.max });
  const avisos = [
    'São Paulo: cálculo pelo mesmo motor da ferramenta profissional (Lei 10.705/2000) — atualização pela UFESP até o vencimento e, se houver atraso, multas e juros projetados até hoje.',
  ];
  if (min.diasDeAtraso > 0) {
    avisos.push(
      'O prazo de 180 dias do óbito para recolher já passou — a faixa acima JÁ INCLUI a multa e os juros projetados. Quanto antes regularizar, menor a conta.',
    );
  }
  avisos.push(
    'A conta parte do valor declarado por faixa e não aplica isenções (art. 6º) — com os valores reais, o número fecha melhor e pode cair.',
  );
  return {
    uf: 'SP',
    faixa: { min: Math.round(min.total), max: Math.round(max.total) },
    precisao: 'motor-sp',
    avisos,
  };
}

export function estimarCustos(r: RespostasFamilia, hoje: string, via: ViaIndicada): EstimativaCompleta {
  const avisos: string[] = [
    'Todos os números são ESTIMATIVAS por faixa, para orientar a conversa — não substituem o cálculo com os valores reais dos bens.',
  ];
  const acervo = faixaDoAcervo(r);

  /* ---------- ITCMD por UF competente ---------- */
  const itcmd: EstimativaItcmdPorUf[] = [];
  for (const [uf, base] of basesPorUf(r)) {
    if (uf === 'SP' && r.dataObito) {
      itcmd.push(itcmdSp(base, r.dataObito, hoje));
    } else {
      const e = estimarItcmdUf(uf, base);
      if (e) itcmd.push({ uf, faixa: { min: e.min, max: e.max }, precisao: 'tabela-uf', avisos: e.avisos });
    }
  }
  if (r.vinculo !== 'nao') {
    avisos.push(
      'Se havia cônjuge ou companheiro(a) com direito à meação, METADE dos bens comuns já é dele(a) e não paga imposto — a estimativa acima usa o total declarado, então o número real tende a ser MENOR.',
    );
  }
  const itcmdTotal = itcmd.reduce(
    (t, e) => ({ min: t.min + e.faixa.min, max: t.max + e.faixa.max }),
    { min: 0, max: 0 },
  );

  /* ---------- escritura/registros × custas judiciais (referência SP) ---------- */
  const anoHoje = Number(hoje.slice(0, 4));
  const ufesp = ufespDoAno(anoHoje).valor;
  const rito = via === 'JUDICIAL' ? ('JUDICIAL' as const) : ('EXTRAJUDICIAL' as const);
  const qtdImoveis = r.bens.imoveis ? Math.max(1, r.bens.imoveisUfs.length) : 0;
  const projetar = (base: number) =>
    projetarCustos({
      monteMor: base,
      baseEscritura: base,
      qtdRenunciantes: 0,
      sucessoes: [],
      imoveis: Array.from({ length: qtdImoveis }, (_, i) => ({
        descricao: `Imóvel ${i + 1}`,
        valor: base > 0 && qtdImoveis > 0 && r.bens.imoveis
          ? LIMITES_FAIXA[r.bens.imoveis].max / qtdImoveis
          : 0,
      })),
      rito,
      qtdHerdeiros: Math.max(1, r.qtdHerdeiros),
      temSobrevivente: r.vinculo !== 'nao',
      transferencias: [],
      ufesp,
    }).total;
  const custoMin = projetar(acervo.min);
  const custoMax = projetar(acervo.max);
  const foraDeSp = r.ufFalecido !== 'SP';
  const custos: EstimativaCompleta['custos'] = {
    rotulo:
      via === 'JUDICIAL'
        ? 'Custas judiciais e certidões (sem honorários)'
        : via === 'ALVARA'
          ? 'Custas do pedido de alvará e certidões (sem honorários)'
          : 'Escritura em cartório, registros e certidões (sem honorários)',
    faixa:
      via === 'ALVARA'
        ? { min: 500, max: 3_000 }
        : foraDeSp
          ? { min: Math.round(custoMin * 0.7), max: Math.round(custoMax * 1.3) }
          : { min: Math.round(custoMin), max: Math.round(custoMax) },
    precisao: foraDeSp && via !== 'ALVARA' ? 'referencia-sp' : 'tabelas-sp',
    avisos:
      via === 'ALVARA'
        ? ['O alvará dispensa escritura e registros — a faixa cobre custas judiciais e certidões típicas.']
        : foraDeSp
          ? [
              `As tabelas de cartório e custas variam por estado — a faixa usa a tabela de São Paulo como referência, com margem de 30%. Confirme os valores de ${r.ufFalecido} com um advogado local.`,
            ]
          : [
              'Valores pelas tabelas oficiais paulistas de 2026 (emolumentos de notas e registro; taxa judiciária da Lei 11.608/2003 quando judicial).',
            ],
  };
  if (via !== 'ALVARA') {
    custos.avisos.push(
      'A faixa não inclui honorários de advogado — eles são combinados diretamente com o profissional.',
    );
  }

  /* ---------- prazos ---------- */
  const limiteAbertura = r.dataObito ? somarDias(r.dataObito, 60) : '';
  const aberturaVencida = limiteAbertura !== '' && limiteAbertura < hoje;
  const prazo = {
    limiteAbertura,
    aberturaVencida,
    texto: aberturaVencida
      ? 'O prazo legal de 60 dias para abrir o inventário (CPC, art. 611) já passou. Isso NÃO impede nada — mas em vários estados gera multa no imposto (em SP, 10% a 20%), e ela cresce com o tempo. Começar agora estanca o problema.'
      : 'A lei dá 60 dias do falecimento para abrir o inventário (CPC, art. 611). Abrindo dentro do prazo, a família evita a multa que vários estados cobram no imposto.',
  };

  return { acervo, itcmd, itcmdTotal, custos, prazo, avisos };
}

/* ---------- comparador "resolver agora × adiar" ---------- */

export interface CenarioMomento {
  rotulo: string;
  /** Data de referência do cenário (hoje, +6 meses, +12 meses). */
  data: string;
  /** ITCMD projetado (imposto + atualização + multas + juros) até a data. */
  itcmd: FaixaEstimada;
}

export interface ComparadorCenarios {
  aplicavel: boolean;
  motivoNaoAplicavel?: string;
  cenarios: CenarioMomento[];
  avisos: string[];
}

/**
 * Quanto custa ADIAR: o ITCMD da parte paulista projetado hoje, daqui a 6 e
 * daqui a 12 meses — o MESMO motor da provisão (Lei 10.705/2000: atualização
 * pela UFESP até o vencimento; depois, multas dos arts. 19/21 e juros pela
 * Selic estimada). Bens fora de SP ficam fora da conta, com aviso — projetar
 * encargos de outra UF com a lei paulista seria mentir com números.
 */
export function compararCenarios(r: RespostasFamilia, hoje: string): ComparadorCenarios {
  const avisos: string[] = [
    'Enquanto o inventário não sai, contas podem ficar bloqueadas e imóveis e veículos não podem ser vendidos — adiar também tem esse custo, além do imposto.',
  ];
  if (!r.dataObito) {
    return {
      aplicavel: false,
      motivoNaoAplicavel: 'Sem a data do falecimento não dá para projetar os encargos.',
      cenarios: [],
      avisos,
    };
  }
  const bases = basesPorUf(r);
  const baseSp = bases.get('SP');
  const outras = [...bases.keys()].filter((uf) => uf !== 'SP');
  if (!baseSp || baseSp.max <= 0) {
    return {
      aplicavel: false,
      motivoNaoAplicavel:
        'A projeção de multas e juros usa a lei paulista — para bens fora de São Paulo, um(a) advogado(a) local projeta pela lei do estado. A regra geral vale em todo lugar: quanto mais tarde, maior a conta.',
      cenarios: [],
      avisos,
    };
  }
  if (outras.length > 0) {
    avisos.push(
      `A comparação cobre só a parte paulista — os bens em ${outras.join(', ')} têm encargos próprios por lá.`,
    );
  }
  const rotulos = ['Se resolver agora', 'Se adiar 6 meses', 'Se adiar 12 meses'];
  const cenarios = [0, 6, 12].map((meses, i) => {
    const data = meses === 0 ? hoje : somarMeses(hoje, meses);
    const min = provisionarItcmd({ dataObito: r.dataObito, dataReferencia: data, baseCalculo: baseSp.min });
    const max = provisionarItcmd({ dataObito: r.dataObito, dataReferencia: data, baseCalculo: baseSp.max });
    return {
      rotulo: rotulos[i],
      data,
      itcmd: { min: Math.round(min.total), max: Math.round(max.total) },
    };
  });
  avisos.push(
    'Os juros do atraso usam a Selic estimada pela meta atual — o número oficial pode variar um pouco. Estimativa informativa, a confirmar com advogado(a).',
  );
  return { aplicavel: true, cenarios, avisos };
}
