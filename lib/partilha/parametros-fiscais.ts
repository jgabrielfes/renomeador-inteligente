/**
 * Parâmetros fiscais VERSIONADOS dos módulos de planejamento (ganho de
 * capital, declaração final, alvará, radar) — mesma arquitetura das tabelas
 * do ITCMD (UFESP/Selic): valores de referência ficam AQUI, com a fonte
 * legal, nunca espalhados no código. Todo valor é estimativa de APOIO ao
 * profissional, sujeita a confirmação no caso concreto.
 */

/** Isenção do único imóvel na alienação (art. 23 da Lei 9.250/95). */
export const ISENCAO_UNICO_IMOVEL = 440_000;

/**
 * Bens de pequeno valor isentos de ganho de capital, por alienações do MESMO
 * tipo no mês (art. 22 da Lei 9.250/95, red. Lei 11.196/2005).
 */
export const PEQUENO_VALOR = {
  /** Ações negociadas em bolsa (balcão). */
  acoes: 20_000,
  /** Demais bens e direitos. */
  geral: 35_000,
};

/**
 * Alíquotas PROGRESSIVAS do ganho de capital (art. 21 da Lei 8.981/95, red.
 * Lei 13.259/2016): cada faixa incide sobre a parcela do ganho nela contida.
 */
export const FAIXAS_GANHO_CAPITAL: { ate: number | null; aliquota: number }[] = [
  { ate: 5_000_000, aliquota: 0.15 },
  { ate: 10_000_000, aliquota: 0.175 },
  { ate: 30_000_000, aliquota: 0.2 },
  { ate: null, aliquota: 0.225 },
];

/**
 * Redução do art. 18 da Lei 7.713/88 (imóveis adquiridos ATÉ 1988): percentual
 * de redução do ganho, 100% para aquisição até 1969, caindo 5% ao ano até 5%
 * em 1988. Devolve a fração do ganho que PERMANECE tributável (0 = isento).
 */
export function fracaoAposArt18(anoAquisicao: number): number {
  if (anoAquisicao <= 1969) return 0; // redução de 100%
  if (anoAquisicao >= 1989) return 1; // fora do alcance do art. 18
  const reducaoPct = 100 - 5 * (anoAquisicao - 1969); // 1970→95%, 1988→5%
  return (100 - reducaoPct) / 100;
}

/** Fatores de redução da Lei 11.196/2005 (art. 40) — taxas mensais. */
export const FATOR_REDUCAO = {
  /** FR1 = 1/1,0060^m1 (período até nov/2005). */
  fr1MensalBase: 1.006,
  /** FR2 = 1/1,0035^m2 (período a partir de dez/2005). */
  fr2MensalBase: 1.0035,
};

/** DARF do ganho de capital do espólio na transferência causa mortis. */
export const DARF_GANHO_CAPITAL = {
  codigo: '4600',
  contribuinte: 'espólio' as const,
  vencimento: 'data prevista para a entrega da Declaração Final de Espólio',
};

/**
 * 500 OTN — teto do alvará simplificado (art. 2º da Lei 6.858/80). A OTN foi
 * extinta e a conversão VARIA por tribunal/comarca; este é um default
 * documentado, sempre exibido com alerta de confirmação no juízo local.
 */
export const TETO_ALVARA_500_OTN = {
  /** Valor default adotado (R$) — parâmetro configurável por comarca. */
  valorDefault: 92_026.5,
  /** Base do default, para o alerta. */
  nota:
    'Default aproximado (500 OTN convertidas). A conversão varia por tribunal e data de corte — confirme o valor adotado pelo juízo da comarca.',
};

/** Meses corridos entre duas datas ISO (a−b), nunca negativo. */
export function mesesEntre(deIso: string, ateIso: string): number {
  const de = new Date(`${deIso}T00:00`);
  const ate = new Date(`${ateIso}T00:00`);
  const meses = (ate.getFullYear() - de.getFullYear()) * 12 + (ate.getMonth() - de.getMonth());
  return Math.max(0, meses);
}
