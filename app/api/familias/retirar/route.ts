/**
 * "Retirar solicitação" — o direito de sair APAGANDO TUDO (LGPD): o intake,
 * os códigos de handoff e (quando existirem) as respostas de advogados saem
 * do servidor numa transação. Credencial: o tokenGestao do herdeiro.
 */

import { prisma } from '@/lib/prisma';
import { foraDaPlataforma } from '@/lib/app';
import { foraSeStandby } from '@/lib/standby';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const parada = foraSeStandby('familias');
  if (parada) return parada;
  const fora = foraDaPlataforma('SUCESSORISTA');
  if (fora) return fora;

  let body: { token?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ erro: 'JSON inválido' }, { status: 400 });
  }
  const token = String(body.token ?? '').slice(0, 120);
  const intake = await prisma.familiaIntake.findUnique({
    where: { tokenGestao: token },
    select: { id: true },
  });
  if (!intake) return Response.json({ erro: 'Solicitação não encontrada.' }, { status: 404 });

  await prisma.$transaction([
    prisma.intakeHandoff.deleteMany({ where: { intakeId: intake.id } }),
    prisma.radarResposta.deleteMany({ where: { intakeId: intake.id } }),
    prisma.radarMensagem.deleteMany({ where: { intakeId: intake.id } }),
    prisma.familiaIntake.delete({ where: { id: intake.id } }),
  ]);
  return Response.json({ ok: true });
}
