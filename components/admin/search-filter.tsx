"use client";

// Busca textual das telas /admin — o termo vive na query string (?busca=),
// como os demais filtros, e a consulta é feita NO BANCO.
//
// Sem botão e sem Enter: a digitação vira navegação depois de uma pausa.
// Três decisões que fazem a digitação ficar fluida:
//
// 1. O estado local é a ÚNICA fonte da verdade do que aparece no campo. Nada
//    de re-derivar do que veio da URL: enquanto o servidor responde, a prop
//    ainda traz o termo ANTIGO, e sincronizar com ela fazia o campo esvaziar e
//    repreencher a cada busca.
// 2. `replace` + `useTransition`: não empilha um item de histórico por tecla
//    (o "voltar" sairia letra a letra) e não bloqueia o input enquanto a lista
//    recarrega. O progresso aparece no PRÓPRIO campo — a barra global piscaria
//    a cada pausa da digitação, que é justamente o ruído que se quer evitar.
// 3. `type="text"`: `type="search"` traz um X nativo do navegador, e ficariam
//    dois botões de limpar.

import * as React from "react";
import { useRouter } from "next/navigation";
import { Search, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";

const DEBOUNCE_MS = 350;

export function SearchFilter({
  basePath,
  atual,
  query,
  placeholder = "Buscar…",
  rotulo = "Buscar",
}: {
  basePath: string;
  /** Termo que veio da URL — serve só como valor inicial do campo. */
  atual: string;
  /** Demais parâmetros a preservar (período, ordenação, itens por página). */
  query: URLSearchParams;
  placeholder?: string;
  rotulo?: string;
}) {
  const router = useRouter();
  const [texto, setTexto] = React.useState(atual);
  const [buscando, iniciarBusca] = React.useTransition();
  // Último termo que já virou navegação: evita repetir a busca no mount e
  // quando a digitação volta ao mesmo valor.
  const enviado = React.useRef(atual);

  const href = React.useCallback(
    (termo: string) => {
      const proxima = new URLSearchParams(query);
      if (termo) proxima.set("busca", termo);
      else proxima.delete("busca");
      // Termo novo, lista nova: a linha procurada não está na página atual.
      proxima.set("pagina", "1");
      return `${basePath}?${proxima}`;
    },
    [basePath, query]
  );

  React.useEffect(() => {
    const termo = texto.trim();
    if (termo === enviado.current) return;
    const t = setTimeout(() => {
      enviado.current = termo;
      // scroll: false — a página não pula para o topo a cada busca.
      iniciarBusca(() => router.replace(href(termo), { scroll: false }));
    }, DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [texto, href, router]);

  return (
    <div className="relative w-full sm:max-w-xs">
      {/* Lupa vira spinner enquanto a lista recarrega: o indicador ocupa o
          mesmo lugar, então nada se move enquanto se digita. */}
      <span className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-muted-foreground">
        {buscando ? (
          <Spinner className="size-4" />
        ) : (
          <Search className="size-4" />
        )}
      </span>
      <Input
        type="text"
        inputMode="search"
        autoComplete="off"
        spellCheck={false}
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        onKeyDown={(e) => {
          // Enter não é necessário (a busca é por pausa), mas não pode
          // submeter nada nem recarregar; Esc limpa, como num campo de busca.
          if (e.key === "Enter") e.preventDefault();
          if (e.key === "Escape") setTexto("");
        }}
        placeholder={placeholder}
        aria-label={rotulo}
        className="px-8"
      />
      {texto && (
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="Limpar busca"
          className="absolute top-1/2 right-1 -translate-y-1/2"
          onClick={() => setTexto("")}
        >
          <X className="size-3.5" />
        </Button>
      )}
    </div>
  );
}
