// /admin/notas — uso do Resolvedor de Notas Devolutivas (somente MASTER).
// Uma linha por TRIAGEM de nota: o momento em que a nota é decomposta em
// exigências e cada uma cai numa via de resolução. Sem texto da nota, nomes de
// pessoa/arquivo ou prenotação — só tags do vocabulário do módulo e contagens.

import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import {
  NotaEventDetails,
  type DetalhesNota,
  type ItemDaNota,
} from "@/components/admin/nota-event-details";
import { PeriodFilter } from "@/components/admin/period-filter";
import { QueryPagination } from "@/components/admin/query-pagination";
import { SortableHeader } from "@/components/admin/sortable-header";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import { requireMaster } from "@/lib/auth";
import type { Prisma } from "@/lib/generated/prisma/client";
import { ROTULO_VIA } from "@/lib/notas-rotulos";
import { prisma } from "@/lib/prisma";

const COLUNAS = ["data", "usuario", "exigencias", "fonte", "arquivos"] as const;
type Coluna = (typeof COLUNAS)[number];

function ordemDoPrisma(
  coluna: Coluna,
  direcao: "asc" | "desc"
): Prisma.NotaEventOrderByWithRelationInput {
  switch (coluna) {
    case "usuario":
      return { user: { name: direcao } };
    case "exigencias":
      return { quantidade: direcao };
    case "fonte":
      return { fonte: direcao };
    case "arquivos":
      return { arquivos: direcao };
    default:
      return { createdAt: direcao };
  }
}

function paraItens(bruto: unknown): ItemDaNota[] {
  if (!Array.isArray(bruto)) return [];
  return bruto
    .filter((i): i is Record<string, unknown> => typeof i === "object" && i !== null)
    .map((i) => ({
      via: typeof i.via === "string" ? i.via : "INDEFINIDO",
      viaFinal: typeof i.viaFinal === "string" ? i.viaFinal : undefined,
      alvos: Array.isArray(i.alvos)
        ? i.alvos.filter((a): a is string => typeof a === "string")
        : [],
      temGatilho: i.temGatilho === true,
      pessoas: typeof i.pessoas === "number" ? i.pessoas : 0,
      achadosNaPasta:
        typeof i.achadosNaPasta === "number" ? i.achadosNaPasta : undefined,
      status: typeof i.status === "string" ? i.status : undefined,
      peca: typeof i.peca === "string" ? i.peca : undefined,
      comIa: i.comIa === true,
      camposIa: typeof i.camposIa === "number" ? i.camposIa : undefined,
      faltando: typeof i.faltando === "number" ? i.faltando : undefined,
      baixouMinuta: i.baixouMinuta === true,
      baixouJuntada: i.baixouJuntada === true,
    }));
}

export default async function AdminNotasPage({
  searchParams,
}: PageProps<"/admin/notas">) {
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

  const [total, eventos, agregado, doPeriodo] = await Promise.all([
    prisma.notaEvent.count({ where: { createdAt } }),
    prisma.notaEvent.findMany({
      where: { createdAt },
      include: { user: { select: { name: true, email: true } } },
      orderBy: ordemDoPrisma(ordenacao.coluna, ordenacao.direcao),
      skip: (paginacao.pagina - 1) * paginacao.porPagina,
      take: paginacao.porPagina,
    }),
    prisma.notaEvent.aggregate({
      where: { createdAt },
      _sum: { quantidade: true },
      _avg: { quantidade: true },
    }),
    // Para as métricas de qualidade é preciso varrer os itens do período.
    prisma.notaEvent.findMany({ where: { createdAt }, select: { itens: true } }),
  ]);

  const itensDoPeriodo = doPeriodo.flatMap((e) => paraItens(e.itens));
  const semRegra = itensDoPeriodo.filter((i) => !i.temGatilho).length;
  const corrigidas = itensDoPeriodo.filter(
    (i) => i.viaFinal && i.viaFinal !== i.via
  ).length;
  const minutas = itensDoPeriodo.filter((i) => i.peca).length;
  const comIa = itensDoPeriodo.filter((i) => i.comIa).length;
  const entregas = itensDoPeriodo.filter(
    (i) => i.baixouMinuta || i.baixouJuntada
  ).length;

  // Distribuição de vias: que tipo de exigência o registrador mais devolve.
  const porVia = new Map<string, number>();
  for (const item of itensDoPeriodo) {
    const via = item.viaFinal ?? item.via;
    porVia.set(via, (porVia.get(via) ?? 0) + 1);
  }
  const vias = [...porVia.entries()].sort((a, b) => b[1] - a[1]);
  const exigencias = agregado._sum.quantidade ?? 0;

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
        <h1 className="text-2xl font-semibold tracking-tight">
          Resolvedor de notas
        </h1>
        <p className="text-sm text-muted-foreground">
          Uma linha por triagem de nota devolutiva. Sem texto da nota nem nomes
          — só as tags de via de resolução, contagens e desfechos.
        </p>
      </header>

      <PeriodFilter basePath="/admin/notas" atual={periodo} query={query} />

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader>
            <CardDescription>Notas triadas</CardDescription>
            <CardTitle className="text-3xl tabular-nums">{total}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Exigências classificadas</CardDescription>
            <CardTitle className="text-3xl tabular-nums">
              {exigencias}
            </CardTitle>
            <CardDescription>
              {agregado._avg.quantidade
                ? `média de ${agregado._avg.quantidade.toFixed(1)} por nota`
                : "—"}
            </CardDescription>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Minutas geradas</CardDescription>
            <CardTitle className="text-3xl tabular-nums">{minutas}</CardTitle>
            <CardDescription>
              {comIa > 0 ? `${comIa} com redação por IA` : "nenhuma com IA"} ·{" "}
              {entregas} entrega(s)
            </CardDescription>
          </CardHeader>
        </Card>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-lg border p-4">
          <p className="text-sm font-medium">Precisão do classificador</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {itensDoPeriodo.length > 0 ? (
              <>
                <strong className="text-foreground">
                  {semRegra} de {itensDoPeriodo.length}
                </strong>{" "}
                exigência(s) sem regra local (caíram em &ldquo;classificar à
                mão&rdquo;) e{" "}
                <strong className="text-foreground">{corrigidas}</strong> via(s)
                corrigida(s) pelo usuário. Correção alta indica calibração
                pendente em <code>lib/notas/resolvedor.ts</code>.
              </>
            ) : (
              "Sem exigências no período."
            )}
          </p>
        </div>
        <div className="rounded-lg border p-4">
          <p className="text-sm font-medium">Vias mais exigidas</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {vias.length > 0 ? (
              vias.map(([via, n]) => (
                <Badge key={via} variant="secondary">
                  {ROTULO_VIA[via] ?? via}: {n}
                </Badge>
              ))
            ) : (
              <span className="text-sm text-muted-foreground">
                Sem dados no período.
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <SortableHeader
                coluna="data"
                ordenacao={ordenacao}
                basePath="/admin/notas"
                query={query}
              >
                Data
              </SortableHeader>
              <SortableHeader
                coluna="usuario"
                ordenacao={ordenacao}
                basePath="/admin/notas"
                query={query}
              >
                Usuário
              </SortableHeader>
              <SortableHeader
                coluna="fonte"
                ordenacao={ordenacao}
                basePath="/admin/notas"
                query={query}
              >
                Origem
              </SortableHeader>
              <SortableHeader
                coluna="exigencias"
                ordenacao={ordenacao}
                basePath="/admin/notas"
                query={query}
                className="text-right"
              >
                Exigências
              </SortableHeader>
              <SortableHeader
                coluna="arquivos"
                ordenacao={ordenacao}
                basePath="/admin/notas"
                query={query}
                className="text-right"
              >
                Pasta
              </SortableHeader>
              <TableHead className="w-12">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {eventos.map((e) => {
              const itens = paraItens(e.itens);
              const detalhes: DetalhesNota = {
                data: dataCurta.format(e.createdAt),
                usuario: e.user
                  ? `${e.user.name} (${e.user.email})`
                  : "Deslogado",
                fonte: e.fonte,
                manual: e.manual,
                arquivos: e.arquivos,
                duracaoMs: e.duracaoMs,
                duracaoPasta: e.duracaoPasta,
                itens,
              };
              return (
                <TableRow key={e.id}>
                  <TableCell className="whitespace-nowrap text-muted-foreground">
                    {dataCurta.format(e.createdAt)}
                  </TableCell>
                  <TableCell>
                    {e.user ? (
                      <span title={e.user.email}>{e.user.name}</span>
                    ) : (
                      <Badge variant="outline">Deslogado</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <span className="inline-flex flex-wrap items-center gap-1">
                      <Badge variant="secondary">{e.fonte}</Badge>
                      {e.manual && <Badge variant="outline">à mão</Badge>}
                    </span>
                  </TableCell>
                  <TableCell className="text-right font-medium tabular-nums">
                    {e.quantidade}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">
                    {e.arquivos > 0 ? e.arquivos : "—"}
                  </TableCell>
                  <TableCell>
                    <NotaEventDetails evento={detalhes} />
                  </TableCell>
                </TableRow>
              );
            })}
            {eventos.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={6}
                  className="text-center text-muted-foreground"
                >
                  Nenhuma triagem registrada no período.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <QueryPagination
        basePath="/admin/notas"
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
