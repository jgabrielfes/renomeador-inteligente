/**
 * Persistência local do caso — schema do `caso.json` (v1) e a interface
 * única de armazenamento (`CaseStore`) com duas implementações: pasta do
 * processo (File System Access) e portátil (IndexedDB + arquivo .json).
 * O wizard consome SÓ esta interface e não sabe qual modo está ativo.
 *
 * Princípio do módulo: dado de caso NÃO trafega para servidor — tudo aqui
 * roda e permanece na máquina do usuário. ÚNICA exceção, opt-in: a NUVEM DA
 * EQUIPE (convite de acesso total gerado pelo chefe) espelha o `caso.json`
 * — folha e manifesto de METADADOS — no banco para a equipe enxergar os
 * mesmos casos de máquinas diferentes; os DOCUMENTOS (arquivos) continuam
 * jamais saindo da máquina. Ver `app/(private)/sucessorista/nuvem-actions.ts`.
 */

import type { DiffManifesto, EntradaManifesto, InfoArquivoDisco } from './manifesto';

export const SCHEMA_VERSION = 1;
export const APP_VERSION = '0.1.0'; // acompanhar package.json

/** 'nuvem' aparece só em ResumoCaso (card do painel) — não é um CaseStore. */
export type ModoStore = 'pasta' | 'portatil' | 'nuvem';

/** Cabeçalho do caso — PRIMEIRA chave do caso.json (leitura barata no painel). */
export interface CabecalhoCaso {
  caseId: string;
  titulo: string;
  autorDaHeranca: string;
  dataObito: string;
  criadoEm: string;
  atualizadoEm: string;
  /** Nome do dispositivo/usuário local — torna a mensagem de conflito útil. */
  atualizadoPor: string;
  qtdDocumentos: number;
  custoProjetado: number | null;
}

export interface ArquivoCaso {
  schemaVersion: number;
  appVersion: string;
  cabecalho: CabecalhoCaso;
  /** Estado do wizard (CasoSalvo) — o store trata como opaco. */
  dados: unknown;
  manifesto: EntradaManifesto[];
  integridade: { hashDados: string };
}

export interface ResumoCaso {
  cabecalho: CabecalhoCaso;
  modo: ModoStore;
  /** Nome da pasta do processo (modo pasta). */
  caminhoPasta?: string;
}

export interface ConflitoSalvamento {
  atualizadoEm: string;
  atualizadoPor: string;
  /** O que está no disco agora — para "Recarregar do disco". */
  arquivoNoDisco: ArquivoCaso;
}

export interface ResultadoSalvamento {
  ok: boolean;
  salvoEm?: string;
  conflito?: ConflitoSalvamento;
  erro?: string;
}

export interface OpcoesSalvamento {
  /**
   * `atualizadoEm` carregado quando o caso foi ABERTO — a guarda de conflito
   * compara com o que está no disco antes de sobrescrever.
   */
  baseAtualizadoEm: string | null;
  /** true = "Manter a minha versão": sobrescreve mesmo com conflito. */
  forcar?: boolean;
}

export interface CaseStore {
  modo: ModoStore;
  listarCasos(): Promise<ResumoCaso[]>;
  abrirCaso(id: string): Promise<ArquivoCaso | null>;
  salvarCaso(caso: ArquivoCaso, opcoes: OpcoesSalvamento): Promise<ResultadoSalvamento>;
  criarCaso(titulo: string, dadosIniciais: unknown): Promise<ArquivoCaso>;
  /** Lê um documento do caso pelo caminho relativo (só no modo pasta). */
  lerDocumento(caseId: string, caminhoRelativo: string): Promise<File | null>;
  /**
   * Religa o manifesto aos arquivos: no modo pasta varre a pasta do caso;
   * no portátil recebe os arquivos arrastados pelo usuário.
   */
  varrerDocumentos(caso: ArquivoCaso, arquivos?: InfoArquivoDisco[]): Promise<DiffManifesto>;
}

/* ---------------- serialização estável + hash de integridade ---------------- */

/** JSON determinístico: chaves ordenadas em toda a árvore. */
export function serializarEstavel(v: unknown): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v) ?? 'null';
  if (Array.isArray(v)) return `[${v.map(serializarEstavel).join(',')}]`;
  const chaves = Object.keys(v as Record<string, unknown>)
    .filter((k) => (v as Record<string, unknown>)[k] !== undefined)
    .sort();
  return `{${chaves
    .map((k) => `${JSON.stringify(k)}:${serializarEstavel((v as Record<string, unknown>)[k])}`)
    .join(',')}}`;
}

export async function hashDados(dados: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(serializarEstavel(dados));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/* ---------------- montagem e migração ---------------- */

export function novoCabecalho(titulo: string, atualizadoPor: string): CabecalhoCaso {
  const agora = new Date().toISOString();
  return {
    caseId: crypto.randomUUID(),
    titulo,
    autorDaHeranca: '',
    dataObito: '',
    criadoEm: agora,
    atualizadoEm: agora,
    atualizadoPor,
    qtdDocumentos: 0,
    custoProjetado: null,
  };
}

/** Monta o caso.json v1 com o cabeçalho como PRIMEIRA chave. */
export async function montarArquivoCaso(entrada: {
  cabecalho: CabecalhoCaso;
  dados: unknown;
  manifesto: EntradaManifesto[];
}): Promise<ArquivoCaso> {
  return {
    schemaVersion: SCHEMA_VERSION,
    appVersion: APP_VERSION,
    cabecalho: entrada.cabecalho,
    dados: entrada.dados,
    manifesto: entrada.manifesto,
    integridade: { hashDados: await hashDados(entrada.dados) },
  };
}

/** Valida/migra um caso.json lido do disco. null = não é um caso válido. */
export function migrarArquivoCaso(bruto: unknown): ArquivoCaso | null {
  if (!bruto || typeof bruto !== 'object') return null;
  const o = bruto as Partial<ArquivoCaso> & { cabecalho?: Partial<CabecalhoCaso> };
  if (typeof o.schemaVersion !== 'number' || o.schemaVersion > SCHEMA_VERSION) return null;
  const c = o.cabecalho;
  if (!c || typeof c.caseId !== 'string' || !c.caseId) return null;
  return {
    schemaVersion: SCHEMA_VERSION,
    appVersion: typeof o.appVersion === 'string' ? o.appVersion : 'desconhecida',
    cabecalho: {
      caseId: c.caseId,
      titulo: typeof c.titulo === 'string' ? c.titulo : 'Caso sem título',
      autorDaHeranca: typeof c.autorDaHeranca === 'string' ? c.autorDaHeranca : '',
      dataObito: typeof c.dataObito === 'string' ? c.dataObito : '',
      criadoEm: typeof c.criadoEm === 'string' ? c.criadoEm : new Date().toISOString(),
      atualizadoEm: typeof c.atualizadoEm === 'string' ? c.atualizadoEm : new Date().toISOString(),
      atualizadoPor: typeof c.atualizadoPor === 'string' ? c.atualizadoPor : '',
      qtdDocumentos: typeof c.qtdDocumentos === 'number' ? c.qtdDocumentos : 0,
      custoProjetado: typeof c.custoProjetado === 'number' ? c.custoProjetado : null,
    },
    dados: 'dados' in o ? o.dados : null,
    manifesto: Array.isArray(o.manifesto) ? (o.manifesto as EntradaManifesto[]) : [],
    integridade:
      o.integridade && typeof o.integridade === 'object' && 'hashDados' in o.integridade
        ? (o.integridade as { hashDados: string })
        : { hashDados: '' },
  };
}

/** Nome de pasta seguro para o sistema de arquivos. */
export function higienizarNomePasta(titulo: string): string {
  const limpo = titulo
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[. ]+$/, '');
  return (limpo || 'Caso sem título').slice(0, 80);
}
