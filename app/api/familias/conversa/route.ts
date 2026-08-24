/**
 * Radar de herdeiros — ações da FAMÍLIA sobre as respostas (token = credencial):
 *
 *  { acao: 'conversar', advogadoId } — "Quero conversar": abre a conversa 1:1
 *    com UM(A) advogado(a) por vez e libera o contato da família só para ele(a);
 *  { acao: 'mensagem', texto }       — mensagem no canal aberto;
 *  { acao: 'encerrar' }              — fecha a conversa; o caso VOLTA ao Radar
 *    (o histórico permanece para a família);
 *  { acao: 'contratei' }             — confirma a contratação: gera o código de
 *    handoff, entrega-o na conversa e o caso SAI do Radar.
 *
 * A plataforma não intermedeia honorários nem indica advogados — toda escolha
 * é da família, e nenhuma ação aqui nasce do lado do(a) advogado(a).
 */

import { prisma } from '@/lib/prisma';
import { foraDaPlataforma } from '@/lib/app';
import { radarAtivo } from '@/lib/radar/config';
import { enviarEmailPortal } from '@/lib/portal/email';
import { notificarContratacaoRadar, notificarMensagemRadar } from '@/lib/radar/notificar';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Mesmo alfabeto ditável do handoff (sem 0/O, 1/I/L). */
function gerarCodigo(): string {
  const alfabeto = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => alfabeto[b % alfabeto.length]).join('');
}

export async function POST(req: Request) {
  const fora = foraDaPlataforma('SUCESSORISTA');
  if (fora) return fora;
  if (!radarAtivo()) return Response.json({ erro: 'Radar indisponível.' }, { status: 404 });

  let body: { token?: string; acao?: string; advogadoId?: string; texto?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ erro: 'JSON inválido' }, { status: 400 });
  }
  const token = String(body.token ?? '').slice(0, 120);
  const acao = String(body.acao ?? '');

  const intake = await prisma.familiaIntake.findUnique({ where: { tokenGestao: token } });
  if (!intake || intake.status === 'retirado' || intake.status === 'expirado' || intake.expiraEm < new Date()) {
    return Response.json({ erro: 'Solicitação não encontrada ou expirada.' }, { status: 404 });
  }

  if (acao === 'conversar') {
    if (intake.status !== 'publicado') {
      return Response.json(
        { erro: 'Já existe uma conversa aberta — encerre-a antes de escolher outro(a) advogado(a).' },
        { status: 409 },
      );
    }
    const advogadoId = String(body.advogadoId ?? '');
    const resposta = await prisma.radarResposta.findUnique({
      where: { intakeId_advogadoUserId: { intakeId: intake.id, advogadoUserId: advogadoId } },
    });
    if (!resposta) return Response.json({ erro: 'Resposta não encontrada.' }, { status: 404 });
    await prisma.familiaIntake.update({
      where: { id: intake.id },
      data: {
        status: 'em_conversa',
        conversaAdvogadoUserId: advogadoId,
        conversaAbertaEm: new Date(),
      },
    });
    // Aviso ao(à) advogado(a) escolhido(a) — melhor-esforço.
    try {
      const adv = await prisma.user.findUnique({ where: { id: advogadoId }, select: { email: true, name: true } });
      if (adv?.email) {
        const origin = new URL(req.url).origin;
        void enviarEmailPortal({
          para: adv.email,
          assunto: 'Uma família quer conversar com você',
          titulo: 'Conversa aberta no Radar',
          paragrafos: [
            `${adv.name ? `${adv.name.split(/\s+/)[0]}, u` : 'U'}ma família escolheu a sua resposta e abriu a conversa. O contato dela está liberado na tela do Radar.`,
          ],
          urlPortal: `${origin}/radar`,
          rotuloBotao: 'Abrir o Radar',
          rodape: 'Honorários são tratados fora da plataforma, diretamente com a família.',
        });
      }
    } catch {
      // sem e-mail não bloqueia a conversa
    }
    return Response.json({ ok: true });
  }

  if (acao === 'mensagem') {
    const texto = String(body.texto ?? '').trim().slice(0, 2000);
    if (!texto) return Response.json({ erro: 'Escreva a mensagem.' }, { status: 422 });
    if (
      (intake.status !== 'em_conversa' && intake.status !== 'contratado') ||
      !intake.conversaAdvogadoUserId
    ) {
      return Response.json({ erro: 'Abra uma conversa antes de enviar mensagens.' }, { status: 409 });
    }
    await prisma.radarMensagem.create({
      data: {
        intakeId: intake.id,
        advogadoUserId: intake.conversaAdvogadoUserId,
        autor: 'familia',
        texto,
      },
    });
    // Avisa o(a) advogado(a) que há mensagem esperando (o CONTEÚDO fica na
    // plataforma) — melhor-esforço, nunca derruba o envio.
    try {
      const adv = await prisma.user.findUnique({
        where: { id: intake.conversaAdvogadoUserId },
        select: { email: true },
      });
      void notificarMensagemRadar({
        destinatario: 'advogado',
        email: adv?.email,
        origin: new URL(req.url).origin,
      });
    } catch {
      // sem e-mail a mensagem continua valendo na tela
    }
    return Response.json({ ok: true }, { status: 201 });
  }

  if (acao === 'encerrar') {
    if (intake.status !== 'em_conversa') {
      return Response.json({ erro: 'Não há conversa aberta.' }, { status: 409 });
    }
    await prisma.familiaIntake.update({
      where: { id: intake.id },
      data: { status: 'publicado', conversaAdvogadoUserId: null, conversaAbertaEm: null },
    });
    return Response.json({ ok: true });
  }

  if (acao === 'contratei') {
    if (intake.status !== 'em_conversa' || !intake.conversaAdvogadoUserId) {
      return Response.json({ erro: 'Abra uma conversa antes de confirmar a contratação.' }, { status: 409 });
    }
    const handoff = await prisma.intakeHandoff.create({
      data: { intakeId: intake.id, codigo: gerarCodigo(), advogadoUserId: intake.conversaAdvogadoUserId },
    });
    await prisma.$transaction([
      prisma.familiaIntake.update({
        where: { id: intake.id },
        data: { status: 'contratado', contratadoEm: new Date() },
      }),
      prisma.radarMensagem.create({
        data: {
          intakeId: intake.id,
          advogadoUserId: intake.conversaAdvogadoUserId,
          autor: 'familia',
          texto: `A família confirmou a contratação. Código do caso para importar no Sucessorista: ${handoff.codigo}`,
        },
      }),
    ]);
    // O CÓDIGO do handoff é o que o(a) advogado(a) precisa para criar o caso
    // — sem este aviso ele só o veria voltando à conversa por conta própria.
    try {
      const adv = await prisma.user.findUnique({
        where: { id: intake.conversaAdvogadoUserId },
        select: { email: true },
      });
      void notificarContratacaoRadar({
        email: adv?.email,
        origin: new URL(req.url).origin,
        codigo: handoff.codigo,
      });
    } catch {
      // o código continua na conversa e no funil "Minhas respostas"
    }
    return Response.json({ ok: true, codigo: handoff.codigo });
  }

  if (acao === 'denunciar') {
    // Denúncia sobre uma resposta/conduta — vai para a fila do /admin/radar;
    // acatar suspende o perfil do(a) advogado(a).
    const advogadoId = String(body.advogadoId ?? '');
    const motivo = String(body.texto ?? '').trim().slice(0, 1000);
    if (!motivo || motivo.length < 10) {
      return Response.json({ erro: 'Descreva o que aconteceu (ao menos 10 caracteres).' }, { status: 422 });
    }
    const resposta = await prisma.radarResposta.findUnique({
      where: { intakeId_advogadoUserId: { intakeId: intake.id, advogadoUserId: advogadoId } },
    });
    if (!resposta && intake.conversaAdvogadoUserId !== advogadoId) {
      return Response.json({ erro: 'Resposta não encontrada.' }, { status: 404 });
    }
    await prisma.radarDenuncia.create({
      data: { intakeId: intake.id, advogadoUserId: advogadoId, motivo },
    });
    return Response.json({ ok: true }, { status: 201 });
  }

  return Response.json({ erro: 'Ação desconhecida.' }, { status: 400 });
}
