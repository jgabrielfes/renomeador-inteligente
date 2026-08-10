"use server";

// Telemetria do renomeador: registra QUANTOS arquivos foram renomeados (lote
// aplicado na pasta ou zip baixado) para o resumo de /admin. Nunca registra
// nomes nem conteúdo. E nunca quebra a ferramenta: sem banco configurado (ou
// com erro), falha em silêncio.

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function registrarArquivosRenomeados(
  quantidade: number
): Promise<void> {
  const n = Math.floor(quantidade);
  if (!Number.isFinite(n) || n < 1 || n > 10_000) return;
  try {
    const session = await auth();
    await prisma.renameEvent.create({
      data: { quantidade: n, userId: session?.user?.id ?? null },
    });
  } catch {
    // Telemetria é melhor-esforço.
  }
}
