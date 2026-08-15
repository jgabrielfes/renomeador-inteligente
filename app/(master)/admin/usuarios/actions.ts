"use server";

// Ações de administração de usuários. Gate revalidado AQUI (server action é
// endpoint público — o botão escondido não protege nada).

import { revalidatePath } from "next/cache";

import { APP } from "@/lib/app";
import { requireMaster } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export type AcaoResult = { ok: true } | { ok: false; error: string };

export async function alternarMaster(userId: string): Promise<AcaoResult> {
  const session = await requireMaster();

  if (userId === session.user.id) {
    return {
      ok: false,
      error: "Você não pode alterar o próprio papel — peça a outro master.",
    };
  }

  try {
    const alvo = await prisma.user.findUnique({ where: { id: userId } });
    // Conta de OUTRA plataforma responde igual a inexistente: um master do
    // Renomeador não promove ninguém no Sucessorista (e vice-versa). A action
    // é endpoint público — o id vem do cliente, então a checagem é aqui.
    if (!alvo || alvo.app !== APP) {
      return { ok: false, error: "Usuário não encontrado." };
    }

    await prisma.user.update({
      where: { id: userId },
      data: { role: alvo.role === "MASTER" ? "USER" : "MASTER" },
    });
    revalidatePath("/admin/usuarios");
    return { ok: true };
  } catch {
    return { ok: false, error: "Falha ao atualizar — tente novamente." };
  }
}
