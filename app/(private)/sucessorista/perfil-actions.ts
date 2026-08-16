"use server";

// Perfil de uso do Sucessorista VINCULADO À CONTA (users.perfilSucessorista):
// a conta comum escolhe UMA vez (primeiro acesso) e fica travada; MASTER
// circula pelos dois perfis sem gravar nada (o alternador é só da sessão).
//
// Server action é endpoint público — toda regra é validada AQUI, nunca só na
// UI. Falha de banco degrada com aviso (a escolha vale na sessão) — inclusive
// enquanto a migração `perfil_sucessorista_por_conta` não rodou no ambiente.

import { auth, isMaster } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { EH_SUCESSORISTA } from "@/lib/app";

const PERFIS = ["ADVOGADO", "ESCREVENTE"] as const;
type PerfilConta = (typeof PERFIS)[number];

export async function salvarPerfilConta(
  perfil: string,
): Promise<{ ok: boolean; motivo?: string }> {
  if (!EH_SUCESSORISTA) return { ok: false, motivo: "plataforma" };
  const escolhido = PERFIS.find((p) => p === perfil);
  if (!escolhido) return { ok: false, motivo: "perfil-invalido" };

  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, motivo: "sem-sessao" };

  try {
    const usuario = await prisma.user.findUnique({
      where: { id: userId },
      select: { perfilSucessorista: true },
    });
    if (!usuario) return { ok: false, motivo: "sem-conta" };

    // Conta comum: a escolha é ÚNICA — só grava quando ainda não há perfil.
    // (Trocar depois é ato de administração; MASTER nem precisa gravar.)
    if (usuario.perfilSucessorista !== null && !isMaster(session)) {
      return usuario.perfilSucessorista === escolhido
        ? { ok: true }
        : { ok: false, motivo: "ja-escolhido" };
    }

    await prisma.user.update({
      where: { id: userId },
      data: { perfilSucessorista: escolhido as PerfilConta },
    });
    return { ok: true };
  } catch {
    // Banco fora (ou migração ainda não aplicada): degrada sem quebrar.
    return { ok: false, motivo: "banco" };
  }
}
