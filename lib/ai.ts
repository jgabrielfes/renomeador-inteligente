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

async function postRename(form: FormData): Promise<{ name: string; docType: string }> {
  const res = await fetch("/api/rename", { method: "POST", body: form });
  const payload = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(payload?.error ?? `Falha na análise com IA (HTTP ${res.status}).`);
  }
  if (!payload?.name || !payload?.docType) {
    throw new Error("Resposta inválida da análise com IA.");
  }
  return payload;
}

// Modo "arquivo": o documento em si é enviado; o Gemini o lê diretamente.
export async function aiProposeFromFile(
  file: File
): Promise<{ name: string; docType: string }> {
  const form = new FormData();
  form.set("fileName", file.name);
  form.set("file", file);
  return postRename(form);
}

// Modo "texto": envia apenas o texto extraído pelo OCR local.
export async function aiProposeFromText(
  fileName: string,
  text: string
): Promise<{ name: string; docType: string }> {
  const form = new FormData();
  form.set("fileName", fileName);
  form.set("text", text);
  return postRename(form);
}
