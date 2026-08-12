// Rota privada: exige login. O gate roda aqui (server) e leva o caminho de
// volta — depois de logar, a pessoa cai direto no resolvedor.

import NotasClient from "./notas-client";
import { AccessTracker } from "@/components/access-tracker";
import { requireSession } from "@/lib/auth";

export default async function NotasPage() {
  await requireSession("/notas");
  return (
    <>
      <AccessTracker modulo="NOTAS" />
      <NotasClient />
    </>
  );
}
