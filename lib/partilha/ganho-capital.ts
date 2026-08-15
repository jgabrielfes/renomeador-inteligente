/**
 * MÓDULO 1 — Simulador de Ganho de Capital do Espólio.
 *
 * Na transferência causa mortis, cada bem pode passar ao herdeiro pelo VALOR
 * DECLARADO (sem imposto agora, custo baixo → ganho maior na venda futura) ou
 * pelo VALOR DE MERCADO (tributa a diferença agora, custo "atualizado"). Este
 * motor compara os dois cenários bem a bem, aplica reduções (art. 18 da Lei
 * 7.713/88, FR1/FR2 da Lei 11.196/2005), isenções (único imóvel, pequeno
 * valor) e as alíquotas progressivas (Lei 13.259/2016), e recomenda. Motor
 * PURO (com testes). Estimativa de apoio — confirmar no caso concreto.
 */

import {
  DARF_GANHO_CAPITAL,
  FAIXAS_GANHO_CAPITAL,
  ISENCAO_UNICO_IMOVEL,
  PEQUENO_VALOR,
  fracaoAposArt18,
  mesesEntre,
} from './parametros-fiscais';

export type TipoBemGC = 'imovel' | 'veiculo' | 'participacao_societaria' | 'acoes' | 'outros';

export interface BemGanhoCapital {
  bemId: string;
  tipo: TipoBemGC;
  custoDeclarado: number;
  dataAquisicao: string; // ISO
  valorMercado: number;
  unicoImovel?: boolean;
  alienouImovelUltimos5Anos?: boolean;
  herdeiroPretendeVender?: boolean;
  /** Venda futura projetada (default = valor de mercado). */
  valorVendaProjetado?: number | null;
  /** Data estimada da venda futura (habilita FR2 futuro). */
  dataVendaEstimada?: string | null;
}

export interface EntradaGanhoCapital {
  bens: BemGanhoCapital[];
  /** Data da transferência causa mortis (fim do período do FR2), ISO. */
  dataTransferencia: string;
}

export type RecomendacaoGC = 'ATUALIZAR_SEM_CUSTO' | 'ATUALIZAR_COMPENSA' | 'MANTER_DECLARADO';

export interface ResultadoBemGC {
  bemId: string;
  cenarioA: { impostoAgora: number; custoHerdado: number; impostoFuturoProjetado: number };
  cenarioB: {
    ganhoBruto: number;
    reducoesAplicadas: string[];
    isencoesAplicadas: string[];
    ganhoTributavel: number;
    impostoAgora: number;
    custoHerdado: number;
    impostoFuturoProjetado: number;
  };
  recomendacao: RecomendacaoGC;
  economiaEstimada: number;
  alertas: string[];
}

export interface ResultadoGanhoCapital {
  porBem: ResultadoBemGC[];
  resumo: {
    impostoAgoraSeTudoMercado: number;
    impostoFuturoSeTudoDeclarado: number;
    mixOtimo: { impostoAgora: number; impostoFuturo: number; economiaVsPiorCenario: number };
    darf: typeof DARF_GANHO_CAPITAL;
  };
}

const r2 = (v: number) => Math.round(v * 100) / 100;

/** Imposto pela tabela progressiva do ganho (cada faixa sobre sua parcela). */
export function impostoGanhoProgressivo(ganho: number): number {
  if (ganho <= 0) return 0;
  let imposto = 0;
  let piso = 0;
  for (const f of FAIXAS_GANHO_CAPITAL) {
    const teto = f.ate ?? Infinity;
    const naFaixa = Math.min(Math.max(0, ganho - piso), teto - piso);
    imposto += naFaixa * f.aliquota;
    piso = teto;
    if (ganho <= teto) break;
  }
  return r2(imposto);
}

/**
 * Reduções encadeadas para IMÓVEIS (art. 18 → FR1 → FR2). Devolve o ganho
 * tributável e as etiquetas das reduções que efetivamente incidiram.
 */
function reduzirImovel(
  ganho: number,
  dataAquisicao: string,
  dataAlienacao: string,
): { ganhoTributavel: number; reducoes: string[] } {
  const reducoes: string[] = [];
  const anoAq = Number(dataAquisicao.slice(0, 4));

  // 1) art. 18 da Lei 7.713/88 (aquisição até 1988).
  const frac = fracaoAposArt18(anoAq);
  if (anoAq <= 1988) reducoes.push('art18_L7713');
  let ganhoAtual = ganho * frac;

  // 2) FR1 = 1/1,0060^m1 (01/1996 ou aquisição posterior → 11/2005).
  if (dataAquisicao <= '2005-11-30') {
    const inicio1 = dataAquisicao > '1996-01-01' ? dataAquisicao : '1996-01-01';
    const m1 = mesesEntre(inicio1, '2005-11-30');
    if (m1 > 0) {
      ganhoAtual *= 1 / Math.pow(1.006, m1);
      reducoes.push('FR1');
    }
  }

  // 3) FR2 = 1/1,0035^m2 (12/2005 ou aquisição posterior a 11/2005 → alienação).
  const inicio2 = dataAquisicao > '2005-11-30' ? dataAquisicao : '2005-12-01';
  const m2 = mesesEntre(inicio2, dataAlienacao);
  if (m2 > 0) {
    ganhoAtual *= 1 / Math.pow(1.0035, m2);
    reducoes.push('FR2');
  }

  return { ganhoTributavel: r2(Math.max(0, ganhoAtual)), reducoes };
}

/** Isenções por bem (único imóvel, pequeno valor). */
function isencoesDoBem(bem: BemGanhoCapital): { isento: boolean; etiquetas: string[]; alertas: string[] } {
  const etiquetas: string[] = [];
  const alertas: string[] = [];

  // Único imóvel ≤ R$ 440 mil, sem outra alienação de imóvel em 5 anos.
  if (
    bem.tipo === 'imovel' &&
    bem.unicoImovel &&
    bem.valorMercado <= ISENCAO_UNICO_IMOVEL &&
    !bem.alienouImovelUltimos5Anos
  ) {
    etiquetas.push('unico_imovel_art23_L9250');
    alertas.push(
      'Isenção do único imóvel (≤ R$ 440 mil): a aplicabilidade à transferência causa mortis a valor de mercado é aceita pela RFB por equiparação — recomenda-se confirmação no caso concreto.',
    );
    return { isento: true, etiquetas, alertas };
  }

  // Pequeno valor: alienações do mesmo tipo no mês ≤ 20k (ações) / 35k (geral).
  const limite = bem.tipo === 'acoes' ? PEQUENO_VALOR.acoes : PEQUENO_VALOR.geral;
  if (bem.valorMercado <= limite) {
    etiquetas.push('pequeno_valor');
    return { isento: true, etiquetas, alertas };
  }

  return { isento: false, etiquetas, alertas };
}

/**
 * Ganho tributável e reduções de UMA venda (agora ou futura). Para o imóvel,
 * a alienação futura NÃO reaplica art. 18/FR1; FR2 futuro só entra com a data
 * estimada informada.
 */
function ganhoDaVenda(
  bem: BemGanhoCapital,
  valorVenda: number,
  custoBase: number,
  dataAlienacao: string,
  futura: boolean,
): { ganhoTributavel: number; reducoes: string[] } {
  const ganhoBruto = valorVenda - custoBase;
  if (ganhoBruto <= 0) return { ganhoTributavel: 0, reducoes: [] };
  if (bem.tipo !== 'imovel') return { ganhoTributavel: r2(ganhoBruto), reducoes: [] };
  if (!futura) return reduzirImovel(ganhoBruto, bem.dataAquisicao, dataAlienacao);
  // Futura: sem art. 18/FR1; FR2 só com a data estimada.
  if (bem.dataVendaEstimada) {
    const m2 = mesesEntre(bem.dataAquisicao > '2005-11-30' ? bem.dataAquisicao : '2005-12-01', bem.dataVendaEstimada);
    const fr2 = m2 > 0 ? 1 / Math.pow(1.0035, m2) : 1;
    return { ganhoTributavel: r2(ganhoBruto * fr2), reducoes: m2 > 0 ? ['FR2'] : [] };
  }
  return { ganhoTributavel: r2(ganhoBruto), reducoes: [] };
}

function simularBem(bem: BemGanhoCapital, dataTransferencia: string): ResultadoBemGC {
  const ganhoBruto = r2(bem.valorMercado - bem.custoDeclarado);
  const vendaProjetada = bem.valorVendaProjetado ?? bem.valorMercado;
  const dataVendaFutura = bem.dataVendaEstimada ?? dataTransferencia;
  const alertas: string[] = [];

  // --- cenário B: transferir pelo valor de mercado ---
  const isen = isencoesDoBem(bem);
  alertas.push(...isen.alertas);
  let ganhoTributavelB = 0;
  let reducoesB: string[] = [];
  if (ganhoBruto > 0 && !isen.isento) {
    const red = ganhoDaVenda(bem, bem.valorMercado, bem.custoDeclarado, dataTransferencia, false);
    ganhoTributavelB = red.ganhoTributavel;
    reducoesB = red.reducoes;
    // Imóvel adquirido até 1969: reduzido a 0 pelo art. 18 → exibir como isento.
    if (bem.tipo === 'imovel' && Number(bem.dataAquisicao.slice(0, 4)) <= 1969 && ganhoTributavelB === 0) {
      isen.etiquetas.push('art18_reducao_100');
    }
  }
  const impostoAgoraB = isen.isento ? 0 : impostoGanhoProgressivo(ganhoTributavelB);
  const custoHerdadoB = bem.valorMercado;
  const futuroB = ganhoDaVenda(bem, vendaProjetada, custoHerdadoB, dataVendaFutura, true);
  const impostoFuturoB = impostoGanhoProgressivo(futuroB.ganhoTributavel);

  // --- cenário A: transferir pelo valor declarado ---
  const custoHerdadoA = bem.custoDeclarado;
  const futuroA = ganhoDaVenda(bem, vendaProjetada, custoHerdadoA, dataVendaFutura, true);
  const impostoFuturoA = impostoGanhoProgressivo(futuroA.ganhoTributavel);

  const custoTotalA = impostoFuturoA; // imposto agora em A é sempre 0
  const custoTotalB = impostoAgoraB + impostoFuturoB;

  // --- recomendação (R7) ---
  let recomendacao: RecomendacaoGC;
  if (ganhoBruto < 0) {
    recomendacao = 'MANTER_DECLARADO';
    alertas.push('Valor de mercado ABAIXO do declarado: atualizar rebaixaria o custo do herdeiro — desvantajoso.');
  } else if (impostoAgoraB === 0) {
    recomendacao = 'ATUALIZAR_SEM_CUSTO';
  } else if (!bem.herdeiroPretendeVender) {
    recomendacao = 'MANTER_DECLARADO';
  } else if (custoTotalB < custoTotalA) {
    recomendacao = 'ATUALIZAR_COMPENSA';
  } else {
    recomendacao = 'MANTER_DECLARADO';
  }

  const economiaEstimada = bem.herdeiroPretendeVender
    ? r2(Math.abs(custoTotalA - custoTotalB))
    : recomendacao === 'ATUALIZAR_SEM_CUSTO'
      ? 0
      : 0;

  return {
    bemId: bem.bemId,
    cenarioA: { impostoAgora: 0, custoHerdado: r2(custoHerdadoA), impostoFuturoProjetado: impostoFuturoA },
    cenarioB: {
      ganhoBruto,
      reducoesAplicadas: reducoesB,
      isencoesAplicadas: isen.etiquetas,
      ganhoTributavel: ganhoTributavelB,
      impostoAgora: impostoAgoraB,
      custoHerdado: r2(custoHerdadoB),
      impostoFuturoProjetado: impostoFuturoB,
    },
    recomendacao,
    economiaEstimada,
    alertas,
  };
}

export function simularGanhoCapital(entrada: EntradaGanhoCapital): ResultadoGanhoCapital {
  const porBem = entrada.bens.map((b) => simularBem(b, entrada.dataTransferencia));

  const impostoAgoraSeTudoMercado = r2(porBem.reduce((a, r) => a + r.cenarioB.impostoAgora, 0));
  const impostoFuturoSeTudoDeclarado = r2(porBem.reduce((a, r) => a + r.cenarioA.impostoFuturoProjetado, 0));

  let mixAgora = 0;
  let mixFuturo = 0;
  let melhor = 0;
  let pior = 0;
  for (const r of porBem) {
    const custoA = r.cenarioA.impostoFuturoProjetado;
    const custoB = r.cenarioB.impostoAgora + r.cenarioB.impostoFuturoProjetado;
    if (custoB <= custoA) {
      mixAgora += r.cenarioB.impostoAgora;
      mixFuturo += r.cenarioB.impostoFuturoProjetado;
    } else {
      mixFuturo += r.cenarioA.impostoFuturoProjetado;
    }
    melhor += Math.min(custoA, custoB);
    pior += Math.max(custoA, custoB);
  }

  return {
    porBem,
    resumo: {
      impostoAgoraSeTudoMercado,
      impostoFuturoSeTudoDeclarado,
      mixOtimo: {
        impostoAgora: r2(mixAgora),
        impostoFuturo: r2(mixFuturo),
        economiaVsPiorCenario: r2(pior - melhor),
      },
      darf: DARF_GANHO_CAPITAL,
    },
  };
}
