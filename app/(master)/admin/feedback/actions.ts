'use server';

/**
 * Ações do /admin/feedback (somente MASTER): classificar a situação de um
 * relato — aberto → em análise → resolvido. A severidade/priorização é
 * decisão da equipe; o texto do usuário nunca é editado.
 */

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { APP } from '@/lib/app';
import { requireMaster } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

const esquema = z.object({
  id: z.string().min(1),
  status: z.enum(['aberto', 'em_analise', 'resolvido']),
});

export async function alterarStatusFeedback(
  entrada: z.infer<typeof esquema>,
): Promise<{ ok: boolean; erro?: string }> {
  await requireMaster();
  const parsed = esquema.safeParse(entrada);
  if (!parsed.success) return { ok: false, erro: 'Dados inválidos.' };
  try {
    // Fronteira dos sites: só relatos DESTE site podem ser classificados aqui.
    const r = await prisma.feedback.updateMany({
      where: { id: parsed.data.id, app: APP },
      data: { status: parsed.data.status },
    });
    if (r.count === 0) return { ok: false, erro: 'Relato não encontrado.' };
    revalidatePath('/admin/feedback');
    return { ok: true };
  } catch {
    return { ok: false, erro: 'Não foi possível salvar agora.' };
  }
}
