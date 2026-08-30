/**
 * Jurimetria Registral — tipos compartilhados do pipeline (Fase 1).
 *
 * O pipeline transforma documento coletado em EXIGÊNCIAS estruturadas:
 *   anonimizar → extrair → resolver cartório/titular → dedupe → encaminhar
 * Cada etapa é função pura (testes em pipeline.test.ts); o worker da Action
 * é quem toca banco e rede.
 */

export type AtoTipo =
  | 'inventario'
  | 'partilha'
  | 'doacao'
  | 'divorcio'
  | 'compra_venda'
  | 'outro';

export type ResultadoExigencia = 'mantida' | 'afastada' | 'parcial' | 'sem_julgamento';

export interface ExigenciaCandidata {
  /** A exigência em UMA frase impessoal, no infinitivo, sem dado pessoal. */
  textoNormalizado: string;
  fundamentacao: string[];
  resultado: ResultadoExigencia;
  /** Citação curta (já anonimizada) do trecho que sustenta a exigência. */
  trechoOrigem: string;
}

export interface ExtracaoDocumento {
  cartorioMencionado: string | null;
  registradorMencionado: string | null;
  dataDocumento: string | null; // YYYY-MM-DD
  atoTipo: AtoTipo;
  exigencias: ExigenciaCandidata[];
  /** 0–1: confiança do extrator (LLM alta; fallback local baixa). */
  confianca: number;
  /** Slug do tema sugerido POR exigência (mesma ordem), quando o extrator souber. */
  temas?: (string | null)[];
}

export interface CartorioRef {
  id: string;
  nome: string;
  aliases: string[];
}

export interface TitularRef {
  id: string;
  cartorioId: string;
  titularDesde: Date;
}

export type MotivoRevisao =
  | 'baixa_confianca'
  | 'titular_pendente'
  | 'possivel_dado_pessoal'
  | 'cartorio_nao_identificado'
  | 'auditoria';

/** Versão do extrator — gravada em cada documento para rastreabilidade. */
export const VERSAO_EXTRATOR = 'jurimetria-fase1-v1';
