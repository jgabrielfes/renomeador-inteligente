// Lado cliente da nomeação com IA: chama a rota interna /api/rename (que
// guarda a chave do Gemini no servidor) e mantém a preferência de modo no
// localStorage. Quem chama trata falhas fazendo fallback para o motor
// heurístico local (lib/renamer.ts) — a IA nunca é ponto único de falha.

import { getExtension } from "./renamer";

export type AiMode = "arquivo" | "texto" | "local";

const MODE_KEY = "renomeador-ai-mode";

// Limite do corpo aceito pela rota (funções serverless da Vercel: ~4,5 MB).
// Arquivos maiores caem automaticamente no modo texto.
const MAX_INLINE_FILE_BYTES = 4 * 1024 * 1024;

// Formatos que o Gemini aceita como arquivo inline.
const AI_FILE_EXTS = new Set([".jpg", ".jpeg", ".png", ".webp", ".pdf"]);

export interface AiSettings {
  mode: AiMode;
}

const DEFAULT_SETTINGS: AiSettings = { mode: "arquivo" };

function loadAiSettings(): AiSettings {
  if (typeof localStorage === "undefined") return DEFAULT_SETTINGS;
  const mode = localStorage.getItem(MODE_KEY);
  return { mode: mode === "texto" || mode === "local" ? mode : "arquivo" };
}

// Snapshot estável + listeners, no formato que useSyncExternalStore espera.
let snapshot: AiSettings | null = null;
const listeners = new Set<() => void>();

export function subscribeAiSettings(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getAiSettingsSnapshot(): AiSettings {
  if (!snapshot) snapshot = loadAiSettings();
  return snapshot;
}

export function getAiSettingsServerSnapshot(): AiSettings {
  return DEFAULT_SETTINGS;
}

export function saveAiSettings(settings: AiSettings): void {
  snapshot = settings;
  localStorage.setItem(MODE_KEY, settings.mode);
  for (const listener of listeners) listener();
}

// O arquivo pode ir inteiro para a IA? (formato aceito e dentro do limite)
export function fileEligibleForAi(file: File): boolean {
  return (
    file.size <= MAX_INLINE_FILE_BYTES && AI_FILE_EXTS.has(getExtension(file.name))
  );
}

// Limites do lote: uma única chamada à IA para vários documentos (o free tier
// limita REQUISIÇÕES por minuto — agrupar 10 em 1 praticamente elimina o 429).
export const AI_BATCH_MAX_ITEMS = 10;
export const AI_BATCH_MAX_BYTES = 3.5 * 1024 * 1024;

export type AiBatchItem =
  | { file: File }
  | { fileName: string; text: string };

export interface AiProposal {
  name: string;
  docType: string;
}

// Envia um lote e devolve os resultados alinhados à ordem dos itens
// (null = o modelo não respondeu aquele item; o chamador faz fallback local).
export async function aiProposeBatch(
  items: AiBatchItem[]
): Promise<Array<AiProposal | null>> {
  const form = new FormData();
  for (const item of items) {
    if ("file" in item) form.append("item", item.file);
    else form.append("item", JSON.stringify(item));
  }

  const res = await fetch("/api/rename", { method: "POST", body: form });
  const payload = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(payload?.error ?? `Falha na análise com IA (HTTP ${res.status}).`);
  }
  if (!Array.isArray(payload?.results) || payload.results.length !== items.length) {
    throw new Error("Resposta inválida da análise com IA.");
  }
  return payload.results.map((r: unknown) => {
    const p = r as AiProposal | null;
    return p?.name && p?.docType ? p : null;
  });
}
