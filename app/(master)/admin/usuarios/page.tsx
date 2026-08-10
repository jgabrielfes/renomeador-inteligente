// /admin/usuarios — tabela paginada de contas (somente MASTER).
// Paginação via query string: ?pagina=&porPagina= (10/25/50/100).

import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { MasterToggle } from "@/components/admin/master-toggle";
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

export default async function UsuariosPage({
  searchParams,
}: PageProps<"/admin/usuarios">) {
  const session = await requireMaster();

  const params = await searchParams;
  const paginacao = parsePaginacao(params);

  const [total, usuarios] = await Promise.all([
    prisma.user.count(),
    prisma.user.findMany({
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
        <h1 className="text-2xl font-semibold tracking-tight">Usuários</h1>
        <p className="text-sm text-muted-foreground">
          {total} conta(s) cadastrada(s).
        </p>
      </header>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>E-mail</TableHead>
              <TableHead>E-mail confirmado</TableHead>
              <TableHead>Cadastro</TableHead>
              <TableHead>Papel</TableHead>
              <TableHead>Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {usuarios.map((u) => (
              <TableRow key={u.id}>
                <TableCell className="font-medium">{u.name}</TableCell>
                <TableCell className="text-muted-foreground">
                  {u.email}
                </TableCell>
                <TableCell>
                  {u.emailVerified ? (
                    <Badge variant="secondary">Sim</Badge>
                  ) : (
                    <Badge
                      variant="outline"
                      className="border-amber-500/50 text-amber-600"
                    >
                      Não
                    </Badge>
                  )}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {dataCurta.format(u.createdAt)}
                </TableCell>
                <TableCell>
                  {u.role === "MASTER" ? (
                    <Badge>Master</Badge>
                  ) : (
                    <Badge variant="secondary">Usuário</Badge>
                  )}
                </TableCell>
                <TableCell>
                  {u.id === session.user.id ? (
                    <span className="text-xs text-muted-foreground">
                      (você)
                    </span>
                  ) : (
                    <MasterToggle
                      userId={u.id}
                      nome={u.name}
                      ehMaster={u.role === "MASTER"}
                    />
                  )}
                </TableCell>
              </TableRow>
            ))}
            {usuarios.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={6}
                  className="text-center text-muted-foreground"
                >
                  Nenhum usuário nesta página.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <QueryPagination
        basePath="/admin/usuarios"
        paginacao={paginacao}
        totalDeItens={total}
      />
    </main>
  );
}
