"use server";

// Telemetria do renomeador — SEM nomes de arquivo/pessoa, por decisão de
// privacidade: cada item guarda só a TAG de tipo ("RG", "Boleto Bancário"…)
// e flags de download; o evento guarda o desfecho do lote (zip, opções de
// montagem). Registrada no momento da ANÁLISE e atualizada nos desfechos.
// Nunca quebra a ferramenta: com erro (ou banco fora), falha em silêncio.

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { MetodoAnalise } from "@/lib/generated/prisma/enums";

const METODOS: MetodoAnalise[] = ["IA_ARQUIVO", "IA_TEXTO", "LOCAL"];
const MAX_ITENS = 1000;
const MAX_TIPO = 60;

export interface ItemAnalise {
  tipo: string;
  baixado?: boolean;
  otimizado?: boolean;
}

export interface MontagemDoProcesso {
  subpastas: boolean;
  converterPdf: boolean;
  numerar: boolean;
}

export async function registrarAnalise(
  metodo: MetodoAnalise,
  quantidade: number,
  duracaoMs: number,
  itens: Array<{ tipo: string }>
): Promise<{ id: string } | null> {
  const n = Math.floor(quantidade);
  if (!METODOS.includes(metodo)) return null;
  if (!Number.isFinite(n) || n < 1 || n > 10_000) return null;

  const duracao = Math.max(0, Math.min(Math.floor(duracaoMs) || 0, 86_400_000));
  const itensLimpos: ItemAnalise[] = (Array.isArray(itens) ? itens : [])
    .filter((item) => typeof item?.tipo === "string")
    .slice(0, MAX_ITENS)
    .map((item) => ({ tipo: item.tipo.slice(0, MAX_TIPO) }));

  try {
    const session = await auth();
    const evento = await prisma.renameEvent.create({
      data: {
        quantidade: n,
        metodo,
        duracaoMs: duracao,
        itens: itensLimpos as object[],
        userId: session?.user?.id ?? null,
      },
      select: { id: true },
    });
    return evento;
  } catch {
    return null; // telemetria é melhor-esforço
  }
}

// Só o dono do evento pode atualizá-lo — server action é endpoint público.
async function eventoDoUsuario(eventId: string) {
  const session = await auth();
  if (!session?.user?.id || typeof eventId !== "string") return null;
  const evento = await prisma.renameEvent.findUnique({
    where: { id: eventId },
    select: { id: true, itens: true, desfecho: true, userId: true },
  });
  if (!evento || evento.userId !== session.user.id) return null;
  return evento;
}

/** Marca um arquivo do evento como baixado (otimizado = via melhoria de imagem). */
export async function registrarDownloadDeItem(
  eventId: string,
  indice: number,
  otimizado: boolean
): Promise<void> {
  try {
    const evento = await eventoDoUsuario(eventId);
    if (!evento || !Array.isArray(evento.itens)) return;
    const i = Math.floor(indice);
    if (i < 0 || i >= evento.itens.length) return;

    const itens = evento.itens as unknown as ItemAnalise[];
    itens[i] = {
      ...itens[i],
      baixado: true,
      otimizado: Boolean(itens[i]?.otimizado) || otimizado === true,
    };
    await prisma.renameEvent.update({
      where: { id: evento.id },
      data: { itens: itens as object[] },
    });
  } catch {
    // melhor-esforço
  }
}

/** Registra o desfecho do lote: zip baixado e/ou opções de montagem usadas. */
export async function registrarDesfecho(
  eventIds: string[],
  dados: { zip?: boolean; montagem?: MontagemDoProcesso }
): Promise<void> {
  if (!Array.isArray(eventIds)) return;
  const montagem = dados?.montagem
    ? {
        subpastas: dados.montagem.subpastas === true,
        converterPdf: dados.montagem.converterPdf === true,
        numerar: dados.montagem.numerar === true,
      }
    : undefined;

  for (const eventId of eventIds.slice(0, 20)) {
    try {
      const evento = await eventoDoUsuario(eventId);
      if (!evento) continue;
      const atual = (evento.desfecho ?? {}) as Record<string, unknown>;
      await prisma.renameEvent.update({
        where: { id: evento.id },
        data: {
          desfecho: {
            ...atual,
            ...(dados?.zip === true ? { zip: true } : {}),
            ...(montagem ? { montagem } : {}),
          },
        },
      });
    } catch {
      // melhor-esforço
    }
  }
}
