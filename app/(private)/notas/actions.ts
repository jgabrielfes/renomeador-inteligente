"use server";

// Telemetria do Resolvedor de Notas — SEM texto da nota, nomes de pessoa/
// arquivo, prenotação ou serventia. Só as TAGS do vocabulário fechado do
// módulo (via de resolução, alvo, peça, status), contagens e flags.
//
// O evento nasce na TRIAGEM (quando a nota é decomposta em exigências) e cada
// exigência é atualizada depois por índice — mesmo desenho do renomeador:
// server action é endpoint público, então toda atualização valida ownership.
// Nunca quebra a ferramenta: com erro (ou banco fora), falha em silêncio.

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const FONTES = ["docx", "pdf-nativo", "pdf-escaneado", "texto", "imagem", "outro"];
const VIAS = [
  "PROVIDENCIA_EXTERNA",
  "RERRATIFICACAO",
  "REQUERIMENTO",
  "JUNTADA",
  "ATA_RETIFICATIVA",
  "INDEFINIDO",
];
const PECAS = ["ata", "requerimento", "rerratificacao"];
const STATUS = ["pendente", "em_preparo", "aguardando", "resolvido"];

const MAX_ITENS = 60;
const MAX_TAG = 60;

/** Uma exigência da nota, como ela sai do classificador. */
export interface ItemTriado {
  via: string;
  /** Documentos pedidos pela exigência (tags do vocabulário do módulo). */
  alvos: string[];
  /** false = nenhuma regra local casou (o classificador chutou INDEFINIDO). */
  temGatilho: boolean;
  /** Só a CONTAGEM de pessoas citadas — nunca os nomes. */
  pessoas: number;
  /** Documentos da pasta que atendem a exigência (0 = falta pedir). */
  achadosNaPasta?: number;
}

/** Campos que o desfecho de uma exigência pode atualizar. */
export interface PatchItem {
  /** Via escolhida pelo humano (≠ via sugerida = correção do classificador). */
  viaFinal?: string;
  status?: string;
  /** Peça gerada a partir da exigência. */
  peca?: string;
  /** A IA redigiu campos desta peça. */
  comIa?: boolean;
  /** Quantos campos a IA conseguiu preencher. */
  camposIa?: number;
  /** Placeholders que continuaram vazios na minuta gerada. */
  faltando?: number;
  baixouMinuta?: boolean;
  baixouJuntada?: boolean;
}

function tag(valor: unknown, permitidos: string[]): string | undefined {
  return typeof valor === "string" && permitidos.includes(valor) ? valor : undefined;
}

function inteiro(valor: unknown, max = 10_000): number | undefined {
  const n = Math.floor(Number(valor));
  return Number.isFinite(n) && n >= 0 ? Math.min(n, max) : undefined;
}

/** Registra a triagem de uma nota e devolve o id para os desfechos. */
export async function registrarTriagem(dados: {
  fonte: string;
  manual: boolean;
  arquivos: number;
  duracaoMs: number;
  duracaoPasta?: number | null;
  itens: ItemTriado[];
}): Promise<{ id: string } | null> {
  try {
    const session = await auth();
    if (!session?.user?.id) return null;

    const itens = (Array.isArray(dados.itens) ? dados.itens : [])
      .slice(0, MAX_ITENS)
      .map((item) => ({
        via: tag(item?.via, VIAS) ?? "INDEFINIDO",
        alvos: (Array.isArray(item?.alvos) ? item.alvos : [])
          .filter((a): a is string => typeof a === "string")
          .slice(0, 8)
          .map((a) => a.slice(0, MAX_TAG)),
        temGatilho: item?.temGatilho === true,
        pessoas: inteiro(item?.pessoas, 50) ?? 0,
        ...(item?.achadosNaPasta !== undefined
          ? { achadosNaPasta: inteiro(item.achadosNaPasta, 100) ?? 0 }
          : {}),
      }));

    const evento = await prisma.notaEvent.create({
      data: {
        quantidade: itens.length,
        fonte: tag(dados.fonte, FONTES) ?? "outro",
        manual: dados.manual === true,
        arquivos: inteiro(dados.arquivos, 5_000) ?? 0,
        duracaoMs: inteiro(dados.duracaoMs, 86_400_000) ?? 0,
        duracaoPasta:
          dados.duracaoPasta == null ? null : (inteiro(dados.duracaoPasta, 86_400_000) ?? null),
        itens: itens as object[],
        userId: session.user.id,
      },
      select: { id: true },
    });
    return evento;
  } catch {
    return null; // telemetria é melhor-esforço
  }
}

/** Atualiza o desfecho de UMA exigência. Só o dono do evento pode. */
export async function atualizarItemDaNota(
  eventId: string,
  indice: number,
  patch: PatchItem
): Promise<void> {
  try {
    const session = await auth();
    if (!session?.user?.id || typeof eventId !== "string") return;

    const evento = await prisma.notaEvent.findUnique({
      where: { id: eventId },
      select: { id: true, itens: true, desfecho: true, userId: true },
    });
    if (!evento || evento.userId !== session.user.id) return;
    if (!Array.isArray(evento.itens)) return;

    const i = Math.floor(indice);
    if (i < 0 || i >= evento.itens.length) return;

    const itens = evento.itens as unknown as Array<Record<string, unknown>>;
    const limpo: Record<string, unknown> = {};
    const viaFinal = tag(patch?.viaFinal, VIAS);
    if (viaFinal) limpo.viaFinal = viaFinal;
    const status = tag(patch?.status, STATUS);
    if (status) limpo.status = status;
    const peca = tag(patch?.peca, PECAS);
    if (peca) limpo.peca = peca;
    if (patch?.comIa === true) limpo.comIa = true;
    if (patch?.camposIa !== undefined) limpo.camposIa = inteiro(patch.camposIa, 50);
    if (patch?.faltando !== undefined) limpo.faltando = inteiro(patch.faltando, 100);
    if (patch?.baixouMinuta === true) limpo.baixouMinuta = true;
    if (patch?.baixouJuntada === true) limpo.baixouJuntada = true;
    if (Object.keys(limpo).length === 0) return;

    itens[i] = { ...itens[i], ...limpo };

    // Desfecho do evento: houve entrega (download) em alguma exigência?
    const baixou =
      patch?.baixouMinuta === true ||
      patch?.baixouJuntada === true ||
      (evento.desfecho as { baixou?: unknown } | null)?.baixou === true;

    await prisma.notaEvent.update({
      where: { id: evento.id },
      data: {
        itens: itens as object[],
        desfecho: { baixou },
      },
    });
  } catch {
    // melhor-esforço
  }
}
