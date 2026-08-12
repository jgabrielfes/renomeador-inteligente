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

export class AiError extends Error {
  constructor(
    message: string,
    // Vindos do 429 do Gemini, via rota: quanto esperar para tentar de novo e
    // se a cota estourada é a DIÁRIA (esperar não resolve).
    public retryDelaySeconds: number | null = null,
    public dailyQuota = false,
    public geminiStatus: number | null = null
  ) {
    super(message);
  }
}

export interface AiLessons {
  rules?: string;
  corrections?: Array<{ tipo: string; sugerido: string; corrigido: string }>;
}

/**
 * Envia um lote com DIVISÃO adaptativa. O que mais faz o Gemini demorar é o
 * TAMANHO do lote: dez documentos numa chamada podem passar do tempo da
 * função serverless, e aí a rota devolve 504 ("sem resposta no tempo"). Em vez
 * de cair direto no motor local, o lote é partido ao meio e reenviado — duas
 * metades quase sempre respondem dentro do orçamento. Só depois disso o
 * chamador faz o fallback local.
 *
 * Resultados voltam alinhados à ordem dos itens (null = o modelo não respondeu
 * aquele item).
 */
export async function aiProposeBatch(
  items: AiBatchItem[],
  lessons?: AiLessons,
  profundidade = 0
): Promise<Array<AiProposal | null>> {
  try {
    return await enviarLote(items, lessons);
  } catch (err) {
    const semTempo =
      err instanceof AiError &&
      (err.geminiStatus === 504 || /sem resposta em/i.test(err.message));
    // 10 → 5 → 2/3 itens: dois níveis bastam para sair do estouro de tempo
    // sem multiplicar requisições (que reacenderiam a cota por minuto).
    if (!semTempo || items.length < 2 || profundidade >= 2) throw err;

    const meio = Math.ceil(items.length / 2);
    const primeira = await aiProposeBatch(items.slice(0, meio), lessons, profundidade + 1);
    const segunda = await aiProposeBatch(items.slice(meio), lessons, profundidade + 1);
    return [...primeira, ...segunda];
  }
}

async function enviarLote(
  items: AiBatchItem[],
  lessons?: AiLessons
): Promise<Array<AiProposal | null>> {
  const form = new FormData();
  for (const item of items) {
    if ("file" in item) form.append("item", item.file);
    else form.append("item", JSON.stringify(item));
  }
  if (lessons && (lessons.rules?.trim() || lessons.corrections?.length)) {
    form.set("lessons", JSON.stringify(lessons));
  }

  const res = await fetch("/api/rename", { method: "POST", body: form });
  const payload = await res.json().catch(() => null);
  if (!res.ok) {
    throw new AiError(
      payload?.error ?? `Falha na análise com IA (HTTP ${res.status}).`,
      typeof payload?.retryDelaySeconds === "number" ? payload.retryDelaySeconds : null,
      payload?.dailyQuota === true,
      typeof payload?.geminiStatus === "number" ? payload.geminiStatus : null
    );
  }
  if (!Array.isArray(payload?.results) || payload.results.length !== items.length) {
    throw new Error("Resposta inválida da análise com IA.");
  }
  return payload.results.map((r: unknown) => {
    const p = r as AiProposal | null;
    return p?.name && p?.docType ? p : null;
  });
}
