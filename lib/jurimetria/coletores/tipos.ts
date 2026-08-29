/**
 * Coletores da Camada A — interface comum.
 *
 * Cada fonte implementa `listar` (referências novas desde uma data) e
 * `baixar` (o conteúdo de UMA referência). O worker orquestra, deduplica
 * por hash e passa o texto ao pipeline. O conteúdo BRUTO vive só na memória
 * do runner — nunca no banco.
 */

export interface ConfigFonte {
  id: string;
  tipo: string;
  nome: string;
  urlBase: string | null;
  config: Record<string, unknown>;
}

export interface ReferenciaColeta {
  /** Identificador estável na fonte (nº CNJ, URL…) — vira urlOrigem. */
  url: string;
  /** Data do documento quando a listagem já a conhece. */
  dataDocumento?: string;
  rotulo?: string;
}

export interface ConteudoColetado {
  urlOrigem: string;
  mime: string;
  /** Texto pronto (HTML já limpo, JSON serializado) OU bytes de PDF. */
  texto?: string;
  bytes?: Uint8Array;
  dataDocumento?: string;
}

export interface Coletor {
  listar(fonte: ConfigFonte, desde: Date): Promise<ReferenciaColeta[]>;
  baixar(fonte: ConfigFonte, ref: ReferenciaColeta): Promise<ConteudoColetado>;
}

/** Fonte que exige captcha/login ou respondeu 403/429: PARAR, nunca contornar. */
export class FonteBloqueadaError extends Error {
  constructor(motivo: string) {
    super(motivo);
    this.name = 'FonteBloqueadaError';
  }
}
