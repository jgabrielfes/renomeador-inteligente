// /admin/erros — todos os erros registrados da plataforma (somente MASTER).
// Hoje as rotas de IA (/api/rename, /api/sucessorista, /api/notas) registram as falhas; a
// plataforma funciona deslogada, então o erro pode não ter usuário.

import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import {
  ErrorEventDetails,
} from "@/components/admin/error-event-details";
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

const COLUNAS = ["data", "origem", "usuario", "status"] as const;
type Coluna = (typeof COLUNAS)[number];

function ordemDoPrisma(
  coluna: Coluna,
  direcao: "asc" | "desc"
): Prisma.ErrorEventOrderByWithRelationInput {
  switch (coluna) {
    case "origem":
      return { origem: direcao };
    case "usuario":
      return { user: { name: direcao } };
    case "status":
      return { status: direcao };
    default:
      return { createdAt: direcao };
  }
}

export default async function ErrosPage({
  searchParams,
}: PageProps<"/admin/erros">) {
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

  const [total, erros] = await Promise.all([
    prisma.errorEvent.count({ where: { createdAt, app: APP } }),
    prisma.errorEvent.findMany({
      // Falhas deste site apenas — o outro tem o próprio painel.
      where: { createdAt, app: APP },
      include: { user: { select: { name: true, email: true } } },
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
        <h1 className="text-2xl font-semibold tracking-tight">Erros</h1>
        <p className="text-sm text-muted-foreground">
          Falhas registradas pela plataforma — as rotas de IA registram cota
          excedida, indisponibilidade do Gemini e erros inesperados.
        </p>
      </header>

      <PeriodFilter basePath="/admin/erros" atual={periodo} query={query} />

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <SortableHeader
                coluna="data"
                ordenacao={ordenacao}
                basePath="/admin/erros"
                query={query}
              >
                Data
              </SortableHeader>
              <SortableHeader
                coluna="origem"
                ordenacao={ordenacao}
                basePath="/admin/erros"
                query={query}
              >
                Origem
              </SortableHeader>
              <SortableHeader
                coluna="usuario"
                ordenacao={ordenacao}
                basePath="/admin/erros"
                query={query}
              >
                Usuário
              </SortableHeader>
              <SortableHeader
                coluna="status"
                ordenacao={ordenacao}
                basePath="/admin/erros"
                query={query}
              >
                Status
              </SortableHeader>
              <TableHead className="w-12">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {erros.map((e) => (
              <TableRow key={e.id}>
                <TableCell className="whitespace-nowrap text-muted-foreground">
                  {dataCurta.format(e.createdAt)}
                </TableCell>
                <TableCell>
                  <Badge variant="secondary">{e.origem}</Badge>
                </TableCell>
                <TableCell>
                  {e.user ? (
                    <span title={e.user.email}>{e.user.name}</span>
                  ) : (
                    <Badge variant="outline">Deslogado</Badge>
                  )}
                </TableCell>
                <TableCell className="tabular-nums">
                  {e.status ?? "—"}
                </TableCell>
                <TableCell>
                  <ErrorEventDetails
                    erro={{
                      data: dataCurta.format(e.createdAt),
                      usuario: e.user
                        ? `${e.user.name} (${e.user.email})`
                        : "Deslogado",
                      origem: e.origem,
                      status: e.status,
                      mensagem: e.mensagem,
                    }}
                  />
                </TableCell>
              </TableRow>
            ))}
            {erros.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={5}
                  className="text-center text-muted-foreground"
                >
                  Nenhum erro registrado no período. 🎉
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <QueryPagination
        basePath="/admin/erros"
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
