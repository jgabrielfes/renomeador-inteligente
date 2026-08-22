// Administração (somente MASTER — gate no servidor via requireMaster).
// Resumo do site com filtro de período via QUERY STRING
// (?periodo=semana|mes|ano|tudo).
//
// DESENHO: um card por destino, e a métrica mora DENTRO dele. A versão
// anterior repetia cada assunto duas vezes — um card com o número, sem link, e
// outro logo abaixo com o mesmo nome, só com o link —, o que fazia a mesma
// informação aparecer em dois lugares e obrigava a percorrer a tela inteira
// para ligar um ao outro. Aqui cada assunto aparece UMA vez: rótulo, número,
// a leitura do número e, no rodapé, o detalhe secundário. O card inteiro é o
// link para a listagem correspondente.
//
// Cada site tem o SEU painel: o /admin do Renomeador mostra as contas, os
// lotes e os erros do Renomeador; o do Sucessorista, os dele (lib/app.ts).
// Nada aqui cruza a fronteira entre os dois, embora o banco seja o mesmo.

import Link from "next/link";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  FileCheck2,
  Radar,
  Scale,
  ScrollText,
  Users,
  type LucideIcon,
} from "lucide-react";

import { PeriodFilter } from "@/components/admin/period-filter";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Card,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { filtroDeData, parsePeriodo } from "@/lib/admin";
import { APP, EH_NOTAS, EH_SUCESSORISTA, IDENTIDADE } from "@/lib/app";
import { requireMaster } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { prisma } from "@/lib/prisma";

/** "1 lote" / "3 lotes" — sem o "(s)" que polui a leitura. */
function plural(n: number, singular: string, plural: string): string {
  return `${n} ${n === 1 ? singular : plural}`;
}

interface CardDoPainel {
  href: string;
  icon: LucideIcon;
  titulo: string;
  valor: number;
  /** Como ler o número — vai logo abaixo dele. */
  leitura: string;
  /** Detalhe secundário, no rodapé do card. */
  detalhes: string[];
  /** true = número em âmbar (algo pedindo atenção). */
  alerta?: boolean;
}

export default async function AdminPage({ searchParams }: PageProps<"/admin">) {
  await requireMaster();

  const { periodo: bruto } = await searchParams;
  const periodo = parsePeriodo(bruto);
  const createdAt = filtroDeData(periodo);

  // null = banco fora; a página avisa em vez de quebrar.
  let cards: CardDoPainel[] | null = null;
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
    ] = await Promise.all([
      // Total de contas do site (sem recorte de data): é o que a listagem
      // mostra. O recorte do período entra como "novas no período", no rodapé
      // — misturar os dois num número só era o que confundia antes.
      prisma.user.count({ where: { app: APP } }),
      prisma.user.count({ where: { createdAt, app: APP } }),
      prisma.renameEvent.aggregate({
        _sum: { quantidade: true },
        _count: { _all: true },
        where: { createdAt, app: APP },
      }),
      prisma.errorEvent.count({ where: { createdAt, app: APP } }),
      // Uma linha de CALCULO por inventário: conta casos, não recálculos.
      prisma.sucessoristaEvent.count({ where: { createdAt, acao: "CALCULO" } }),
      prisma.sucessoristaEvent.count({
        where: { createdAt, acao: "DOCUMENTO" },
      }),
      prisma.moduleAccess.count({
        where: { createdAt, modulo: IDENTIDADE.modulo },
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
    ]);

    const arquivos = renomeacoes._sum.quantidade ?? 0;
    const lotes = renomeacoes._count._all;

    cards = [
      // A produção da ferramenta vem primeiro: é o que o dono do produto abre
      // o painel para ver.
      ...(EH_SUCESSORISTA
        ? [
            {
              href: "/admin/sucessorista",
              icon: Scale,
              titulo: "Casos de inventário",
              valor: casos,
              leitura: "casos trabalhados no período",
              detalhes: [
                plural(
                  minutas,
                  "minuta ou planilha gerada",
                  "minutas ou planilhas geradas"
                ),
                "porte, rito e leitura do cofre",
              ],
            },
            {
              href: "/admin/radar",
              icon: Radar,
              titulo: "Radar de famílias",
              valor: radarPublicados,
              leitura: "casos publicados aguardando resposta",
              detalhes: [
                plural(
                  radarPerfisPendentes,
                  "perfil aguardando verificação da OAB",
                  "perfis aguardando verificação da OAB"
                ),
                plural(
                  radarDenunciasPendentes,
                  "denúncia pendente",
                  "denúncias pendentes"
                ),
              ],
              alerta: radarPerfisPendentes + radarDenunciasPendentes > 0,
            },
          ]
        : []),
      // No site do resolvedor a produção é a triagem de notas; o Renomeador
      // não roda lá, então o card de renomeações sai do painel.
      ...(EH_NOTAS
        ? [
            {
              href: "/admin/notas",
              icon: ScrollText,
              titulo: "Notas devolutivas",
              valor: notas._sum.quantidade ?? 0,
              leitura: "exigências triadas no período",
              detalhes: [
                plural(
                  notas._count._all,
                  "nota devolutiva triada",
                  "notas devolutivas triadas"
                ),
                "vias, precisão do classificador e minutas",
              ],
            },
          ]
        : [
            {
              href: "/admin/renomeacoes",
              icon: FileCheck2,
              titulo: "Renomeações",
              valor: arquivos,
              leitura: "arquivos analisados no período",
              detalhes: [
                plural(lotes, "lote enviado", "lotes enviados"),
                EH_SUCESSORISTA
                  ? "dentro do cofre dos casos"
                  : "por conta logada ou deslogada",
              ],
            },
          ]),
      {
        href: "/admin/usuarios",
        icon: Users,
        titulo: "Usuários",
        valor: totalUsuarios,
        leitura: "contas cadastradas neste site",
        detalhes: [
          novosUsuarios > 0
            ? `+${plural(novosUsuarios, "conta nova", "contas novas")} no período`
            : "nenhuma conta nova no período",
          `${plural(acessos, "abertura", "aberturas")} da ferramenta`,
        ],
      },
      {
        href: "/admin/erros",
        icon: AlertTriangle,
        titulo: "Erros",
        valor: erros,
        leitura: erros === 0 ? "nenhuma falha no período" : "falhas no período",
        detalhes: [
          erros === 0
            ? "a IA e as rotas responderam sem incidente"
            : "veja origem, usuário e detalhe de cada uma",
          "IA, rotas internas e fallback local",
        ],
        alerta: erros > 0,
      },
    ];
  } catch {
    // Banco indisponível/não configurado.
  }

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 px-4 py-6">
      <Link
        href="/"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Voltar para a ferramenta
      </Link>

      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Administração</h1>
        <p className="text-sm text-muted-foreground">
          {IDENTIDADE.nome}. Escolha o período e clique num cartão para ver a
          listagem completa.
        </p>
      </header>

      <PeriodFilter basePath="/admin" atual={periodo} />

      {cards === null ? (
        <Alert>
          <AlertTitle>Banco de dados indisponível</AlertTitle>
          <AlertDescription>
            Confira DATABASE_URL/DIRECT_URL no .env e rode `yarn db:migrate`.
          </AlertDescription>
        </Alert>
      ) : (
        // 4 cartões (Sucessorista) ficam melhor em 2×2 do que espremidos numa
        // linha só; 3 (Renomeador) cabem lado a lado.
        <div
          className={cn(
            "grid gap-4",
            cards.length === 4 ? "sm:grid-cols-2" : "sm:grid-cols-3"
          )}
        >
          {cards.map((c) => (
            <Link key={c.href} href={c.href} className="group">
              <Card className="h-full transition-colors group-hover:border-primary/50 group-hover:bg-accent/30">
                <CardHeader>
                  <CardDescription className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-1.5 font-medium text-foreground">
                      <c.icon className="size-4 text-muted-foreground" />
                      {c.titulo}
                    </span>
                    {/* A seta só aparece no hover: sinaliza que o cartão leva
                        a algum lugar, sem competir com o número. */}
                    <ArrowRight className="size-4 shrink-0 -translate-x-1 opacity-0 transition-all group-hover:translate-x-0 group-hover:opacity-100" />
                  </CardDescription>
                  <CardTitle
                    className={cn(
                      "text-4xl tabular-nums",
                      c.alerta && "text-amber-600",
                      // Zero não é notícia: fica esmaecido para os números que
                      // importam saltarem à vista na varredura do painel.
                      c.valor === 0 && !c.alerta && "text-muted-foreground"
                    )}
                  >
                    {c.valor}
                  </CardTitle>
                  <CardDescription>{c.leitura}</CardDescription>
                </CardHeader>
                {/* mt-auto + altura reservada para duas linhas: sem isso, os
                    cartões com menos detalhes deixariam o traço do rodapé numa
                    altura diferente dos vizinhos — desalinhamento sutil que é
                    exatamente o que faz um painel parecer bagunçado. */}
                <CardFooter className="mt-auto min-h-17 flex-col items-start gap-0.5 text-xs text-muted-foreground">
                  {c.detalhes.map((d) => (
                    <span key={d}>{d}</span>
                  ))}
                </CardFooter>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
