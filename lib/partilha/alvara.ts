/**
 * MÓDULO 3 — Detector de Alvará Simplificado (Lei 6.858/80).
 *
 * Roda sobre o acervo (etapa II) e diz quando o inventário é DESNECESSÁRIO:
 * verbas trabalhistas/FGTS/PIS saem por habilitação no INSS; saldos, poupança,
 * fundos e restituição de IR podem sair por alvará quando NÃO há outros bens
 * e o total cabe em 500 OTN. Motor PURO (com testes) + mini-parecer.
 */

import { TETO_ALVARA_500_OTN } from './parametros-fiscais';

export type SubtipoFinanceiro =
  | 'saldo_bancario'
  | 'poupanca'
  | 'fundo'
  | 'restituicao_ir'
  | 'fgts'
  | 'pis_pasep'
  | 'verba_trabalhista';

export interface ItemAcervoAlvara {
  descricao: string;
  valor: number;
  /** Ausente = bem sujeito a inventário (imóvel, veículo, quotas…). */
  subtipo?: SubtipoFinanceiro;
}

export interface EntradaAlvara {
  itens: ItemAcervoAlvara[];
  existemDependentesInss: boolean;
  /** Teto das 500 OTN — configurável por comarca (default documentado). */
  valor500Otn?: number;
}

export type ConclusaoAlvara =
  | 'DISPENSA_TOTAL'
  | 'ALVARA_SIMPLIFICADO'
  | 'INVENTARIO_COM_PARALELO'
  | 'INVENTARIO_COMUM';

export interface ResultadoAlvara {
  conclusao: ConclusaoAlvara;
  titulo: string;
  /** Mini-parecer exportável, parágrafo a parágrafo. */
  parecer: string[];
  /** Verbas do art. 1º (FGTS/PIS/verbas) — saque por habilitação no INSS. */
  totalVerbasHabilitacao: number;
  /** Valores do art. 2º (saldo/poupança/fundo/restituição de IR). */
  totalFinanceiroArt2: number;
  /** Bens que exigem inventário (imóveis, veículos, quotas…). */
  totalOutrosBens: number;
  tetoAdotado: number;
  alertas: string[];
}

const VERBAS_HABILITACAO: SubtipoFinanceiro[] = ['fgts', 'pis_pasep', 'verba_trabalhista'];
const FINANCEIRO_ART2: SubtipoFinanceiro[] = ['saldo_bancario', 'poupanca', 'fundo', 'restituicao_ir'];

const r2 = (v: number) => Math.round(v * 100) / 100;
const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export function detectarAlvara(entrada: EntradaAlvara): ResultadoAlvara {
  const teto = entrada.valor500Otn ?? TETO_ALVARA_500_OTN.valorDefault;
  const positivos = entrada.itens.filter((i) => i.valor > 0);

  const verbas = positivos.filter((i) => i.subtipo && VERBAS_HABILITACAO.includes(i.subtipo));
  const financeiro = positivos.filter((i) => i.subtipo && FINANCEIRO_ART2.includes(i.subtipo));
  const outros = positivos.filter((i) => !i.subtipo || (!VERBAS_HABILITACAO.includes(i.subtipo) && !FINANCEIRO_ART2.includes(i.subtipo)));

  const totalVerbas = r2(verbas.reduce((a, i) => a + i.valor, 0));
  const totalFin = r2(financeiro.reduce((a, i) => a + i.valor, 0));
  const totalOutros = r2(outros.reduce((a, i) => a + i.valor, 0));

  const alertaTeto = `Teto adotado: ${brl(teto)} (500 OTN). ${TETO_ALVARA_500_OTN.nota}`;
  const alertaInss = entrada.existemDependentesInss
    ? 'Dependentes habilitados no INSS: saque direto no banco/CEF.'
    : 'Sem dependentes habilitados no INSS — o levantamento é pelos sucessores indicados em alvará.';

  const base = { totalVerbasHabilitacao: totalVerbas, totalFinanceiroArt2: totalFin, totalOutrosBens: totalOutros, tetoAdotado: r2(teto) };

  // Há bens que exigem inventário (imóvel, veículo, quotas…): a via patrimonial
  // é o inventário/arrolamento — mas as verbas do art. 1º saem em paralelo.
  if (outros.length > 0) {
    const comVerbas = verbas.length > 0;
    return {
      ...base,
      conclusao: comVerbas ? 'INVENTARIO_COM_PARALELO' : 'INVENTARIO_COMUM',
      titulo: comVerbas
        ? 'Inventário necessário — verbas da Lei 6.858/80 podem sair em paralelo'
        : 'Inventário/arrolamento comum',
      parecer: [
        `Há ${outros.length} bem(ns) sujeito(s) a inventário (${brl(totalOutros)}) — o acervo não se enquadra na dispensa da Lei 6.858/80.`,
        totalFin > 0
          ? `Os valores financeiros (${brl(totalFin)}) NÃO podem sair por alvará simplificado: o art. 2º exige que não existam outros bens a inventariar — eles são arrolados junto.`
          : '',
        comVerbas
          ? `As verbas trabalhistas/FGTS/PIS (${brl(totalVerbas)}) são pagas independentemente de inventário (Lei 6.858/80, art. 1º) e podem ser levantadas em paralelo. ${alertaInss}`
          : '',
      ].filter(Boolean),
      alertas: comVerbas ? [alertaInss] : [],
    };
  }

  // Só verbas do art. 1º: dispensa total.
  if (financeiro.length === 0 && verbas.length > 0) {
    return {
      ...base,
      conclusao: 'DISPENSA_TOTAL',
      titulo: 'DISPENSA TOTAL de inventário — saque com habilitação no INSS',
      parecer: [
        `O acervo é composto SÓ por verbas trabalhistas, FGTS e PIS/PASEP (${brl(totalVerbas)}).`,
        `Essas verbas são pagas aos dependentes habilitados perante a Previdência, independentemente de inventário ou arrolamento (Lei 6.858/80, art. 1º). ${alertaInss}`,
        'Saque diretamente na Caixa Econômica Federal (FGTS/PIS) e no órgão pagador (verbas), com a certidão de dependentes do INSS.',
      ],
      alertas: [],
    };
  }

  // Só financeiro do art. 2º (com ou sem verbas do art. 1º em paralelo).
  if (financeiro.length > 0) {
    const cabe = totalFin <= teto;
    const comVerbas = verbas.length > 0;
    if (cabe) {
      return {
        ...base,
        conclusao: 'ALVARA_SIMPLIFICADO',
        titulo: 'ALVARÁ JUDICIAL SIMPLIFICADO — inventário desnecessário',
        parecer: [
          `Os valores financeiros (${brl(totalFin)}) cabem em 500 OTN e não há outros bens a inventariar: podem ser levantados por alvará judicial simplificado (Lei 6.858/80, art. 2º), sem abrir inventário.`,
          comVerbas
            ? `Além deles, as verbas de FGTS/PIS/trabalhistas (${brl(totalVerbas)}) saem por habilitação no INSS, em paralelo. ${alertaInss}`
            : '',
          'Economia direta ao cliente: sem custas de inventário, escritura ou ITCMD sobre esses valores.',
        ].filter(Boolean),
        alertas: [alertaTeto],
      };
    }
    return {
      ...base,
      conclusao: 'INVENTARIO_COMUM',
      titulo: 'Inventário/arrolamento comum — financeiro acima do teto',
      parecer: [
        `Os valores financeiros (${brl(totalFin)}) ULTRAPASSAM o teto de 500 OTN (${brl(teto)}): não cabem no alvará simplificado do art. 2º — a via é o arrolamento/inventário.`,
        comVerbas
          ? `As verbas de FGTS/PIS/trabalhistas (${brl(totalVerbas)}) seguem por habilitação no INSS, em paralelo. ${alertaInss}`
          : '',
      ].filter(Boolean),
      alertas: [alertaTeto],
    };
  }

  // Acervo vazio (nada positivo lançado).
  return {
    ...base,
    conclusao: 'INVENTARIO_COMUM',
    titulo: 'Sem valores lançados',
    parecer: ['Lance os itens do acervo (etapa II) com seus subtipos para o detector concluir.'],
    alertas: [],
  };
}

export const ROTULOS_SUBTIPO_ALVARA: Record<SubtipoFinanceiro, string> = {
  saldo_bancario: 'Saldo em conta bancária',
  poupanca: 'Poupança',
  fundo: 'Fundo de investimento',
  restituicao_ir: 'Restituição de Imposto de Renda',
  fgts: 'FGTS',
  pis_pasep: 'PIS/PASEP',
  verba_trabalhista: 'Verbas trabalhistas',
};
