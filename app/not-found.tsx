// 404 da plataforma inteira: URLs inexistentes e chamadas a notFound()
// (inclusive o gate de /admin — para quem não é master, a rota "não existe").

import Link from "next/link";
import { ArrowLeft, FileQuestion } from "lucide-react";

import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-6 px-4 py-10 text-center">
      <div className="flex size-16 items-center justify-center rounded-2xl bg-muted">
        <FileQuestion className="size-8 text-muted-foreground" />
      </div>
      <div className="space-y-2">
        <p className="text-sm font-medium text-muted-foreground">Erro 404</p>
        <h1 className="text-2xl font-semibold tracking-tight">
          Página não encontrada
        </h1>
        <p className="text-muted-foreground">
          O endereço que você acessou não existe ou foi movido. Sem problema —
          a ferramenta continua no lugar de sempre.
        </p>
      </div>
      <Button nativeButton={false} render={<Link href="/" />}>
        <ArrowLeft className="size-4" />
        Voltar para o início
      </Button>
    </main>
  );
}
