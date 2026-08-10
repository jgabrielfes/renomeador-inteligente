"use server";

// Telemetria do renomeador: registra cada rodada de ANÁLISE (momento em que
// os arquivos selecionados são enviados para a IA ou para o OCR local), com
// quantidade, método, duração e os nomes de → para (nunca o conteúdo dos
// documentos). Nunca quebra a ferramenta: com erro (ou banco fora), falha em
// silêncio.

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { MetodoAnalise } from "@/lib/generated/prisma/enums";

const METODOS: MetodoAnalise[] = ["IA_ARQUIVO", "IA_TEXTO", "LOCAL"];
const MAX_ITENS = 1000;
const MAX_NOME = 180;

export interface ItemRenomeacao {
  de: string;
  para: string;
}

export async function registrarAnalise(
  metodo: MetodoAnalise,
  quantidade: number,
  duracaoMs: number,
  itens: ItemRenomeacao[]
): Promise<void> {
  const n = Math.floor(quantidade);
  if (!METODOS.includes(metodo)) return;
  if (!Number.isFinite(n) || n < 1 || n > 10_000) return;

  const duracao = Math.max(0, Math.min(Math.floor(duracaoMs) || 0, 86_400_000));
  const itensLimpos = (Array.isArray(itens) ? itens : [])
    .filter(
      (item) => typeof item?.de === "string" && typeof item?.para === "string"
    )
    .slice(0, MAX_ITENS)
    .map((item) => ({
      de: item.de.slice(0, MAX_NOME),
      para: item.para.slice(0, MAX_NOME),
    }));

  try {
    const session = await auth();
    await prisma.renameEvent.create({
      data: {
        quantidade: n,
        metodo,
        duracaoMs: duracao,
        itens: itensLimpos,
        userId: session?.user?.id ?? null,
      },
    });
  } catch {
    // Telemetria é melhor-esforço.
  }
}
