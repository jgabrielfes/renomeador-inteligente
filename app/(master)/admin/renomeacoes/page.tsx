// /admin/renomeacoes — lotes de arquivos renomeados (somente MASTER).
// A plataforma funciona deslogada, então o evento pode não ter usuário.

import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { QueryPagination } from "@/components/admin/query-pagination";
import {
  RenameEventDetails,
  type DetalhesEvento,
} from "@/components/admin/rename-event-details";
import { Badge } from "@/components/ui/badge";
import type { MetodoAnalise } from "@/lib/generated/prisma/enums";
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
          Um registro por método a cada rodada de análise (quando os arquivos
          são enviados para a IA ou para o OCR). Sem nomes nem conteúdo de
          documento — só contagem e método.
        </p>
      </header>

      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Data</TableHead>
              <TableHead>Usuário</TableHead>
              <TableHead>Método</TableHead>
              <TableHead className="text-right">Arquivos</TableHead>
              <TableHead className="w-12">Ações</TableHead>
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
                <TableCell>
                  <MetodoBadge metodo={e.metodo} />
                </TableCell>
                <TableCell className="text-right font-medium tabular-nums">
                  {e.quantidade}
                </TableCell>
                <TableCell>
                  <RenameEventDetails evento={paraDetalhes(e)} />
                </TableCell>
              </TableRow>
            ))}
            {eventos.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={5}
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

const METODO_ROTULOS: Record<MetodoAnalise, string> = {
  IA_ARQUIVO: "IA — arquivo",
  IA_TEXTO: "IA — texto",
  LOCAL: "Local",
};

function MetodoBadge({ metodo }: { metodo: MetodoAnalise }) {
  return (
    <Badge variant={metodo === "LOCAL" ? "outline" : "secondary"}>
      {METODO_ROTULOS[metodo]}
    </Badge>
  );
}

// Converte o registro do banco no formato serializável do dialog de detalhes.
function paraDetalhes(e: {
  createdAt: Date;
  metodo: MetodoAnalise;
  quantidade: number;
  duracaoMs: number | null;
  itens: unknown;
  desfecho: unknown;
  user: { name: string; email: string } | null;
}): DetalhesEvento {
  const itens = Array.isArray(e.itens)
    ? (e.itens as Array<{ tipo?: unknown; baixado?: unknown; otimizado?: unknown }>)
        .filter((item) => typeof item?.tipo === "string")
        .map((item) => ({
          tipo: item.tipo as string,
          baixado: item.baixado === true,
          otimizado: item.otimizado === true,
        }))
    : [];
  const bruto = (e.desfecho ?? null) as {
    zip?: unknown;
    montagem?: {
      subpastas?: unknown;
      converterPdf?: unknown;
      numerar?: unknown;
    };
  } | null;
  const desfecho = bruto
    ? {
        zip: bruto.zip === true,
        montagem: bruto.montagem
          ? {
              subpastas: bruto.montagem.subpastas === true,
              converterPdf: bruto.montagem.converterPdf === true,
              numerar: bruto.montagem.numerar === true,
            }
          : undefined,
      }
    : null;
  return {
    data: dataCurta.format(e.createdAt),
    usuario: e.user ? `${e.user.name} (${e.user.email})` : "Deslogado",
    metodo: METODO_ROTULOS[e.metodo],
    quantidade: e.quantidade,
    duracaoMs: e.duracaoMs,
    itens,
    desfecho,
  };
}
