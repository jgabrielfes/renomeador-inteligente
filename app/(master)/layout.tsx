// Grupo (master): só usuários MASTER. O gate roda aqui para TODO o grupo
// (quem não é master recebe 404); páginas e server actions repetem
// requireMaster() por defesa em profundidade — actions são endpoints públicos.

import { EH_HUB } from "@/lib/app";
import { requireMaster } from "@/lib/auth";

export default async function MasterLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // O HUB é vitrine pública: não tem conta, logo não tem administração.
  // (Sem isso o gate ainda barraria por falta de sessão, mas o 404 explícito
  // é a regra da casa para rota que "não existe" naquela plataforma.)
  if (EH_HUB) {
    const { notFound } = await import("next/navigation");
    notFound();
  }
  await requireMaster();
  return children;
}
