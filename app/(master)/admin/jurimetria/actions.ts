'use server';

// Server actions do /admin/jurimetria — TODAS começam com requireMaster()
// (server action é endpoint público; defesa em profundidade da casa).

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { requireMaster } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

/** Enfileira a coleta de UMA fonte — o worker da Action drena a fila. */
export async function coletarAgora(fonteId: string) {
  await requireMaster();
  const fonte = await prisma.fonteJurimetria.findUnique({ where: { id: fonteId } });
  if (!fonte) return { ok: false as const, erro: 'Fonte não encontrada.' };
  const pendente = await prisma.jobJurimetria.findFirst({
    where: { tipo: 'coletar_fonte', status: { in: ['pendente', 'rodando'] }, payload: { equals: { fonteId } } },
  });
  if (!pendente)
    await prisma.jobJurimetria.create({ data: { tipo: 'coletar_fonte', payload: { fonteId } } });
  revalidatePath('/admin/jurimetria');
  return { ok: true as const };
}

/** Desbloqueia uma fonte após a validação humana (ex.: 429 transitório). */
export async function desbloquearFonte(fonteId: string) {
  await requireMaster();
  await prisma.fonteJurimetria.update({
    where: { id: fonteId },
    data: { bloqueadaEm: null, motivoBloqueio: null },
  });
  revalidatePath('/admin/jurimetria');
  return { ok: true as const };
}

const esquemaUrlFonte = z.object({
  fonteId: z.string().min(1),
  url: z.string().trim().url('Informe uma URL válida (https://…).'),
});

/** Cadastra a página de coleta de uma fonte de SITE DE CARTÓRIO e a ativa. */
export async function salvarPaginaFonte(fonteId: string, url: string) {
  await requireMaster();
  const v = esquemaUrlFonte.safeParse({ fonteId, url });
  if (!v.success) return { ok: false as const, erro: v.error.issues[0]?.message ?? 'URL inválida.' };
  const fonte = await prisma.fonteJurimetria.findUnique({ where: { id: v.data.fonteId } });
  if (!fonte) return { ok: false as const, erro: 'Fonte não encontrada.' };
  const config = { ...((fonte.config ?? {}) as Record<string, unknown>), paginaOrientacoes: v.data.url };
  await prisma.fonteJurimetria.update({
    where: { id: fonte.id },
    data: { config, ativa: true, urlBase: new URL(v.data.url).origin },
  });
  revalidatePath('/admin/jurimetria');
  return { ok: true as const };
}

const esquemaCorrecao = z.object({
  textoNormalizado: z.string().trim().min(10, 'A exigência precisa de uma frase completa.'),
  cartorioId: z.string().nullable(),
  temaId: z.string().nullable(),
  resultado: z.enum(['mantida', 'afastada', 'parcial', 'sem_julgamento']),
});

/**
 * Decide UM item da fila: aprovar publica; corrigir aplica os campos e
 * publica; descartar arquiva a exigência (nunca some — rastreabilidade).
 */
export async function decidirRevisao(
  revisaoId: string,
  decisao:
    | { tipo: 'aprovar' }
    | { tipo: 'descartar'; notas?: string }
    | {
        tipo: 'corrigir';
        campos: { textoNormalizado: string; cartorioId: string | null; temaId: string | null; resultado: string };
      },
) {
  const sessao = await requireMaster();
  const revisao = await prisma.revisaoJurimetria.findUnique({
    where: { id: revisaoId },
    include: { exigencia: true },
  });
  if (!revisao || revisao.status !== 'pendente')
    return { ok: false as const, erro: 'Item não está mais pendente.' };

  const revisor = sessao.user?.id ?? null;
  const agora = new Date();

  if (decisao.tipo === 'descartar') {
    await prisma.$transaction([
      prisma.revisaoJurimetria.update({
        where: { id: revisao.id },
        data: { status: 'descartada', notas: decisao.notas ?? null },
      }),
      prisma.exigencia.update({
        where: { id: revisao.exigenciaId },
        data: { publicado: false, revisadoPor: revisor, revisadoEm: agora },
      }),
    ]);
    revalidatePath('/admin/jurimetria/revisao');
    return { ok: true as const };
  }

  let dados: Record<string, unknown> = {};
  let status = 'aprovada';
  if (decisao.tipo === 'corrigir') {
    const v = esquemaCorrecao.safeParse(decisao.campos);
    if (!v.success) return { ok: false as const, erro: v.error.issues[0]?.message ?? 'Campos inválidos.' };
    dados = { ...v.data, titularPendente: false };
    status = 'corrigida';
  }
  // Princípio duro: nada publica sem cartório resolvido.
  const cartorioFinal =
    decisao.tipo === 'corrigir' ? decisao.campos.cartorioId : revisao.exigencia.cartorioId;
  if (!cartorioFinal)
    return { ok: false as const, erro: 'Sem cartório resolvido não publica — corrija o cartório ou descarte.' };

  await prisma.$transaction([
    prisma.revisaoJurimetria.update({ where: { id: revisao.id }, data: { status } }),
    prisma.exigencia.update({
      where: { id: revisao.exigenciaId },
      data: { ...dados, publicado: true, revisadoPor: revisor, revisadoEm: agora },
    }),
    // Demais motivos pendentes do MESMO item saem juntos da fila.
    prisma.revisaoJurimetria.updateMany({
      where: { exigenciaId: revisao.exigenciaId, status: 'pendente', id: { not: revisao.id } },
      data: { status },
    }),
  ]);
  revalidatePath('/admin/jurimetria/revisao');
  return { ok: true as const };
}
