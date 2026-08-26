"use server";

// Ações de administração de usuários. Gate revalidado AQUI (server action é
// endpoint público — o botão escondido não protege nada).

import { revalidatePath } from "next/cache";

import { APP, EH_SUCESSORISTA } from "@/lib/app";
import { requireMaster } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export type AcaoResult = { ok: true } | { ok: false; error: string };

/**
 * Trocar o PERFIL de uso do Sucessorista de uma conta (Advogado × Não Advogado).
 *
 * A conta escolhe UMA vez, no primeiro acesso, e trava. Antes o MASTER
 * contornava isso alternando na lombada da folha — o que mudava a sessão, não
 * a conta, e fazia a mesma conta trabalhar ora num balcão ora no outro. Esse
 * alternador saiu; a troca é ATO DE ADMINISTRAÇÃO e acontece aqui, gravada de
 * verdade na conta.
 *
 * `perfil` vazio LIMPA a escolha: a pessoa reescolhe no próximo acesso — é o
 * caminho para quem se cadastrou no papel errado e quer decidir de novo.
 */
export async function definirPerfilSucessorista(
  userId: string,
  perfil: string
): Promise<AcaoResult> {
  await requireMaster();
  // Perfil de uso só existe no site do Sucessorista — nos outros a coluna
  // está lá (o banco é um só), mas mexer nela daqui não faria sentido.
  if (!EH_SUCESSORISTA) {
    return { ok: false, error: "Perfil de uso não existe nesta plataforma." };
  }

  const escolhido =
    perfil === "ADVOGADO" || perfil === "NAO_ADVOGADO" ? perfil : perfil === "" ? null : undefined;
  if (escolhido === undefined) {
    return { ok: false, error: "Perfil inválido." };
  }

  try {
    const alvo = await prisma.user.findUnique({ where: { id: userId } });
    // Mesma disciplina do alternarMaster: conta de outra plataforma responde
    // como inexistente (o id vem do cliente).
    if (!alvo || alvo.app !== APP) {
      return { ok: false, error: "Usuário não encontrado." };
    }

    await prisma.user.update({
      where: { id: userId },
      data: { perfilSucessorista: escolhido },
    });
    revalidatePath("/admin/usuarios");
    return { ok: true };
  } catch {
    return { ok: false, error: "Falha ao atualizar — tente novamente." };
  }
}

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
