"use server";

// Telemetria do renomeador: registra cada rodada de ANÁLISE (momento em que
// os arquivos selecionados são enviados para a IA ou para o OCR local), com a
// quantidade e o método usado. Nunca registra nomes nem conteúdo. E nunca
// quebra a ferramenta: com erro (ou banco fora), falha em silêncio.

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { MetodoAnalise } from "@/lib/generated/prisma/enums";

const METODOS: MetodoAnalise[] = ["IA_ARQUIVO", "IA_TEXTO", "LOCAL"];

export async function registrarAnalise(
  metodo: MetodoAnalise,
  quantidade: number
): Promise<void> {
  const n = Math.floor(quantidade);
  if (!METODOS.includes(metodo)) return;
  if (!Number.isFinite(n) || n < 1 || n > 10_000) return;
  try {
    const session = await auth();
    await prisma.renameEvent.create({
      data: { quantidade: n, metodo, userId: session?.user?.id ?? null },
    });
  } catch {
    // Telemetria é melhor-esforço.
  }
}
