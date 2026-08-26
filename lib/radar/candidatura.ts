/**
 * CANDIDATURA no Radar Sucessório — motor puro do gate (decisão do
 * escritório, remodelagem LexCausa):
 *
 *  - TETO de DUAS candidaturas por caso ("X/2 advogados"): protege a
 *    família de leilão e faz cada candidatura valer;
 *  - candidatar-se depende do PLANO DE ASSINATURA do(a) advogado(a) — o
 *    plano ainda está em desenvolvimento, então `planoPermite` chega de
 *    fora e HOJE é a habilitação existente (OAB aprovada + quiz +
 *    crédito disponível; master). O crédito da assinatura entra pelo
 *    MESMO parâmetro, sem tocar nas telas.
 *
 * A ordem dos casos continua única (data de publicação) e a escolha final
 * é sempre da família — o teto limita candidaturas, nunca ranqueia.
 */

export const TETO_CANDIDATURAS_POR_CASO = 2;

export interface EntradaCandidatura {
  /** O plano do(a) advogado(a) permite candidatar-se (hoje: habilitado). */
  planoPermite: boolean;
  /** Já se candidatou a ESTE caso. */
  jaCandidato: boolean;
  /** Candidaturas que o caso já recebeu. */
  candidaturas: number;
}

export type GateCandidatura =
  | { pode: true }
  | { pode: false; motivo: 'sem-plano' | 'ja-candidato' | 'caso-completo' };

export function podeCandidatar(e: EntradaCandidatura): GateCandidatura {
  if (!e.planoPermite) return { pode: false, motivo: 'sem-plano' };
  if (e.jaCandidato) return { pode: false, motivo: 'ja-candidato' };
  if (e.candidaturas >= TETO_CANDIDATURAS_POR_CASO) {
    return { pode: false, motivo: 'caso-completo' };
  }
  return { pode: true };
}

/** Marcador "X/2 advogados" exibido sob a publicação do caso. */
export function marcadorCandidaturas(candidaturas: number): string {
  const n = Math.max(0, Math.min(candidaturas, TETO_CANDIDATURAS_POR_CASO));
  return `${n}/${TETO_CANDIDATURAS_POR_CASO} advogado(a)s`;
}
