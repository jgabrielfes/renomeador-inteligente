// O SUCESSORISTA mora em /s (remodelagem LexCausa): o painel Meus casos e a
// folha do inventário. A montagem server é a MESMA da rota do caso
// (sucessorista/pagina.tsx); o gate fica aqui porque o callbackUrl do login
// precisa do caminho real. A rota /caso/<id>/<etapa> segue valendo — links
// salvos e favoritos não quebram.

import { APP } from "@/lib/app";
import { auth, requireSession } from "@/lib/auth";
import { PaginaSucessorista } from "../sucessorista/pagina";

export const dynamic = "force-dynamic";

export default async function SucessoristaHome() {
  if (APP !== "SUCESSORISTA") {
    const { notFound } = await import("next/navigation");
    notFound();
  }
  await requireSession("/s");
  const session = await auth();
  return <PaginaSucessorista session={session} />;
}
