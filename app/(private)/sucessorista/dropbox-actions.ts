"use server";

// DROPBOX conectado — server actions (Sucessorista).
//
// Espelho de drive-actions.ts: o refresh token vive SÓ no servidor
// (users.dropboxRefreshToken); o navegador recebe ACCESS tokens de vida
// curta para falar com a API do Dropbox DIRETO (documentos trafegam
// navegador ↔ Dropbox, nunca pelo nosso servidor). O refresh token do
// Dropbox NÃO rotaciona. Toda action valida a sessão — server action é
// endpoint público.

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { EH_SUCESSORISTA } from "@/lib/app";
import { dropboxDisponivel, novoAccessTokenDropbox, revogarDropbox } from "@/lib/dropbox";

export interface EstadoDropbox {
  /** Envs do Dropbox presentes neste deploy (sem elas o recurso nem aparece). */
  disponivel: boolean;
  conectado: boolean;
  email: string | null;
}

export async function estadoDropbox(): Promise<EstadoDropbox> {
  const indisponivel: EstadoDropbox = { disponivel: false, conectado: false, email: null };
  if (!EH_SUCESSORISTA || !dropboxDisponivel()) return indisponivel;
  try {
    const session = await auth();
    const id = session?.user?.id;
    if (!id) return indisponivel;
    const eu = await prisma.user.findUnique({
      where: { id },
      select: { dropboxRefreshToken: true, dropboxEmail: true },
    });
    return {
      disponivel: true,
      conectado: Boolean(eu?.dropboxRefreshToken),
      email: eu?.dropboxEmail ?? null,
    };
  } catch {
    return indisponivel;
  }
}

export interface TokenDropbox {
  accessToken?: string;
  /** Validade em segundos (o cliente renova com folga). */
  expiresIn?: number;
  /** true = o usuário revogou a autorização no Dropbox — reconectar. */
  desconectado?: boolean;
  erro?: string;
}

export async function tokenDropbox(): Promise<TokenDropbox> {
  if (!EH_SUCESSORISTA || !dropboxDisponivel()) return { erro: "Indisponível." };
  try {
    const session = await auth();
    const id = session?.user?.id;
    if (!id) return { erro: "Não autenticado." };
    const eu = await prisma.user.findUnique({
      where: { id },
      select: { dropboxRefreshToken: true },
    });
    if (!eu?.dropboxRefreshToken) return { desconectado: true };
    const r = await novoAccessTokenDropbox(eu.dropboxRefreshToken);
    if (r === "revogado") {
      // Autorização desfeita no Dropbox: limpa a conexão para a UI oferecer
      // reconectar em vez de falhar para sempre.
      await prisma.user.update({
        where: { id },
        data: { dropboxRefreshToken: null, dropboxEmail: null, dropboxConectadoEm: null },
      });
      return { desconectado: true };
    }
    if (!r) return { erro: "Dropbox indisponível — tente de novo." };
    return { accessToken: r.accessToken, expiresIn: r.expiresIn };
  } catch {
    return { erro: "Falha ao renovar o acesso ao Dropbox." };
  }
}

/** Desconecta: revoga no Dropbox (melhor-esforço) e limpa a conta. */
export async function desconectarDropbox(): Promise<boolean> {
  if (!EH_SUCESSORISTA) return false;
  try {
    const session = await auth();
    const id = session?.user?.id;
    if (!id) return false;
    const eu = await prisma.user.findUnique({
      where: { id },
      select: { dropboxRefreshToken: true },
    });
    if (eu?.dropboxRefreshToken) await revogarDropbox(eu.dropboxRefreshToken);
    await prisma.user.update({
      where: { id },
      data: { dropboxRefreshToken: null, dropboxEmail: null, dropboxConectadoEm: null },
    });
    return true;
  } catch {
    return false;
  }
}
