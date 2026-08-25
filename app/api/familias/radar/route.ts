/**
 * Radar de herdeiros — PUBLICAÇÃO da solicitação (herdeiro).
 *
 * O herdeiro SOLICITA; advogados respondem — nunca o contrário.
 *
 * O consentimento é o ACEITE NA TELA (dupla confirmação no diálogo), e é ele
 * que publica: `consentimentoEm`/`publicadoEm` são carimbados aqui mesmo.
 * Antes havia um segundo passo — um link de confirmação por e-mail —, que o
 * escritório retirou: exigia e-mail de quem só queria ser respondido e
 * deixava solicitações paradas para sempre no meio do caminho. A página
 * `/familias/confirmar/[codigo]` continua funcionando para os links antigos
 * que já foram enviados.
 *
 * O e-mail é OBRIGATÓRIO para publicar — não como validação (ninguém precisa
 * clicar em link nenhum), mas porque é o CANAL da família: é por ele que ela
 * sabe que um(a) advogado(a) respondeu, e é o que o aviso honesto de 72h usa.
 * Publicar sem canal seria pedir que a família ficasse voltando ao site por
 * conta própria. Com o caso já publicado, esta rota apenas ATUALIZA o e-mail
 * (troca de endereço), sem republicar.
 */

import { prisma } from '@/lib/prisma';
import { foraDaPlataforma } from '@/lib/app';
import { radarAtivo } from '@/lib/radar/config';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const JA_PUBLICADO = ['publicado', 'em_conversa', 'contratado'];

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

  const token = String(body.token ?? '').slice(0, 120);
  const email = String(body.email ?? '').trim().slice(0, 200);
  const emailValido = /.+@.+\..+/.test(email);
  if (email && !emailValido) {
    return Response.json({ erro: 'Esse e-mail não parece válido — confira ou deixe em branco.' }, { status: 422 });
  }

  const intake = await prisma.familiaIntake.findUnique({ where: { tokenGestao: token } });
  if (!intake || intake.status === 'retirado' || intake.status === 'expirado' || intake.expiraEm < new Date()) {
    return Response.json({ erro: 'Solicitação não encontrada ou expirada.' }, { status: 404 });
  }

  // Já publicado: o pedido só pode estar acrescentando o e-mail de avisos.
  if (JA_PUBLICADO.includes(intake.status)) {
    if (!emailValido) {
      return Response.json({ erro: 'Esta solicitação já está publicada.' }, { status: 409 });
    }
    await prisma.familiaIntake.update({ where: { id: intake.id }, data: { email } });
    return Response.json({ ok: true, publicado: true, avisos: true });
  }

  // Publicação: o aceite é obrigatório e é o que autoriza (LGPD).
  if (body.consentimento !== true) {
    return Response.json(
      { erro: 'É preciso confirmar a publicação para o caso entrar no Radar.' },
      { status: 422 },
    );
  }
  // ...e o e-mail é o canal por onde a resposta chega.
  if (!emailValido) {
    return Response.json(
      { erro: 'Informe um e-mail — é por ele que você recebe as respostas dos advogados.' },
      { status: 422 },
    );
  }

  const agora = new Date();
  await prisma.familiaIntake.update({
    where: { id: intake.id },
    data: {
      status: 'publicado',
      consentimentoEm: agora,
      publicadoEm: agora,
      // O link de confirmação deixou de existir: nenhum código fica pendurado.
      confirmacaoToken: null,
      email,
    },
  });

  return Response.json({ ok: true, publicado: true, avisos: true });
}
