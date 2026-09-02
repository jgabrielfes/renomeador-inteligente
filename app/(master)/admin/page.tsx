// Administração (somente MASTER — gate no servidor via requireMaster).
// Resumo do site com filtro de período via QUERY STRING
// (?periodo=semana|mes|ano|tudo).
//
// DESENHO: duas seções em vez da grade de cartões. A versão em cards misturava
// papel de métrica com papel de link (clicar no cartão inteiro era "confuso",
// no reporte do escritório) e dava o mesmo peso ao que precisa de ação e ao
// que é só leitura. Aqui:
//   1. "Precisa de você" — SÓ o que aguarda ação (feedback, fila da OAB,
//      denúncias, erros), como linhas com contagem; some quando não há nada.
//   2. "Atividade" — os números do período em linhas compactas, cada uma com
//      o link "Abrir" EXPLÍCITO para a listagem (levando o período junto).
// A navegação entre seções é a barra do layout — o resumo deixou de ser o
// único caminho para as listagens. Renomeações saiu do painel da LexCausa
// (pedido do escritório); segue no site do Renomeador.
//
// Cada site tem o SEU painel: nada aqui cruza a fronteira entre plataformas,
// embora o banco seja o mesmo (lib/app.ts).

import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { PeriodFilter } from "@/components/admin/period-filter";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { filtroDeData, parsePeriodo, type Periodo } from "@/lib/admin";
import { EH_NOTAS, EH_SUCESSORISTA, appComConta, moduloDaPlataforma } from "@/lib/app";
import { emStandby } from "@/lib/standby";
import { requireMaster } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { prisma } from "@/lib/prisma";

/** "1 lote" / "3 lotes" — sem o "(s)" que polui a leitura. */
function plural(n: number, singular: string, plural: string): string {
  return `${n} ${n === 1 ? singular : plural}`;
}

interface Pendencia {
  href: string;
  rotulo: string;
  /** O que fazer ao abrir — completa a leitura da linha. */
  acao: string;
  n: number;
}

interface LinhaAtividade {
  href: string;
  rotulo: string;
  valor: number;
  /** Detalhe curto ao lado do rótulo (ex.: "12 minutas geradas"). */
  detalhe?: string;
}

export default async function AdminPage({ searchParams }: PageProps<"/admin">) {
  await requireMaster();

  const { periodo: bruto } = await searchParams;
  const periodo = parsePeriodo(bruto);
  const createdAt = filtroDeData(periodo);

  // null = banco fora; a página avisa em vez de quebrar.
  let dados: { pendencias: Pendencia[]; atividade: LinhaAtividade[] } | null =
    null;
  try {
    const [
      totalUsuarios,
      novosUsuarios,
      renomeacoes,
      erros,
      casos,
      minutas,
      acessos,
      notas,
      radarPublicados,
      radarPerfisPendentes,
      radarDenunciasPendentes,
      feedbackAbertos,
    ] = await Promise.all([
      // Total de contas do site (sem recorte de data): é o que a listagem
      // mostra; o recorte do período entra como "novas no período".
      prisma.user.count({ where: { app: appComConta() } }),
      prisma.user.count({ where: { createdAt, app: appComConta() } }),
      prisma.renameEvent.aggregate({
        _sum: { quantidade: true },
        _count: { _all: true },
        where: { createdAt, app: appComConta() },
      }),
      prisma.errorEvent.count({ where: { createdAt, app: appComConta() } }),
      // Uma linha de CALCULO por inventário: conta casos, não recálculos.
      prisma.sucessoristaEvent.count({ where: { createdAt, acao: "CALCULO" } }),
      prisma.sucessoristaEvent.count({
        where: { createdAt, acao: "DOCUMENTO" },
      }),
      prisma.moduleAccess.count({
        where: { createdAt, modulo: moduloDaPlataforma() },
      }),
      // Notas triadas no período (a tabela inteira é do site do resolvedor).
      prisma.notaEvent.aggregate({
        _sum: { quantidade: true },
        _count: { _all: true },
        where: { createdAt },
      }),
      // Radar de famílias (estado ATUAL, não período): casos abertos e filas.
      prisma.familiaIntake.count({ where: { status: "publicado" } }),
      prisma.advogadoPerfil.count({ where: { situacao: "pendente" } }),
      prisma.radarDenuncia.count({ where: { status: "pendente" } }),
      // Feedback do shell (bugs e sugestões) — estado atual, não período.
      prisma.feedback.count({
        where: { app: appComConta(), status: { not: "resolvido" } },
      }),
    ]);

    // O link leva o período junto quando a listagem de destino o entende —
    // o recorte escolhido aqui não se perde no clique.
    const com = (base: string, p: Periodo) => `${base}?periodo=${p}`;

    const pendencias: Pendencia[] = [
      {
        href: "/admin/feedback",
        rotulo: "Feedback aguardando a equipe",
        acao: "classifique bug × sugestão e a situação",
        n: feedbackAbertos,
      },
      ...(EH_SUCESSORISTA && !emStandby("radar")
        ? [
            {
              href: "/admin/radar",
              rotulo: "Perfis aguardando verificação da OAB",
              acao: "aprove ou recuse na fila do Radar",
              n: radarPerfisPendentes,
            },
            {
              href: "/admin/radar",
              rotulo: "Denúncias do Radar pendentes",
              acao: "acatar suspende o perfil denunciado",
              n: radarDenunciasPendentes,
            },
          ]
        : []),
      {
        href: com("/admin/erros", periodo),
        rotulo: "Erros no período",
        acao: "veja origem, usuário e detalhe de cada um",
        n: erros,
      },
    ].filter((p) => p.n > 0);

    const atividade: LinhaAtividade[] = [
      ...(EH_SUCESSORISTA
        ? [
            {
              href: com("/admin/sucessorista", periodo),
              rotulo: "Casos de inventário trabalhados",
              valor: casos,
              detalhe: plural(minutas, "minuta gerada", "minutas geradas"),
            },
            ...(emStandby("radar")
              ? []
              : [
                  {
                    href: "/admin/radar",
                    rotulo: "Casos publicados no Radar",
                    valor: radarPublicados,
                    detalhe: "aguardando resposta de advogado(a)",
                  },
                ]),
          ]
        : []),
      ...(EH_NOTAS
        ? [
            {
              href: com("/admin/notas", periodo),
              rotulo: "Exigências triadas",
              valor: notas._sum.quantidade ?? 0,
              detalhe: plural(
                notas._count._all,
                "nota devolutiva",
                "notas devolutivas"
              ),
            },
          ]
        : []),
      // Renomeações: só no site do Renomeador — na LexCausa o recurso embutido
      // não é acompanhado pelo painel (pedido do escritório).
      ...(!EH_SUCESSORISTA && !EH_NOTAS
        ? [
            {
              href: com("/admin/renomeacoes", periodo),
              rotulo: "Arquivos analisados",
              valor: renomeacoes._sum.quantidade ?? 0,
              detalhe: plural(
                renomeacoes._count._all,
                "lote enviado",
                "lotes enviados"
              ),
            },
          ]
        : []),
      {
        href: com("/admin/usuarios", periodo),
        rotulo: "Aberturas da ferramenta",
        valor: acessos,
        detalhe: "uma por sessão do navegador",
      },
      {
        href: com("/admin/usuarios", periodo),
        rotulo: "Contas cadastradas",
        valor: totalUsuarios,
        detalhe:
          novosUsuarios > 0
            ? `+${plural(novosUsuarios, "nova no período", "novas no período")}`
            : "nenhuma nova no período",
      },
    ];

    dados = { pendencias, atividade };
  } catch {
    // Banco indisponível/não configurado.
  }

  return (
    <main className="flex flex-col gap-6">
      {dados === null ? (
        <Alert>
          <AlertTitle>Banco de dados indisponível</AlertTitle>
          <AlertDescription>
            Confira DATABASE_URL/DIRECT_URL no .env e rode `yarn db:migrate`.
          </AlertDescription>
        </Alert>
      ) : (
        <>
          <section className="space-y-2">
            <h2 className="text-sm font-medium text-muted-foreground">
              Precisa de você
            </h2>
            {dados.pendencias.length === 0 ? (
              <p className="rounded-lg border border-dashed px-4 py-3 text-sm text-muted-foreground">
                Nada aguardando ação sua.
              </p>
            ) : (
              <div className="divide-y rounded-lg border">
                {dados.pendencias.map((p) => (
                  <Link
                    key={p.rotulo}
                    href={p.href}
                    className="group flex items-center gap-3 px-4 py-3 transition-colors hover:bg-accent/40"
                  >
                    <Badge
                      variant="destructive"
                      className="min-w-8 justify-center tabular-nums"
                    >
                      {p.n}
                    </Badge>
                    <span className="flex-1">
                      <span className="block text-sm font-medium">
                        {p.rotulo}
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        {p.acao}
                      </span>
                    </span>
                    <ArrowRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                  </Link>
                ))}
              </div>
            )}
          </section>

          <section className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-medium text-muted-foreground">
                Atividade
              </h2>
              <PeriodFilter basePath="/admin" atual={periodo} />
            </div>
            <div className="divide-y rounded-lg border">
              {dados.atividade.map((l) => (
                <div
                  key={l.rotulo}
                  className="flex items-center gap-3 px-4 py-3"
                >
                  <span
                    className={cn(
                      "min-w-14 text-right text-xl font-semibold tabular-nums",
                      // Zero não é notícia: esmaecido para os números que
                      // importam saltarem à vista.
                      l.valor === 0 && "text-muted-foreground"
                    )}
                  >
                    {l.valor}
                  </span>
                  <span className="flex-1">
                    <span className="block text-sm font-medium">{l.rotulo}</span>
                    {l.detalhe && (
                      <span className="block text-xs text-muted-foreground">
                        {l.detalhe}
                      </span>
                    )}
                  </span>
                  <Link
                    href={l.href}
                    className="inline-flex shrink-0 items-center gap-1 text-sm text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                  >
                    Abrir
                    <ArrowRight className="size-3.5" />
                  </Link>
                </div>
              ))}
            </div>
          </section>
        </>
      )}
    </main>
  );
}
