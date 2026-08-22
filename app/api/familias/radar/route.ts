/**
 * Radar de herdeiros — pedido de PUBLICAÇÃO da solicitação (herdeiro).
 *
 * O herdeiro SOLICITA; advogados respondem — nunca o contrário. A publicação
 * só se completa com o clique no LINK DE CONFIRMAÇÃO enviado ao e-mail
 * (consentimento específico + e-mail confirmado, LGPD): esta rota registra o
 * pedido e envia o link; quem publica é /familias/confirmar/[codigo].
 */

import { prisma } from '@/lib/prisma';
import { foraDaPlataforma } from '@/lib/app';
import { gerarToken } from '@/lib/portal/store';
import { radarAtivo } from '@/lib/radar/config';
import { enviarEmailPortal } from '@/lib/portal/email';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const fora = foraDaPlataforma('SUCESSORISTA');
  if (fora) return fora;
  if (!radarAtivo()) {
    return Response.json({ erro: 'A análise por advogados não está disponível no momento.' }, { status: 404 });
  }

  let body: { token?: string; email?: string; consentimento?: boolean };
  try {
    body = await req.json();
  } catch {
    return Response.json({ erro: 'JSON inválido' }, { status: 400 });
  }
  if (body.consentimento !== true) {
    return Response.json(
      { erro: 'É preciso marcar o consentimento para publicar a solicitação.' },
      { status: 422 },
    );
  }
  const token = String(body.token ?? '').slice(0, 120);
  const email = String(body.email ?? '').trim().slice(0, 200);
  if (!/.+@.+\..+/.test(email)) {
    return Response.json({ erro: 'Informe um e-mail válido — a confirmação vai por ele.' }, { status: 422 });
  }

  const intake = await prisma.familiaIntake.findUnique({ where: { tokenGestao: token } });
  if (!intake || intake.status === 'retirado' || intake.status === 'expirado' || intake.expiraEm < new Date()) {
    return Response.json({ erro: 'Solicitação não encontrada ou expirada.' }, { status: 404 });
  }
  if (intake.status === 'publicado' || intake.status === 'em_conversa' || intake.status === 'contratado') {
    return Response.json({ erro: 'Esta solicitação já está publicada.' }, { status: 409 });
  }

  const confirmacaoToken = gerarToken();
  await prisma.familiaIntake.update({
    where: { id: intake.id },
    data: { email, confirmacaoToken },
  });

  const url = `${new URL(req.url).origin}/familias/confirmar/${confirmacaoToken}`;
  const enviado = await enviarEmailPortal({
    para: email,
    assunto: 'Confirme para publicar sua solicitação de análise',
    titulo: 'Falta um clique',
    paragrafos: [
      `Olá${intake.nome ? `, ${intake.nome.split(/\s+/)[0]}` : ''}.`,
      'Você pediu que advogados especializados em inventário analisem o seu caso. Para publicar, confirme o seu e-mail no botão abaixo.',
      'O caso é publicado SEM o seu nome e sem contato — advogados veem só um resumo anônimo (cidade, via provável, faixa de valor). Seu contato só é liberado se VOCÊ escolher conversar com um deles, um por vez. Você pode retirar a solicitação a qualquer momento, apagando tudo.',
    ],
    urlPortal: url,
    rotuloBotao: 'Confirmar e publicar',
    rodape:
      'Se não foi você quem pediu, ignore este e-mail — nada será publicado. Esta plataforma não intermedeia honorários nem indica advogados.',
  });
  if (!enviado) {
    return Response.json({ erro: 'Não foi possível enviar o e-mail de confirmação — tente de novo.' }, { status: 502 });
  }
  return Response.json({ ok: true });
}
