/**
 * Canal do caso ENTRE ADVOGADOS (camada 4, etapa A2) — o lado do(a)
 * advogado(a) CONSTITUÍDO(A), pelo token do convite-espelho (papel
 * 'advogado'). O titular usa as server actions do painel; herdeiro e
 * mediador NÃO alcançam esta rota (403). O canal é do caso: registrado,
 * exportável, e nada dele circula para a família nem para /admin.
 */

import { store } from '@/lib/portal/store-prisma';
import { prisma } from '@/lib/prisma';
import { foraDaPlataforma } from '@/lib/app';
import { papelDoConvite } from '@/lib/rede/escopo';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ token: string }> };

async function vinculoDoToken(token: string) {
  const convite = await store.obter(token);
  if (!convite) return { erro: Response.json({ erro: 'Convite não encontrado' }, { status: 404 }) };
  if (convite.revogadoEm) {
    return { erro: Response.json({ erro: 'Este convite foi encerrado.' }, { status: 410 }) };
  }
  if (papelDoConvite(convite.papelConvite) !== 'advogado') {
    return { erro: Response.json({ erro: 'Canal exclusivo dos advogados do caso.' }, { status: 403 }) };
  }
  const vinculo = await prisma.casoAdvogado.findUnique({ where: { conviteToken: token } });
  if (!vinculo || vinculo.status !== 'ativo') {
    return { erro: Response.json({ erro: 'Vínculo com o caso encerrado.' }, { status: 410 }) };
  }
  return { convite, vinculo };
}

export async function GET(_req: Request, ctx: Ctx) {
  const fora = foraDaPlataforma('SUCESSORISTA');
  if (fora) return fora;
  const { token } = await ctx.params;
  const r = await vinculoDoToken(token);
  if ('erro' in r) return r.erro;

  const mensagens = await prisma.casoAdvogadoMensagem.findMany({
    where: { casoId: r.vinculo.casoId },
    orderBy: { createdAt: 'asc' },
    take: 500,
  });
  const ids = [...new Set(mensagens.map((m) => m.deUserId))];
  const usuarios = await prisma.user.findMany({
    where: { id: { in: ids } },
    select: { id: true, name: true },
  });
  const nomePor = new Map(usuarios.map((u) => [u.id, u.name ?? 'Advogado(a)']));
  return Response.json({
    mensagens: mensagens.map((m) => ({
      autor: nomePor.get(m.deUserId) ?? 'Advogado(a)',
      texto: m.texto,
      em: m.createdAt.toISOString(),
      minha: m.deUserId === r.vinculo.advogadoUserId,
    })),
  });
}

export async function POST(req: Request, ctx: Ctx) {
  const fora = foraDaPlataforma('SUCESSORISTA');
  if (fora) return fora;
  const { token } = await ctx.params;
  const r = await vinculoDoToken(token);
  if ('erro' in r) return r.erro;

  let body: { texto?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ erro: 'JSON inválido' }, { status: 400 });
  }
  const texto = String(body.texto ?? '').trim().slice(0, 2000);
  if (!texto) return Response.json({ erro: 'Escreva a mensagem.' }, { status: 422 });

  await prisma.casoAdvogadoMensagem.create({
    data: { casoId: r.vinculo.casoId, deUserId: r.vinculo.advogadoUserId, texto },
  });
  return Response.json({ ok: true }, { status: 201 });
}
