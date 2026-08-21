/**
 * POST /api/portal/recuperar — "perdi o link do meu convite".
 *
 * O herdeiro informa o e-mail; se ele constar de algum convite (salvo no
 * portal ou na qualificação), os links vão para AQUELE e-mail. A resposta é
 * SEMPRE a mesma — a rota nunca confirma se um e-mail existe (sem
 * enumeração). Recurso env-gated: sem RESEND_API_KEY responde 404, como se
 * não existisse.
 */

import { foraDaPlataforma } from '@/lib/app';
import { emailHabilitado } from '@/lib/portal/email';
import { reenviarLinksPorEmail } from '@/lib/portal/notificar';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const fora = foraDaPlataforma('SUCESSORISTA');
  if (fora) return fora;
  if (!emailHabilitado()) {
    return Response.json({ erro: 'Recurso indisponível.' }, { status: 404 });
  }

  let body: { email?: string };
  try {
    body = (await req.json()) as { email?: string };
  } catch {
    return Response.json({ erro: 'JSON inválido' }, { status: 400 });
  }
  const email = String(body?.email ?? '').trim();
  if (!/.+@.+\..+/.test(email) || email.length > 200) {
    return Response.json({ erro: 'Informe um e-mail válido.' }, { status: 422 });
  }

  // O reenvio roda em segundo plano — o tempo de resposta não pode denunciar
  // se houve convite encontrado ou não.
  void reenviarLinksPorEmail(email, new URL(req.url).origin);
  return Response.json({
    ok: true,
    mensagem:
      'Se este e-mail estiver em algum convite, o link de acesso chega na caixa de entrada em instantes.',
  });
}
