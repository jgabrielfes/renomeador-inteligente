'use server';

/**
 * FEEDBACK da plataforma (shell LexCausa) — reportar problema e sugerir
 * melhoria sem sair da tela. Server actions com validação completa no
 * servidor; a página atual chega do cliente e é saneada (só caminho). A
 * severidade/estado é classificada pela equipe em /admin/feedback.
 */

import { z } from 'zod';

import { APP } from '@/lib/app';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

const esquema = z.object({
  tipo: z.enum(['bug', 'sugestao']),
  categoria: z.enum(['funcionalidade', 'usabilidade', 'outro']).optional(),
  titulo: z.string().trim().min(1, 'Dê um título curto.').max(120, 'O título vai até 120 caracteres.'),
  descricao: z
    .string()
    .trim()
    .min(1, 'Descreva o que aconteceu (ou a sua ideia).')
    .max(4000, 'A descrição vai até 4000 caracteres.'),
  pagina: z.string().max(200).optional(),
});

export async function enviarFeedback(
  entrada: z.infer<typeof esquema>,
): Promise<{ ok: boolean; erro?: string }> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, erro: 'Sessão expirada — entre de novo.' };
  const parsed = esquema.safeParse(entrada);
  if (!parsed.success) {
    return { ok: false, erro: parsed.error.issues[0]?.message ?? 'Dados inválidos.' };
  }
  const d = parsed.data;
  // Só o CAMINHO da página (nada de query string — pode carregar token).
  const pagina = (d.pagina ?? '').split('?')[0].slice(0, 200) || null;
  try {
    await prisma.feedback.create({
      data: {
        app: APP,
        userId: session.user.id,
        userEmail: session.user.email ?? null,
        tipo: d.tipo,
        categoria: d.tipo === 'sugestao' ? d.categoria ?? 'funcionalidade' : null,
        titulo: d.titulo,
        descricao: d.descricao,
        pagina,
      },
    });
    return { ok: true };
  } catch {
    return { ok: false, erro: 'Não foi possível enviar agora — tente de novo.' };
  }
}

export interface MeuFeedback {
  id: string;
  tipo: string;
  titulo: string;
  status: string;
  criadoEm: string;
  /** Resposta escrita pela equipe (null = ainda sem resposta). */
  resposta: string | null;
  respondidoEm: string | null;
}

export async function meusFeedbacks(): Promise<MeuFeedback[]> {
  const session = await auth();
  if (!session?.user?.id) return [];
  try {
    const linhas = await prisma.feedback.findMany({
      where: { app: APP, userId: session.user.id },
      orderBy: { createdAt: 'desc' },
      take: 30,
      select: {
        id: true,
        tipo: true,
        titulo: true,
        status: true,
        createdAt: true,
        resposta: true,
        respondidoEm: true,
      },
    });
    return linhas.map((l) => ({
      id: l.id,
      tipo: l.tipo,
      titulo: l.titulo,
      status: l.status,
      criadoEm: l.createdAt.toISOString(),
      resposta: l.resposta,
      respondidoEm: l.respondidoEm?.toISOString() ?? null,
    }));
  } catch {
    return [];
  }
}
