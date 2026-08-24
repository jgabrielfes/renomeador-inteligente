// /admin/feedback — bugs e sugestões enviados pelo dialog do shell (somente
// MASTER). Cada painel mostra só os relatos do PRÓPRIO site (coluna app).
// A equipe classifica a situação; o texto do usuário nunca é editado.

import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { PeriodFilter } from "@/components/admin/period-filter";
import { QueryPagination } from "@/components/admin/query-pagination";
import { SortableHeader } from "@/components/admin/sortable-header";
import { Badge } from "@/components/ui/badge";
import type { Prisma } from "@/lib/generated/prisma/client";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  dataCurta,
  filtroDeData,
  parseOrdenacao,
  parsePaginacao,
  parsePeriodo,
  queryDaTabela,
} from "@/lib/admin";
import { APP } from "@/lib/app";
import { requireMaster } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

import { StatusFeedback } from "./status-select";

const COLUNAS = ["data", "tipo", "status"] as const;
type Coluna = (typeof COLUNAS)[number];

function ordemDoPrisma(
  coluna: Coluna,
  direcao: "asc" | "desc"
): Prisma.FeedbackOrderByWithRelationInput {
  switch (coluna) {
    case "tipo":
      return { tipo: direcao };
    case "status":
      return { status: direcao };
    default:
      return { createdAt: direcao };
  }
}

export default async function FeedbackAdminPage({
  searchParams,
}: {
  // PageProps<"/admin/feedback"> só existe depois do typegen do build.
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireMaster();

  const params = await searchParams;
  const periodo = parsePeriodo(params.periodo);
  const createdAt = filtroDeData(periodo);
  const paginacao = parsePaginacao(params);
  const ordenacao = parseOrdenacao<Coluna>(params, COLUNAS, {
    coluna: "data",
    direcao: "desc",
  });
  const query = queryDaTabela({ periodo, paginacao, ordenacao });

  const [total, relatos] = await Promise.all([
    prisma.feedback.count({ where: { createdAt, app: APP } }),
    prisma.feedback.findMany({
      where: { createdAt, app: APP },
      orderBy: ordemDoPrisma(ordenacao.coluna, ordenacao.direcao),
      skip: (paginacao.pagina - 1) * paginacao.porPagina,
      take: paginacao.porPagina,
    }),
  ]);

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 px-4 py-6">
      <Link
        href="/admin"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Voltar para a administração
      </Link>

      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Feedback</h1>
        <p className="text-sm text-muted-foreground">
          Bugs e sugestões enviados pelos botões do shell. A severidade é
          classificada aqui — o relato do usuário nunca é editado.
        </p>
      </header>

      <PeriodFilter basePath="/admin/feedback" atual={periodo} query={query} />

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <SortableHeader
                coluna="data"
                ordenacao={ordenacao}
                basePath="/admin/feedback"
                query={query}
              >
                Data
              </SortableHeader>
              <SortableHeader
                coluna="tipo"
                ordenacao={ordenacao}
                basePath="/admin/feedback"
                query={query}
              >
                Tipo
              </SortableHeader>
              <TableHead>Relato</TableHead>
              <TableHead>Usuário</TableHead>
              <SortableHeader
                coluna="status"
                ordenacao={ordenacao}
                basePath="/admin/feedback"
                query={query}
              >
                Situação
              </SortableHeader>
            </TableRow>
          </TableHeader>
          <TableBody>
            {relatos.map((f) => (
              <TableRow key={f.id}>
                <TableCell className="whitespace-nowrap text-muted-foreground">
                  {dataCurta.format(f.createdAt)}
                </TableCell>
                <TableCell>
                  <Badge variant={f.tipo === "bug" ? "destructive" : "secondary"}>
                    {f.tipo === "bug" ? "bug" : `sugestão${f.categoria ? ` · ${f.categoria}` : ""}`}
                  </Badge>
                </TableCell>
                <TableCell className="max-w-md">
                  <details>
                    <summary className="font-medium">{f.titulo}</summary>
                    <p className="mt-1 text-sm whitespace-pre-wrap text-muted-foreground">
                      {f.descricao}
                    </p>
                    {f.pagina && (
                      <p className="mt-1 text-xs text-muted-foreground">página: {f.pagina}</p>
                    )}
                  </details>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {f.userEmail ?? "—"}
                </TableCell>
                <TableCell>
                  <StatusFeedback id={f.id} inicial={f.status} />
                </TableCell>
              </TableRow>
            ))}
            {relatos.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground">
                  Nenhum relato no período.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <QueryPagination
        basePath="/admin/feedback"
        paginacao={paginacao}
        totalDeItens={total}
        queryExtra={{
          periodo,
          ordenar: ordenacao.coluna,
          direcao: ordenacao.direcao,
        }}
      />
    </main>
  );
}
