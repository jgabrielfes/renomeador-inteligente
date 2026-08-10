"use server";

// Persistência do aprendizado do escritório (regras + correções) POR CONTA.
// Server action é endpoint público: toda função valida a sessão e grava só na
// linha do próprio usuário. As gravações são parciais de propósito — salvar as
// regras não toca nas correções (e vice-versa), então um carregamento inicial
// que falhou não faz uma edição de regras apagar as correções já salvas.
// Isto é dado do PRÓPRIO usuário, não telemetria: nunca expor em /admin.

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const MAX_REGRAS = 10_000;
const MAX_CORRECOES = 20;
const MAX_CAMPO = 300;

export interface CorrecaoSalva {
  tipo: string;
  sugerido: string;
  corrigido: string;
}

export interface LicoesSalvas {
  rules: string;
  corrections: CorrecaoSalva[];
}

function sanearRegras(regras: unknown): string {
  return typeof regras === "string" ? regras.slice(0, MAX_REGRAS) : "";
}

function sanearCorrecoes(correcoes: unknown): CorrecaoSalva[] {
  if (!Array.isArray(correcoes)) return [];
  return correcoes
    .filter(
      (c): c is CorrecaoSalva =>
        typeof c?.sugerido === "string" && typeof c?.corrigido === "string"
    )
    .slice(0, MAX_CORRECOES)
    .map((c) => ({
      tipo: typeof c.tipo === "string" ? c.tipo.slice(0, MAX_CAMPO) : "",
      sugerido: c.sugerido.slice(0, MAX_CAMPO),
      corrigido: c.corrigido.slice(0, MAX_CAMPO),
    }));
}

/** Lições da conta logada; null = falha ao carregar (≠ de "ainda vazio"). */
export async function carregarLicoes(): Promise<LicoesSalvas | null> {
  try {
    const session = await auth();
    if (!session?.user?.id) return null;
    const row = await prisma.renamerLessons.findUnique({
      where: { userId: session.user.id },
    });
    if (!row) return { rules: "", corrections: [] };
    return {
      rules: sanearRegras(row.regras),
      corrections: sanearCorrecoes(row.correcoes),
    };
  } catch {
    return null;
  }
}

export async function salvarRegras(regras: string): Promise<boolean> {
  try {
    const session = await auth();
    if (!session?.user?.id) return false;
    const limpas = sanearRegras(regras);
    await prisma.renamerLessons.upsert({
      where: { userId: session.user.id },
      update: { regras: limpas },
      create: { userId: session.user.id, regras: limpas },
    });
    return true;
  } catch {
    return false;
  }
}

export async function salvarCorrecoes(
  correcoes: CorrecaoSalva[]
): Promise<boolean> {
  try {
    const session = await auth();
    if (!session?.user?.id) return false;
    const limpas = sanearCorrecoes(correcoes) as object[];
    await prisma.renamerLessons.upsert({
      where: { userId: session.user.id },
      update: { correcoes: limpas },
      create: { userId: session.user.id, correcoes: limpas },
    });
    return true;
  } catch {
    return false;
  }
}

/** Grava regras E correções de uma vez (importação e migração do localStorage). */
export async function salvarLicoes(licoes: LicoesSalvas): Promise<boolean> {
  try {
    const session = await auth();
    if (!session?.user?.id) return false;
    const dados = {
      regras: sanearRegras(licoes?.rules),
      correcoes: sanearCorrecoes(licoes?.corrections) as object[],
    };
    await prisma.renamerLessons.upsert({
      where: { userId: session.user.id },
      update: dados,
      create: { userId: session.user.id, ...dados },
    });
    return true;
  } catch {
    return false;
  }
}
