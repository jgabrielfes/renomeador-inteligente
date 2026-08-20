/**
 * Semântica de COR do prazo do art. 611 do CPC (V4 da auditoria visual) —
 * motor puro (com testes). A cor só pode significar uma coisa:
 *
 *  - ok        → dentro do prazo, sem marco próximo (verde);
 *  - alerta    → faltam 30 dias ou menos para um marco (âmbar);
 *  - vencido   → marco estourado — a multa incide (lacre);
 *  - historico → prazo perdido há mais de um ano: é HISTÓRIA do caso, não
 *    urgência de hoje — neutro, com o rótulo "multa já incidente" (um painel
 *    de casos antigos todo vermelho faz o vermelho perder o significado).
 *
 * Marcos da Lei 10.705/2000: 60 dias (multa de 10%) e 180 dias (multa de
 * 20% + encargos). O histórico começa um ano após o marco final (545 dias).
 */

export type FaixaPrazo = 'ok' | 'alerta' | 'vencido' | 'historico';

export function faixaDoPrazo(diasDesdeObito: number): FaixaPrazo {
  if (diasDesdeObito > 180 + 365) return 'historico';
  if (diasDesdeObito > 60) return 'vencido';
  if (diasDesdeObito > 30) return 'alerta';
  return 'ok';
}

/** Complemento do rótulo do prazo nos cards e no painel. */
export function rotuloDoPrazo(diasDesdeObito: number): string {
  const faixa = faixaDoPrazo(diasDesdeObito);
  if (faixa === 'historico') return 'multa já incidente';
  if (diasDesdeObito > 180) return 'multa de 20% incidente';
  if (diasDesdeObito > 60) return 'multa de 10% incidente';
  if (faixa === 'alerta') return `multa de 10% em ${60 - diasDesdeObito} dia(s)`;
  return 'dentro do prazo';
}
