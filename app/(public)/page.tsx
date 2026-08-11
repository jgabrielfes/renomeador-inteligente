import Link from "next/link";
import { ArrowRight, FileScan, FileWarning, Scale } from "lucide-react";

import { UserMenu } from "@/components/user-menu";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const MODULOS = [
  {
    href: "/renomeador",
    icon: FileScan,
    titulo: "Renomeador Inteligente de Documentos",
    descricao:
      "Analisa imagens e PDFs (RG, CNH, certidões, matrículas, contratos…) e sugere nomes de arquivo com base no conteúdo. Otimiza fotos com aspecto de digitalização, separa PDFs com vários documentos e monta o processo em subpastas numeradas.",
  },
  {
    href: "/notas",
    icon: FileWarning,
    titulo: "Resolvedor de Notas Devolutivas (em teste)",
    descricao:
      "Decompõe a nota de exigências do Registro de Imóveis em itens, classifica cada um na via de resolução (juntada, ata retificativa, rerratificação, requerimento…) e prepara a minuta da peça — sempre como rascunho para conferência.",
  },
  {
    href: "/sucessorista",
    icon: Scale,
    titulo: "O Sucessorista (em teste)",
    descricao:
      "Folha de trabalho do inventário: triagem da via (extrajudicial × judicial), cálculo de quinhões com fundamento legal, partilha diferenciada com apuração de torna, levantamento de acervo e pós-escritura. Cálculo de apoio — revisão do advogado responsável é obrigatória.",
  },
] as const;

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-8 px-4 py-6">
      {/* Faixa de sessão no topo; o restante centraliza no espaço que sobra. */}
      <UserMenu />
      <div className="flex flex-1 flex-col justify-center gap-8 pb-16">
      <header className="space-y-2 text-center">
        <h1 className="text-3xl font-semibold tracking-tight">
          Ferramentas
        </h1>
        <p className="text-muted-foreground">
          Escolha o módulo. Tudo roda no seu navegador.
        </p>
      </header>

      <div className="grid gap-6 sm:grid-cols-2">
        {MODULOS.map((m) => (
          <Link key={m.href} href={m.href} className="group">
            <Card className="h-full transition-colors group-hover:border-primary/50 group-hover:bg-accent/30">
              <CardHeader>
                <m.icon className="mb-2 size-8 text-primary" />
                <CardTitle className="flex items-center gap-2 text-lg">
                  {m.titulo}
                  <ArrowRight className="size-4 shrink-0 opacity-0 transition-opacity group-hover:opacity-100" />
                </CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription className="text-sm leading-relaxed">
                  {m.descricao}
                </CardDescription>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
      </div>
    </main>
  );
}
