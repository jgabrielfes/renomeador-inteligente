// Cabeçalho de tabela ordenável das telas /admin. A ordem vive na query
// string (?ordenar=coluna&direcao=asc|desc) e é aplicada NO BANCO — este
// componente só monta o link. Clicar na coluna ativa inverte a direção;
// clicar em outra começa pela ordem mais útil dela (desc, definido na página).

import Link from "next/link";
import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";

import { TableHead } from "@/components/ui/table";
import type { Ordenacao } from "@/lib/admin";

export function SortableHeader({
  coluna,
  ordenacao,
  basePath,
  query,
  className,
  children,
}: {
  /** Valor que vai para ?ordenar= — precisa estar na lista fechada da página. */
  coluna: string;
  ordenacao: Ordenacao;
  basePath: string;
  /** Demais parâmetros a preservar (período, itens por página…). */
  query: URLSearchParams;
  className?: string;
  children: React.ReactNode;
}) {
  const ativa = ordenacao.coluna === coluna;
  // Volta à página 1: a linha procurada quase nunca está na página atual
  // depois de reordenar.
  const proxima = new URLSearchParams(query);
  proxima.set("ordenar", coluna);
  proxima.set("direcao", ativa && ordenacao.direcao === "desc" ? "asc" : "desc");
  proxima.set("pagina", "1");

  const Icone = !ativa ? ChevronsUpDown : ordenacao.direcao === "asc" ? ArrowUp : ArrowDown;

  return (
    <TableHead className={className} aria-sort={ativa ? (ordenacao.direcao === "asc" ? "ascending" : "descending") : "none"}>
      <Link
        href={`${basePath}?${proxima}`}
        className={`inline-flex items-center gap-1 whitespace-nowrap hover:text-foreground ${
          ativa ? "text-foreground" : "text-muted-foreground"
        }`}
      >
        {children}
        <Icone className={`size-3.5 shrink-0 ${ativa ? "" : "opacity-50"}`} />
      </Link>
    </TableHead>
  );
}
