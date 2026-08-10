"use client";

// Paginação das tabelas de administração — estado 100% na query string
// (?pagina=&porPagina=), convenção do AGENTS.md:
// - itens por página: Select (troca via useProgressRouter, volta à página 1);
// - navegação de páginas: componente Pagination do shadcn com números,
//   reticências e anterior/próxima (links SPA).

import { ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
} from "@/components/ui/pagination";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useProgressRouter } from "@/components/navigation-progress";
import { TAMANHOS_DE_PAGINA, type Paginacao } from "@/lib/admin";

// Janela de páginas: 1 … (atual-1, atual, atual+1) … última.
function janelaDePaginas(atual: number, total: number): Array<number | "…"> {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }
  const meio = [atual - 1, atual, atual + 1].filter(
    (p) => p > 1 && p < total
  );
  const paginas: Array<number | "…"> = [1];
  if (meio.length === 0 || meio[0] > 2) paginas.push("…");
  paginas.push(...meio);
  if (meio.length === 0 || meio[meio.length - 1] < total - 1) paginas.push("…");
  paginas.push(total);
  return paginas;
}

export function QueryPagination({
  basePath,
  paginacao,
  totalDeItens,
  queryExtra = {},
}: {
  basePath: string;
  paginacao: Paginacao;
  totalDeItens: number;
  /** Outros parâmetros a preservar na URL (ex.: periodo). */
  queryExtra?: Record<string, string>;
}) {
  const router = useProgressRouter();
  const { pagina, porPagina } = paginacao;
  const totalDePaginas = Math.max(1, Math.ceil(totalDeItens / porPagina));
  const atual = Math.min(pagina, totalDePaginas);

  const href = (novaPagina: number, novoPorPagina: number) => {
    const query = new URLSearchParams({
      ...queryExtra,
      pagina: String(novaPagina),
      porPagina: String(novoPorPagina),
    });
    return `${basePath}?${query}`;
  };

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
      <div className="flex items-center gap-2">
        <span className="text-muted-foreground">Itens por página:</span>
        <Select
          value={String(porPagina)}
          onValueChange={(valor) => router.push(href(1, Number(valor)))}
        >
          <SelectTrigger size="sm" aria-label="Itens por página">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TAMANHOS_DE_PAGINA.map((tamanho) => (
              <SelectItem key={tamanho} value={String(tamanho)}>
                {tamanho}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="text-muted-foreground">
          {totalDeItens} item(ns)
        </span>
      </div>

      <Pagination className="mx-0 w-fit">
        <PaginationContent>
          <PaginationItem>
            {atual <= 1 ? (
              <Button
                variant="ghost"
                size="icon"
                disabled
                aria-label="Página anterior"
              >
                <ChevronLeft className="size-4" />
              </Button>
            ) : (
              <PaginationLink
                href={href(atual - 1, porPagina)}
                aria-label="Página anterior"
              >
                <ChevronLeft className="size-4" />
              </PaginationLink>
            )}
          </PaginationItem>

          {janelaDePaginas(atual, totalDePaginas).map((p, index) => (
            <PaginationItem key={`${p}-${index}`}>
              {p === "…" ? (
                <PaginationEllipsis />
              ) : (
                <PaginationLink
                  href={href(p, porPagina)}
                  isActive={p === atual}
                >
                  {p}
                </PaginationLink>
              )}
            </PaginationItem>
          ))}

          <PaginationItem>
            {atual >= totalDePaginas ? (
              <Button
                variant="ghost"
                size="icon"
                disabled
                aria-label="Próxima página"
              >
                <ChevronRight className="size-4" />
              </Button>
            ) : (
              <PaginationLink
                href={href(atual + 1, porPagina)}
                aria-label="Próxima página"
              >
                <ChevronRight className="size-4" />
              </PaginationLink>
            )}
          </PaginationItem>
        </PaginationContent>
      </Pagination>
    </div>
  );
}
