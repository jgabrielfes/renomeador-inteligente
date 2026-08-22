/**
 * Handoff do intake ao advogado da família — o HERDEIRO gera um código de
 * uso único (a credencial é o tokenGestao do resultado salvo) e entrega ao
 * advogado DELE, que importa o caso pré-preenchido no Sucessorista.
 *
 * O código é curto (fácil de ditar por telefone/WhatsApp) e de USO ÚNICO;
 * gerar de novo cria outro código sem invalidar o intake.
 */

import { prisma } from '@/lib/prisma';
import { foraDaPlataforma } from '@/lib/app';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Código curto ditável: 8 caracteres sem ambíguos (0/O, 1/I/L). */
function gerarCodigo(): string {
  const alfabeto = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => alfabeto[b % alfabeto.length]).join('');
}

export async function POST(req: Request) {
  const fora = foraDaPlataforma('SUCESSORISTA');
  if (fora) return fora;

  let body: { token?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ erro: 'JSON inválido' }, { status: 400 });
  }
  const token = String(body.token ?? '').slice(0, 120);
  if (!token) return Response.json({ erro: 'Resultado não identificado.' }, { status: 422 });

  const intake = await prisma.familiaIntake.findUnique({
    where: { tokenGestao: token },
    select: { id: true, status: true, expiraEm: true },
  });
  if (!intake || intake.status === 'retirado' || intake.status === 'expirado' || intake.expiraEm < new Date()) {
    return Response.json({ erro: 'Resultado não encontrado ou expirado.' }, { status: 404 });
  }

  const handoff = await prisma.intakeHandoff.create({
    data: { intakeId: intake.id, codigo: gerarCodigo() },
  });
  return Response.json({ codigo: handoff.codigo }, { status: 201 });
}
