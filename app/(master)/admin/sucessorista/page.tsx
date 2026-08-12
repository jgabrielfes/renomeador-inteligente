// /admin/sucessorista — uso do módulo de inventário (somente MASTER).
// Quatro ações medidas: leitura do cofre (etapa 0), caso calculado (UMA linha
// por inventário, atualizada conforme a folha evolui), documento gerado e
// portal do herdeiro. Privacidade: nada de nome, CPF ou valor de acervo — o
// porte do caso é sempre uma FAIXA.

import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { PeriodFilter } from "@/components/admin/period-filter";
import { QueryPagination } from "@/components/admin/query-pagination";
import { SortableHeader } from "@/components/admin/sortable-header";
import {
  SucessoristaEventDetails,
  type DetalhesSucessorista,
} from "@/components/admin/sucessorista-event-details";
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
import { FAIXAS_DE_PORTE } from "@/lib/porte";
import { prisma } from "@/lib/prisma";
import { ROTULO_ACAO, ROTULO_DOCUMENTO } from "@/lib/sucessorista-rotulos";

const COLUNAS = ["data", "usuario", "acao", "perfil", "quantidade"] as const;
type Coluna = (typeof COLUNAS)[number];

function ordemDoPrisma(
  coluna: Coluna,
  direcao: "asc" | "desc"
): Prisma.SucessoristaEventOrderByWithRelationInput {
  switch (coluna) {
    case "usuario":
      return { user: { name: direcao } };
    case "acao":
      return { acao: direcao };
    case "perfil":
      return { perfil: direcao };
    case "quantidade":
      return { quantidade: direcao };
    default:
      return { createdAt: direcao };
  }
}

export default async function AdminSucessoristaPage({
  searchParams,
}: PageProps<"/admin/sucessorista">) {
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

  const [total, eventos, porAcao, casos, documentos] = await Promise.all([
    prisma.sucessoristaEvent.count({ where: { createdAt } }),
    prisma.sucessoristaEvent.findMany({
      where: { createdAt },
      include: { user: { select: { name: true, email: true } } },
      orderBy: ordemDoPrisma(ordenacao.coluna, ordenacao.direcao),
      skip: (paginacao.pagina - 1) * paginacao.porPagina,
      take: paginacao.porPagina,
    }),
    prisma.sucessoristaEvent.groupBy({
      by: ["acao"],
      where: { createdAt },
      _count: { _all: true },
      _sum: { quantidade: true },
    }),
    // Retrato dos casos do período (uma linha por inventário trabalhado).
    prisma.sucessoristaEvent.findMany({
      where: { createdAt, acao: "CALCULO" },
      select: { dados: true, perfil: true, quantidade: true },
    }),
    prisma.sucessoristaEvent.findMany({
      where: { createdAt, acao: "DOCUMENTO" },
      select: { dados: true },
    }),
  ]);

  const contagem = (acao: string) =>
    porAcao.find((p) => p.acao === acao)?._count._all ?? 0;
  const somaQuantidade = (acao: string) =>
    porAcao.find((p) => p.acao === acao)?._sum.quantidade ?? 0;

  // Distribuição de porte e rito entre os casos trabalhados.
  const dadosCasos = casos.map((c) => (c.dados ?? {}) as Record<string, unknown>);
  const porPorte = FAIXAS_DE_PORTE.map((f) => ({
    rotulo: f.rotulo,
    quantidade: dadosCasos.filter((d) => d.porte === f.valor).length,
  })).filter((p) => p.quantidade > 0);
  const judiciais = dadosCasos.filter((d) => d.rito === "JUDICIAL").length;
  const comDiferenciada = dadosCasos.filter((d) => d.diferenciada === true).length;
  const herdeirosMedia =
    casos.length > 0
      ? casos.reduce((s, c) => s + c.quantidade, 0) / casos.length
      : 0;

  // Documentos gerados por tipo — o que o escritório realmente entrega.
  const porDocumento = new Map<string, number>();
  for (const doc of documentos) {
    const tipo = (doc.dados as { documento?: unknown } | null)?.documento;
    if (typeof tipo === "string") {
      porDocumento.set(tipo, (porDocumento.get(tipo) ?? 0) + 1);
    }
  }
  const docsOrdenados = [...porDocumento.entries()].sort((a, b) => b[1] - a[1]);

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
        <h1 className="text-2xl font-semibold tracking-tight">O Sucessorista</h1>
        <p className="text-sm text-muted-foreground">
          Leitura do cofre, casos calculados, documentos gerados e o portal do
          herdeiro. Sem nomes, CPF ou valores — o porte do acervo entra como
          faixa.
        </p>
      </header>

      <PeriodFilter basePath="/admin/sucessorista" atual={periodo} query={query} />

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader>
            <CardDescription>Casos trabalhados</CardDescription>
            <CardTitle className="text-3xl tabular-nums">
              {casos.length}
            </CardTitle>
            <CardDescription>
              {herdeirosMedia > 0
                ? `média de ${herdeirosMedia.toFixed(1)} herdeiro(s)`
                : "—"}
            </CardDescription>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Documentos lidos pelo cofre</CardDescription>
            <CardTitle className="text-3xl tabular-nums">
              {somaQuantidade("LEITURA_COFRE")}
            </CardTitle>
            <CardDescription>
              {contagem("LEITURA_COFRE")} leitura(s)
            </CardDescription>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Minutas e planilhas geradas</CardDescription>
            <CardTitle className="text-3xl tabular-nums">
              {contagem("DOCUMENTO")}
            </CardTitle>
            <CardDescription>
              {contagem("PORTAL")} evento(s) do portal
            </CardDescription>
          </CardHeader>
        </Card>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-lg border p-4">
          <p className="text-sm font-medium">Perfil dos casos</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {casos.length > 0 ? (
              <>
                <strong className="text-foreground">{judiciais}</strong> de{" "}
                {casos.length} caso(s) com rito judicial provável ·{" "}
                <strong className="text-foreground">{comDiferenciada}</strong>{" "}
                com partilha diferenciada.
              </>
            ) : (
              "Nenhum caso calculado no período."
            )}
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {porPorte.map((p) => (
              <Badge key={p.rotulo} variant="secondary">
                {p.rotulo}: {p.quantidade}
              </Badge>
            ))}
          </div>
        </div>
        <div className="rounded-lg border p-4">
          <p className="text-sm font-medium">O que o escritório entrega</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {docsOrdenados.length > 0 ? (
              docsOrdenados.map(([tipo, n]) => (
                <Badge key={tipo} variant="secondary">
                  {ROTULO_DOCUMENTO[tipo] ?? tipo}: {n}
                </Badge>
              ))
            ) : (
              <span className="text-sm text-muted-foreground">
                Nenhum documento gerado no período.
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
                basePath="/admin/sucessorista"
                query={query}
              >
                Data
              </SortableHeader>
              <SortableHeader
                coluna="usuario"
                ordenacao={ordenacao}
                basePath="/admin/sucessorista"
                query={query}
              >
                Usuário
              </SortableHeader>
              <SortableHeader
                coluna="acao"
                ordenacao={ordenacao}
                basePath="/admin/sucessorista"
                query={query}
              >
                Ação
              </SortableHeader>
              <SortableHeader
                coluna="perfil"
                ordenacao={ordenacao}
                basePath="/admin/sucessorista"
                query={query}
              >
                Perfil
              </SortableHeader>
              <SortableHeader
                coluna="quantidade"
                ordenacao={ordenacao}
                basePath="/admin/sucessorista"
                query={query}
                className="text-right"
              >
                Quantidade
              </SortableHeader>
              <TableHead className="w-12">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {eventos.map((e) => {
              const detalhes: DetalhesSucessorista = {
                data: dataCurta.format(e.createdAt),
                usuario: e.user
                  ? `${e.user.name} (${e.user.email})`
                  : "Herdeiro (portal)",
                acao: e.acao,
                perfil: e.perfil,
                quantidade: e.quantidade,
                duracaoMs: e.duracaoMs,
                casoId: e.casoId,
                dados: (e.dados ?? null) as Record<string, unknown> | null,
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
                      <Badge variant="outline">Herdeiro (portal)</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={e.acao === "DOCUMENTO" ? "default" : "secondary"}
                    >
                      {ROTULO_ACAO[e.acao] ?? e.acao}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {e.perfil
                      ? e.perfil === "ADVOGADO"
                        ? "Advogado(a)"
                        : "Escrevente"
                      : "—"}
                  </TableCell>
                  <TableCell className="text-right font-medium tabular-nums">
                    {e.quantidade > 0 ? e.quantidade : "—"}
                  </TableCell>
                  <TableCell>
                    <SucessoristaEventDetails evento={detalhes} />
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
                  Nenhuma atividade registrada no período.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <QueryPagination
        basePath="/admin/sucessorista"
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
