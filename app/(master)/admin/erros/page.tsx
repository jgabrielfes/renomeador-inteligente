// /admin/erros — todos os erros registrados da plataforma (somente MASTER).
// Hoje as rotas de IA (/api/rename, /api/notas) registram as falhas; a
// plataforma funciona deslogada, então o erro pode não ter usuário.

import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import {
  ErrorEventDetails,
} from "@/components/admin/error-event-details";
import { QueryPagination } from "@/components/admin/query-pagination";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { dataCurta, parsePaginacao } from "@/lib/admin";
import { requireMaster } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export default async function ErrosPage({
  searchParams,
}: PageProps<"/admin/erros">) {
  await requireMaster();

  const params = await searchParams;
  const paginacao = parsePaginacao(params);

  const [total, erros] = await Promise.all([
    prisma.errorEvent.count(),
    prisma.errorEvent.findMany({
      include: { user: { select: { name: true, email: true } } },
      orderBy: { createdAt: "desc" },
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

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Data</TableHead>
              <TableHead>Origem</TableHead>
              <TableHead>Usuário</TableHead>
              <TableHead>Status</TableHead>
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
                  Nenhum erro registrado nesta página. 🎉
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
      />
    </main>
  );
}
