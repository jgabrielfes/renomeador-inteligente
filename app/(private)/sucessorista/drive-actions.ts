"use server";

// GOOGLE DRIVE conectado — server actions (Sucessorista).
//
// O refresh token vive SÓ no servidor (coluna users.driveRefreshToken); o
// navegador recebe ACCESS tokens de vida curta para falar com a API do
// Drive DIRETO (os documentos trafegam navegador ↔ Google, nunca pelo nosso
// servidor — a fronteira de dados fica mais forte, não mais fraca). Toda
// action valida a sessão — server action é endpoint público.

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { EH_SUCESSORISTA } from "@/lib/app";
import { driveDisponivel, novoAccessTokenDrive, revogarDrive } from "@/lib/drive";

export interface EstadoDrive {
  /** Envs do Google presentes neste deploy (sem elas o recurso nem aparece). */
  disponivel: boolean;
  conectado: boolean;
  email: string | null;
}

export async function estadoDrive(): Promise<EstadoDrive> {
  const indisponivel: EstadoDrive = { disponivel: false, conectado: false, email: null };
  if (!EH_SUCESSORISTA || !driveDisponivel()) return indisponivel;
  try {
    const session = await auth();
    const id = session?.user?.id;
    if (!id) return indisponivel;
    const eu = await prisma.user.findUnique({
      where: { id },
      select: { driveRefreshToken: true, driveEmail: true },
    });
    return {
      disponivel: true,
      conectado: Boolean(eu?.driveRefreshToken),
      email: eu?.driveEmail ?? null,
    };
  } catch {
    return indisponivel;
  }
}

export interface TokenDrive {
  accessToken?: string;
  /** Validade em segundos (o cliente renova com folga). */
  expiresIn?: number;
  /** true = o usuário revogou a autorização no Google — reconectar. */
  desconectado?: boolean;
  erro?: string;
}

export async function tokenDrive(): Promise<TokenDrive> {
  if (!EH_SUCESSORISTA || !driveDisponivel()) return { erro: "Indisponível." };
  try {
    const session = await auth();
    const id = session?.user?.id;
    if (!id) return { erro: "Não autenticado." };
    const eu = await prisma.user.findUnique({
      where: { id },
      select: { driveRefreshToken: true },
    });
    if (!eu?.driveRefreshToken) return { desconectado: true };
    const r = await novoAccessTokenDrive(eu.driveRefreshToken);
    if (r === 'revogado') {
      // Autorização desfeita no Google: limpa a conexão para a UI oferecer
      // reconectar em vez de falhar para sempre.
      await prisma.user.update({
        where: { id },
        data: { driveRefreshToken: null, driveEmail: null, driveConectadoEm: null },
      });
      return { desconectado: true };
    }
    if (!r) return { erro: "Google indisponível — tente de novo." };
    return { accessToken: r.accessToken, expiresIn: r.expiresIn };
  } catch {
    return { erro: "Falha ao renovar o acesso ao Drive." };
  }
}

/** Desconecta: revoga no Google (melhor-esforço) e limpa a conta. */
export async function desconectarDrive(): Promise<boolean> {
  if (!EH_SUCESSORISTA) return false;
  try {
    const session = await auth();
    const id = session?.user?.id;
    if (!id) return false;
    const eu = await prisma.user.findUnique({
      where: { id },
      select: { driveRefreshToken: true },
    });
    if (eu?.driveRefreshToken) await revogarDrive(eu.driveRefreshToken);
    await prisma.user.update({
      where: { id },
      data: { driveRefreshToken: null, driveEmail: null, driveConectadoEm: null },
    });
    return true;
  } catch {
    return false;
  }
}
