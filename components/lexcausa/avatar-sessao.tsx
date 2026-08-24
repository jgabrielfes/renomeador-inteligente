// Wrapper SERVER do avatar da barra: lê a sessão e a foto do perfil no banco
// e entrega ao client (o AvatarMenu não pode chamar auth()). Falha de banco
// degrada para as iniciais — a barra nunca quebra.

import { AvatarMenu } from '@/components/lexcausa/avatar-menu';
import { auth, isMaster } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function AvatarSessao() {
  const session = await auth();
  if (!session?.user) return null;
  let foto: string | null = null;
  try {
    const u = await prisma.user.findUnique({
      where: { id: session.user.id ?? '' },
      select: { fotoPerfil: true },
    });
    foto = u?.fotoPerfil ?? null;
  } catch {
    foto = null;
  }
  return (
    <AvatarMenu
      nome={session.user.name ?? null}
      email={session.user.email ?? null}
      foto={foto}
      ehMaster={isMaster(session)}
    />
  );
}
