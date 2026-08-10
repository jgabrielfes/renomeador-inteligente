// /admin/renomeacoes — lotes de arquivos renomeados (somente MASTER).
// A plataforma funciona deslogada, então o evento pode não ter usuário.

import Link from "next/link";
import { ArrowLeft } from "lucide-react";

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

export default async function RenomeacoesPage({
  searchParams,
}: PageProps<"/admin/renomeacoes">) {
  await requireMaster();

  const params = await searchParams;
  const paginacao = parsePaginacao(params);

  const [total, eventos] = await Promise.all([
    prisma.renameEvent.count(),
    prisma.renameEvent.findMany({
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
        <h1 className="text-2xl font-semibold tracking-tight">Renomeações</h1>
        <p className="text-sm text-muted-foreground">
          Um registro por lote concluído (renomeação na pasta ou download do
          zip). Sem nomes nem conteúdo de documento — só a contagem.
        </p>
      </header>

      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Data</TableHead>
              <TableHead>Usuário</TableHead>
              <TableHead className="text-right">Arquivos</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {eventos.map((e) => (
              <TableRow key={e.id}>
                <TableCell className="text-muted-foreground">
                  {dataCurta.format(e.createdAt)}
                </TableCell>
                <TableCell>
                  {e.user ? (
                    <span>
                      {e.user.name}{" "}
                      <span className="text-muted-foreground">
                        ({e.user.email})
                      </span>
                    </span>
                  ) : (
                    <Badge variant="outline">Deslogado</Badge>
                  )}
                </TableCell>
                <TableCell className="text-right font-medium tabular-nums">
                  {e.quantidade}
                </TableCell>
              </TableRow>
            ))}
            {eventos.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={3}
                  className="text-center text-muted-foreground"
                >
                  Nenhuma renomeação registrada nesta página.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <QueryPagination
        basePath="/admin/renomeacoes"
        paginacao={paginacao}
        totalDeItens={total}
      />
    </main>
  );
}
