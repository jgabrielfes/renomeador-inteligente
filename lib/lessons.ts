// Aprendizado do escritório — regras + correções, salvos NA CONTA (banco):
// - "regras": texto livre escrito pelo usuário, injetado em todo prompt da IA;
// - "correções": capturadas automaticamente quando o usuário edita um nome
//   sugerido pela IA — viram exemplos few-shot nos lotes seguintes.
// O estado reativo continua o mesmo (useSyncExternalStore), mas a persistência
// deixou de ser o localStorage: o snapshot inicial vem do servidor via
// initLessons() e cada mudança vira uma server action (regras com debounce,
// correções na hora). Quem usava a versão localStorage é migrado uma única vez
// no primeiro acesso logado (migrateLegacyLessons).

import { toast } from "sonner";

import {
  salvarCorrecoes,
  salvarLicoes,
  salvarRegras,
} from "@/app/(private)/renomeador/licoes-actions";

export interface Correction {
  tipo: string;
  sugerido: string;
  corrigido: string;
}

export interface LessonsState {
  rules: string;
  corrections: Correction[];
}

const LEGACY_RULES_KEY = "renomeador-regras";
const LEGACY_CORRECTIONS_KEY = "renomeador-correcoes";
const MAX_CORRECTIONS = 20;
const SAVE_DEBOUNCE_MS = 1500;

const DEFAULT_STATE: LessonsState = { rules: "", corrections: [] };

let snapshot: LessonsState = DEFAULT_STATE;
let initialized = false;
// false = o carregamento inicial falhou; a migração do localStorage não roda
// (senão dados antigos poderiam sobrescrever o que já está salvo na conta).
let serverLoadOk = false;
const listeners = new Set<() => void>();

function commit(next: LessonsState): void {
  snapshot = next;
  for (const listener of listeners) listener();
}

function avisarFalhaAoSalvar(): void {
  toast.error("Não foi possível salvar na sua conta", {
    description:
      "As regras/correções valem nesta sessão, mas podem não aparecer no próximo acesso. Verifique sua conexão.",
  });
}

// Chamado pelo componente da página no primeiro render do mount (via
// inicializador de useState), com as lições carregadas no servidor.
// Sem efeitos além de definir o snapshot — listeners ainda não existem.
export function initLessons(initial: LessonsState | null): void {
  if (typeof window === "undefined") return;
  initialized = true;
  serverLoadOk = initial !== null;
  snapshot = initial ?? DEFAULT_STATE;
}

export function subscribeLessons(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getLessonsSnapshot(): LessonsState {
  return snapshot;
}

export function getLessonsServerSnapshot(): LessonsState {
  return DEFAULT_STATE;
}

let rulesTimer: ReturnType<typeof setTimeout> | null = null;

function persistRules(): void {
  void salvarRegras(snapshot.rules).then((ok) => {
    if (!ok) avisarFalhaAoSalvar();
  });
}

function persistCorrections(): void {
  void salvarCorrecoes(snapshot.corrections).then((ok) => {
    if (!ok) avisarFalhaAoSalvar();
  });
}

export function saveRules(rules: string): void {
  commit({ ...snapshot, rules });
  if (rulesTimer) clearTimeout(rulesTimer);
  rulesTimer = setTimeout(() => {
    rulesTimer = null;
    persistRules();
  }, SAVE_DEBOUNCE_MS);
}

// Grava imediatamente uma edição de regras pendente do debounce — chamado no
// blur do textarea, para a digitação não se perder se a aba fechar em seguida.
export function flushRules(): void {
  if (!rulesTimer) return;
  clearTimeout(rulesTimer);
  rulesTimer = null;
  persistRules();
}

// Registra uma correção do usuário (mais recente primeiro, sem duplicatas,
// no máximo MAX_CORRECTIONS — as antigas saem por rotação).
export function addCorrection(correction: Correction): void {
  const rest = snapshot.corrections.filter(
    (c) =>
      !(
        c.sugerido === correction.sugerido &&
        c.corrigido === correction.corrigido
      )
  );
  commit({
    ...snapshot,
    corrections: [correction, ...rest].slice(0, MAX_CORRECTIONS),
  });
  persistCorrections();
}

// Esquece UMA correção (a chave é o par sugerido/corrigido, igual à
// deduplicação do addCorrection — o tipo não entra na identidade).
export function removeCorrection(correction: Correction): void {
  commit({
    ...snapshot,
    corrections: snapshot.corrections.filter(
      (c) =>
        !(
          c.sugerido === correction.sugerido &&
          c.corrigido === correction.corrigido
        )
    ),
  });
  persistCorrections();
}

export function clearCorrections(): void {
  commit({ ...snapshot, corrections: [] });
  persistCorrections();
}

function parseCorrections(raw: unknown): Correction[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(
      (c): c is Correction =>
        typeof c?.sugerido === "string" && typeof c?.corrigido === "string"
    )
    .slice(0, MAX_CORRECTIONS)
    .map((c) => ({
      tipo: typeof c.tipo === "string" ? c.tipo : "",
      sugerido: c.sugerido,
      corrigido: c.corrigido,
    }));
}

export function importLessons(json: string): LessonsState {
  const parsed = JSON.parse(json);
  if (typeof parsed?.rules !== "string" || !Array.isArray(parsed?.corrections)) {
    throw new Error("Formato inválido: esperado { rules, corrections }.");
  }
  const next: LessonsState = {
    rules: parsed.rules,
    corrections: parseCorrections(parsed.corrections),
  };
  if (rulesTimer) {
    clearTimeout(rulesTimer);
    rulesTimer = null;
  }
  commit(next);
  void salvarLicoes(next).then((ok) => {
    if (!ok) avisarFalhaAoSalvar();
  });
  return next;
}

// Migração única da era localStorage → conta. Roda num efeito de mount da
// página: se a conta ainda não tem nada salvo e o navegador guarda regras ou
// correções antigas, elas sobem para o banco e as chaves locais são removidas.
// Se a conta JÁ tem dados, o banco vence — as chaves antigas só são limpas.
let migrationDone = false;

export function migrateLegacyLessons(): void {
  if (migrationDone || !initialized || !serverLoadOk) return;
  if (typeof localStorage === "undefined") return;
  migrationDone = true;

  const rawRules = localStorage.getItem(LEGACY_RULES_KEY);
  const rawCorrections = localStorage.getItem(LEGACY_CORRECTIONS_KEY);
  if (rawRules === null && rawCorrections === null) return;

  let legacyCorrections: Correction[] = [];
  try {
    legacyCorrections = parseCorrections(JSON.parse(rawCorrections ?? "[]"));
  } catch {
    // valor corrompido: migra só as regras
  }
  const legacy: LessonsState = {
    rules: rawRules ?? "",
    corrections: legacyCorrections,
  };
  const contaVazia =
    snapshot.rules === "" && snapshot.corrections.length === 0;
  const temLegado =
    legacy.rules.trim() !== "" || legacy.corrections.length > 0;

  if (contaVazia && temLegado) {
    commit(legacy);
    void salvarLicoes(legacy).then((ok) => {
      if (!ok) {
        avisarFalhaAoSalvar();
        return;
      }
      localStorage.removeItem(LEGACY_RULES_KEY);
      localStorage.removeItem(LEGACY_CORRECTIONS_KEY);
      toast.success("Regras do escritório movidas para a sua conta", {
        description:
          "O que estava salvo neste navegador agora vale em qualquer lugar em que você entrar.",
      });
    });
  } else {
    localStorage.removeItem(LEGACY_RULES_KEY);
    localStorage.removeItem(LEGACY_CORRECTIONS_KEY);
  }
}
