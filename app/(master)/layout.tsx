// Grupo (master): só usuários MASTER. O gate roda aqui para TODO o grupo
// (quem não é master recebe 404); páginas e server actions repetem
// requireMaster() por defesa em profundidade — actions são endpoints públicos.

import { requireMaster } from "@/lib/auth";

export default async function MasterLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireMaster();
  return children;
}
