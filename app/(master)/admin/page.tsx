// Administração (somente MASTER — gate no servidor via requireMaster).
// Resumo da plataforma com filtro de período via QUERY STRING
// (?periodo=semana|mes|ano|tudo) e cards de navegação para as listagens.

import Link from "next/link";
import {
  AlertTriangle,
  ArrowLeft,
  FileCheck2,
  FileWarning,
  MousePointerClick,
  Scale,
  Users,
} from "lucide-react";

import { PeriodFilter } from "@/components/admin/period-filter";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { filtroDeData, parsePeriodo } from "@/lib/admin";
import { requireMaster } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const LISTAGENS = [
  {
    href: "/admin/usuarios",
    icon: Users,
    titulo: "Usuários",
    descricao:
      "Contas cadastradas, papel de acesso e quantos acessos cada uma fez a cada módulo.",
  },
  {
    href: "/admin/renomeacoes",
    icon: FileCheck2,
    titulo: "Renomeações",
    descricao: "Lotes de arquivos renomeados, por usuário ou deslogado.",
  },
  {
    href: "/admin/notas",
    icon: FileWarning,
    titulo: "Resolvedor de notas",
    descricao:
      "Notas triadas, vias de resolução exigidas, precisão do classificador e minutas geradas.",
  },
  {
    href: "/admin/sucessorista",
    icon: Scale,
    titulo: "O Sucessorista",
    descricao:
      "Casos de inventário trabalhados, porte e rito, leitura do cofre e minutas entregues.",
  },
  {
    href: "/admin/erros",
    icon: AlertTriangle,
    titulo: "Erros",
    descricao: "Falhas da plataforma (IA inclusa): origem, usuário e detalhe.",
  },
] as const;

export default async function AdminPage({ searchParams }: PageProps<"/admin">) {
  await requireMaster();

  const { periodo: bruto } = await searchParams;
  const periodo = parsePeriodo(bruto);
  const createdAt = filtroDeData(periodo);

  let usuarios: number | null = null;
  let arquivosRenomeados = 0;
  let erros = 0;
  let exigencias = 0;
  let notas = 0;
  let casos = 0;
  let minutas = 0;
  let acessos = 0;
  try {
    const [
      contagemUsuarios,
      somaRenomeados,
      contagemErros,
      agregadoNotas,
      contagemCasos,
      contagemMinutas,
      contagemAcessos,
    ] = await Promise.all([
      prisma.user.count({ where: { createdAt } }),
      prisma.renameEvent.aggregate({
        _sum: { quantidade: true },
        where: { createdAt },
      }),
      prisma.errorEvent.count({ where: { createdAt } }),
      prisma.notaEvent.aggregate({
        _sum: { quantidade: true },
        _count: { _all: true },
        where: { createdAt },
      }),
      // Uma linha de CALCULO por inventário: conta casos, não recálculos.
      prisma.sucessoristaEvent.count({
        where: { createdAt, acao: "CALCULO" },
      }),
      prisma.sucessoristaEvent.count({
        where: { createdAt, acao: "DOCUMENTO" },
      }),
      prisma.moduleAccess.count({ where: { createdAt } }),
    ]);
    usuarios = contagemUsuarios;
    arquivosRenomeados = somaRenomeados._sum.quantidade ?? 0;
    erros = contagemErros;
    exigencias = agregadoNotas._sum.quantidade ?? 0;
    notas = agregadoNotas._count._all;
    casos = contagemCasos;
    minutas = contagemMinutas;
    acessos = contagemAcessos;
  } catch {
    // Banco indisponível/não configurado: a página avisa em vez de quebrar.
  }

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 px-4 py-6">
      <Link
        href="/"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Voltar para as ferramentas
      </Link>

      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Administração</h1>
        <p className="text-sm text-muted-foreground">
          Resumo da plataforma no período selecionado.
        </p>
      </header>

      <PeriodFilter basePath="/admin" atual={periodo} />

      {usuarios === null ? (
        <Alert>
          <AlertTitle>Banco de dados indisponível</AlertTitle>
          <AlertDescription>
            Confira DATABASE_URL/DIRECT_URL no .env e rode `yarn db:migrate`.
          </AlertDescription>
        </Alert>
      ) : (
        <div className="grid gap-4 sm:grid-cols-3">
          <Card>
            <CardHeader>
              <CardDescription className="flex items-center gap-1.5">
                <Users className="size-4" />
                Usuários cadastrados
              </CardDescription>
              <CardTitle className="text-4xl tabular-nums">
                {usuarios}
              </CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader>
              <CardDescription className="flex items-center gap-1.5">
                <MousePointerClick className="size-4" />
                Acessos aos módulos
              </CardDescription>
              <CardTitle className="text-4xl tabular-nums">{acessos}</CardTitle>
              <CardDescription>
                aberturas de ferramenta (uma por sessão)
              </CardDescription>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader>
              <CardDescription className="flex items-center gap-1.5">
                <AlertTriangle className="size-4" />
                Erros
              </CardDescription>
              <CardTitle className="text-4xl tabular-nums">{erros}</CardTitle>
            </CardHeader>
          </Card>
        </div>
      )}

      {usuarios !== null && (
        <>
          <h2 className="text-sm font-medium text-muted-foreground">
            Produção por módulo no período
          </h2>
          <div className="grid gap-4 sm:grid-cols-3">
            <Card>
              <CardHeader>
                <CardDescription className="flex items-center gap-1.5">
                  <FileCheck2 className="size-4" />
                  Arquivos renomeados
                </CardDescription>
                <CardTitle className="text-4xl tabular-nums">
                  {arquivosRenomeados}
                </CardTitle>
                <CardDescription>Renomeador</CardDescription>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader>
                <CardDescription className="flex items-center gap-1.5">
                  <FileWarning className="size-4" />
                  Exigências classificadas
                </CardDescription>
                <CardTitle className="text-4xl tabular-nums">
                  {exigencias}
                </CardTitle>
                <CardDescription>
                  em {notas} nota(s) devolutiva(s) triada(s)
                </CardDescription>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader>
                <CardDescription className="flex items-center gap-1.5">
                  <Scale className="size-4" />
                  Casos de inventário
                </CardDescription>
                <CardTitle className="text-4xl tabular-nums">{casos}</CardTitle>
                <CardDescription>
                  {minutas} minuta(s)/planilha(s) gerada(s)
                </CardDescription>
              </CardHeader>
            </Card>
          </div>
        </>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        {LISTAGENS.map((l) => (
          <Link key={l.href} href={l.href} className="group">
            <Card className="h-full transition-colors group-hover:border-primary/50 group-hover:bg-accent/30">
              <CardHeader>
                <l.icon className="mb-1 size-6 text-primary" />
                <CardTitle className="text-base">{l.titulo}</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription className="text-sm leading-relaxed">
                  {l.descricao}
                </CardDescription>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </main>
  );
}
