"use client";

// Barra de progresso linear no topo em TODA troca de rota (estilo nprogress,
// sem a lib — o App Router não tem os eventos globais que ela espera).
//
// Como cobre os dois jeitos de navegar:
// 1. Cliques em <a>/<Link> internos e voltar/avançar do navegador: detectados
//    automaticamente por listeners globais — nenhuma mudança nos call sites.
// 2. Navegação programática (ex.: router.push após login): usar o hook
//    useProgressRouter() no lugar do useRouter do next/navigation (mesma API),
//    ou chamar startNavigationProgress() antes do push.
//
// A barra aparece em TODA navegação, mesmo instantânea (rotas pré-carregadas
// trocam em milissegundos): ela garante um tempo mínimo visível antes de
// completar, então navegação rápida vira um flash curto de 100% — o feedback
// clássico do nprogress.

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

const TRICKLE_MS = 180;
const SAFETY_MS = 12000;
const HIDE_MS = 250;
const MIN_VISIBLE_MS = 200;

// Registro global para startNavigationProgress() funcionar fora do React.
let globalStart: (() => void) | null = null;

/** Liga a barra manualmente (ex.: antes de um redirect fora de hook). */
export function startNavigationProgress(): void {
  globalStart?.();
}

/**
 * useRouter com a barra de progresso embutida: push/replace/back/forward
 * ligam a barra antes de navegar. Use este hook em ações de botão que
 * redirecionam (login, submits etc.).
 */
export function useProgressRouter(): ReturnType<typeof useRouter> {
  const router = useRouter();
  return React.useMemo(
    () => ({
      ...router,
      push: (...args: Parameters<typeof router.push>) => {
        startNavigationProgress();
        router.push(...args);
      },
      replace: (...args: Parameters<typeof router.replace>) => {
        startNavigationProgress();
        router.replace(...args);
      },
      back: () => {
        startNavigationProgress();
        router.back();
      },
      forward: () => {
        startNavigationProgress();
        router.forward();
      },
    }),
    [router]
  );
}

export function NavigationProgress() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [visible, setVisible] = React.useState(false);
  const [progress, setProgress] = React.useState(0);

  const shownRef = React.useRef(false);
  const shownAtRef = React.useRef(0);
  const lastRouteRef = React.useRef("");
  const timersRef = React.useRef<{
    trickle?: ReturnType<typeof setInterval>;
    safety?: ReturnType<typeof setTimeout>;
    complete?: ReturnType<typeof setTimeout>;
    hide?: ReturnType<typeof setTimeout>;
  }>({});

  const clearTimers = React.useCallback(() => {
    const t = timersRef.current;
    if (t.trickle) clearInterval(t.trickle);
    if (t.safety) clearTimeout(t.safety);
    if (t.complete) clearTimeout(t.complete);
    if (t.hide) clearTimeout(t.hide);
    timersRef.current = {};
  }, []);

  const finish = React.useCallback(() => {
    if (!shownRef.current) return;
    clearTimers();
    shownRef.current = false;
    // Garante o tempo mínimo na tela: navegação instantânea vira um flash
    // curto (barra sobe a 100% e some) em vez de não aparecer nunca.
    const elapsed = Date.now() - shownAtRef.current;
    const wait = Math.max(0, MIN_VISIBLE_MS - elapsed);
    timersRef.current.complete = setTimeout(() => {
      setProgress(100);
      timersRef.current.hide = setTimeout(() => {
        setVisible(false);
        setProgress(0);
      }, HIDE_MS);
    }, wait);
  }, [clearTimers]);

  const start = React.useCallback(() => {
    clearTimers();
    shownRef.current = true;
    shownAtRef.current = Date.now();
    setVisible(true);
    setProgress(12);
    // Avança sempre mais devagar rumo aos ~90% (nunca completa sozinha).
    timersRef.current.trickle = setInterval(() => {
      setProgress((p) => Math.min(90, p + (90 - p) * 0.08 + 0.4));
    }, TRICKLE_MS);
    // Navegação que nunca conclui (erro, rota externa) não deixa a barra presa.
    timersRef.current.safety = setTimeout(finish, SAFETY_MS);
  }, [clearTimers, finish]);

  // A rota mudou de fato: conclui a barra (async para não brigar com o lint
  // de setState síncrono em efeito).
  React.useEffect(() => {
    lastRouteRef.current = `${pathname}?${searchParams}`;
    const id = setTimeout(finish, 0);
    return () => clearTimeout(id);
  }, [pathname, searchParams, finish]);

  React.useEffect(() => {
    globalStart = start;

    // Mesmos filtros que o Next usa para decidir se um clique vira navegação
    // SPA. Capture: roda antes de stopPropagation de terceiros.
    const onClick = (event: MouseEvent) => {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      ) {
        return;
      }
      const target = event.target as Element | null;
      const anchor = target?.closest?.("a");
      if (!anchor) return;
      if (anchor.target && anchor.target !== "_self") return;
      if (anchor.hasAttribute("download")) return;
      const rawHref = anchor.getAttribute("href");
      if (!rawHref || rawHref.startsWith("#")) return;
      const url = new URL(anchor.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      if (
        url.pathname === window.location.pathname &&
        url.search === window.location.search
      ) {
        return; // mesma rota (ou só hash): não há navegação
      }
      start();
    };

    // Voltar/avançar. No popstate a URL já mudou — se só o hash mudou em
    // relação à última rota renderizada, não há transição para esperar.
    const onPopState = () => {
      const next = `${window.location.pathname}?${window.location.search.replace(/^\?/, "")}`;
      if (next === lastRouteRef.current) return;
      start();
    };

    document.addEventListener("click", onClick, true);
    window.addEventListener("popstate", onPopState);
    return () => {
      if (globalStart === start) globalStart = null;
      document.removeEventListener("click", onClick, true);
      window.removeEventListener("popstate", onPopState);
      clearTimers();
    };
  }, [start, clearTimers]);

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-x-0 top-0 z-[60]"
    >
      <div
        className={`h-0.5 bg-primary shadow-[0_0_8px] shadow-primary/60 transition-[width,opacity] duration-200 ease-out ${
          visible ? "opacity-100" : "opacity-0"
        }`}
        style={{ width: `${progress}%` }}
      />
    </div>
  );
}
