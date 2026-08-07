// Aprendizado do escritório, guardado no navegador (localStorage):
// - "regras": texto livre escrito pelo usuário, injetado em todo prompt da IA;
// - "correções": capturadas automaticamente quando o usuário edita um nome
//   sugerido pela IA — viram exemplos few-shot nos lotes seguintes.
// Mesmo padrão reativo (useSyncExternalStore) das configurações de IA.

export interface Correction {
  tipo: string;
  sugerido: string;
  corrigido: string;
}

export interface LessonsState {
  rules: string;
  corrections: Correction[];
}

const RULES_KEY = "renomeador-regras";
const CORRECTIONS_KEY = "renomeador-correcoes";
const MAX_CORRECTIONS = 20;

const DEFAULT_STATE: LessonsState = { rules: "", corrections: [] };

function load(): LessonsState {
  if (typeof localStorage === "undefined") return DEFAULT_STATE;
  let corrections: Correction[] = [];
  try {
    const raw = JSON.parse(localStorage.getItem(CORRECTIONS_KEY) ?? "[]");
    if (Array.isArray(raw)) {
      corrections = raw
        .filter(
          (c) =>
            typeof c?.sugerido === "string" && typeof c?.corrigido === "string"
        )
        .slice(0, MAX_CORRECTIONS)
        .map((c) => ({
          tipo: typeof c.tipo === "string" ? c.tipo : "",
          sugerido: c.sugerido,
          corrigido: c.corrigido,
        }));
    }
  } catch {
    // valor corrompido: recomeça sem correções
  }
  return { rules: localStorage.getItem(RULES_KEY) ?? "", corrections };
}

let snapshot: LessonsState | null = null;
const listeners = new Set<() => void>();

function commit(next: LessonsState): void {
  snapshot = next;
  localStorage.setItem(RULES_KEY, next.rules);
  localStorage.setItem(CORRECTIONS_KEY, JSON.stringify(next.corrections));
  for (const listener of listeners) listener();
}

export function subscribeLessons(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getLessonsSnapshot(): LessonsState {
  if (!snapshot) snapshot = load();
  return snapshot;
}

export function getLessonsServerSnapshot(): LessonsState {
  return DEFAULT_STATE;
}

export function saveRules(rules: string): void {
  commit({ ...getLessonsSnapshot(), rules });
}

// Registra uma correção do usuário (mais recente primeiro, sem duplicatas,
// no máximo MAX_CORRECTIONS — as antigas saem por rotação).
export function addCorrection(correction: Correction): void {
  const state = getLessonsSnapshot();
  const rest = state.corrections.filter(
    (c) =>
      !(
        c.sugerido === correction.sugerido &&
        c.corrigido === correction.corrigido
      )
  );
  commit({
    ...state,
    corrections: [correction, ...rest].slice(0, MAX_CORRECTIONS),
  });
}

export function clearCorrections(): void {
  commit({ ...getLessonsSnapshot(), corrections: [] });
}

export function importLessons(json: string): LessonsState {
  const parsed = JSON.parse(json);
  if (typeof parsed?.rules !== "string" || !Array.isArray(parsed?.corrections)) {
    throw new Error("Formato inválido: esperado { rules, corrections }.");
  }
  const next: LessonsState = {
    rules: parsed.rules,
    corrections: parsed.corrections
      .filter(
        (c: unknown): c is Correction =>
          typeof (c as Correction)?.sugerido === "string" &&
          typeof (c as Correction)?.corrigido === "string"
      )
      .slice(0, MAX_CORRECTIONS)
      .map((c: Correction) => ({
        tipo: typeof c.tipo === "string" ? c.tipo : "",
        sugerido: c.sugerido,
        corrigido: c.corrigido,
      })),
  };
  commit(next);
  return next;
}
