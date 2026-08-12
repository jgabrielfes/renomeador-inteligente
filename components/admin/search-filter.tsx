"use client";

// Busca textual das telas /admin — o termo vive na query string (?busca=),
// como os demais filtros, e a consulta é feita NO BANCO.
// Sem botão e sem Enter: o texto digitado vira navegação depois de uma pausa
// (debounce), sempre voltando à página 1. O input é controlado localmente
// para não piscar enquanto o servidor re-renderiza a lista.

import * as React from "react";
import { Search, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useProgressRouter } from "@/components/navigation-progress";

const DEBOUNCE_MS = 400;

export function SearchFilter({
  basePath,
  atual,
  query,
  placeholder = "Buscar…",
  rotulo = "Buscar",
}: {
  basePath: string;
  /** Termo que veio da URL. */
  atual: string;
  /** Demais parâmetros a preservar (período, ordenação, itens por página). */
  query: URLSearchParams;
  placeholder?: string;
  rotulo?: string;
}) {
  const router = useProgressRouter();
  const [texto, setTexto] = React.useState(atual);

  // A URL pode mudar por fora (voltar/avançar, limpar filtros): re-deriva o
  // texto em fase de render, padrão do React para estado vindo de prop.
  const [ultimoDaUrl, setUltimoDaUrl] = React.useState(atual);
  if (atual !== ultimoDaUrl) {
    setUltimoDaUrl(atual);
    setTexto(atual);
  }

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

  // Navega só quando a digitação para; o termo em curso é o do estado local.
  React.useEffect(() => {
    const termo = texto.trim();
    if (termo === atual) return;
    const t = setTimeout(() => {
      setUltimoDaUrl(termo);
      router.push(href(termo));
    }, DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [texto, atual, href, router]);

  return (
    <div className="relative w-full sm:max-w-xs">
      <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        type="search"
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        placeholder={placeholder}
        aria-label={rotulo}
        className="px-8"
      />
      {texto && (
        <Button
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
