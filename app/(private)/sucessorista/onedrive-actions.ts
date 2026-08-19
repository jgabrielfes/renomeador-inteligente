"use server";

// ONEDRIVE conectado — server actions (Sucessorista).
//
// Espelho de drive-actions.ts sobre a Microsoft: o refresh token vive SÓ no
// servidor (users.oneDriveRefreshToken); o navegador recebe ACCESS tokens de
// vida curta para falar com a Graph API DIRETO (documentos trafegam
// navegador ↔ Microsoft, nunca pelo nosso servidor). O refresh token da
// Microsoft ROTACIONA: cada renovação regrava a coluna com o token novo.
// Toda action valida a sessão — server action é endpoint público.

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { EH_SUCESSORISTA } from "@/lib/app";
import { novoAccessTokenOneDrive, oneDriveDisponivel } from "@/lib/onedrive";

export interface EstadoOneDrive {
  /** Envs da Microsoft presentes neste deploy (sem elas o recurso nem aparece). */
  disponivel: boolean;
  conectado: boolean;
  email: string | null;
}

export async function estadoOneDrive(): Promise<EstadoOneDrive> {
  const indisponivel: EstadoOneDrive = { disponivel: false, conectado: false, email: null };
  if (!EH_SUCESSORISTA || !oneDriveDisponivel()) return indisponivel;
  try {
    const session = await auth();
    const id = session?.user?.id;
    if (!id) return indisponivel;
    const eu = await prisma.user.findUnique({
      where: { id },
      select: { oneDriveRefreshToken: true, oneDriveEmail: true },
    });
    return {
      disponivel: true,
      conectado: Boolean(eu?.oneDriveRefreshToken),
      email: eu?.oneDriveEmail ?? null,
    };
  } catch {
    return indisponivel;
  }
}

export interface TokenOneDrive {
  accessToken?: string;
  /** Validade em segundos (o cliente renova com folga). */
  expiresIn?: number;
  /** true = o usuário revogou a autorização na Microsoft — reconectar. */
  desconectado?: boolean;
  erro?: string;
}

export async function tokenOneDrive(): Promise<TokenOneDrive> {
  if (!EH_SUCESSORISTA || !oneDriveDisponivel()) return { erro: "Indisponível." };
  try {
    const session = await auth();
    const id = session?.user?.id;
    if (!id) return { erro: "Não autenticado." };
    const eu = await prisma.user.findUnique({
      where: { id },
      select: { oneDriveRefreshToken: true },
    });
    if (!eu?.oneDriveRefreshToken) return { desconectado: true };
    const r = await novoAccessTokenOneDrive(eu.oneDriveRefreshToken);
    if (r === "revogado") {
      // Autorização desfeita na Microsoft: limpa a conexão para a UI
      // oferecer reconectar em vez de falhar para sempre.
      await prisma.user.update({
        where: { id },
        data: { oneDriveRefreshToken: null, oneDriveEmail: null, oneDriveConectadoEm: null },
      });
      return { desconectado: true };
    }
    if (!r) return { erro: "Microsoft indisponível — tente de novo." };
    // ROTAÇÃO: o refresh token novo substitui o usado — sem regravar, a
    // conexão morreria quando a Microsoft aposentasse o antigo.
    if (r.refreshToken && r.refreshToken !== eu.oneDriveRefreshToken) {
      await prisma.user.update({
        where: { id },
        data: { oneDriveRefreshToken: r.refreshToken },
      });
    }
    return { accessToken: r.accessToken, expiresIn: r.expiresIn };
  } catch {
    return { erro: "Falha ao renovar o acesso ao OneDrive." };
  }
}

/**
 * Desconecta: limpa a conta (a Microsoft não tem endpoint público de
 * revogação — o usuário pode também remover o app do consentimento em
 * account.live.com/consent/Manage).
 */
export async function desconectarOneDrive(): Promise<boolean> {
  if (!EH_SUCESSORISTA) return false;
  try {
    const session = await auth();
    const id = session?.user?.id;
    if (!id) return false;
    await prisma.user.update({
      where: { id },
      data: { oneDriveRefreshToken: null, oneDriveEmail: null, oneDriveConectadoEm: null },
    });
    return true;
  } catch {
    return false;
  }
}
