/**
 * GET /api/dropbox/conectar — início do OAuth do Dropbox (Sucessorista).
 *
 * Abre o consentimento do Dropbox; o app é do tipo "App folder", então a
 * autorização dá acesso SÓ à pasta "Apps/O Sucessorista" no Dropbox do
 * usuário — nada mais. `token_access_type=offline` garante o REFRESH token
 * (a conexão vale até o usuário desconectar). Cliente OAuth próprio
 * (DROPBOX_CLIENT_ID/SECRET, redirect `/api/dropbox/callback` cadastrado no
 * console de desenvolvedor). `state` anti-CSRF num cookie httpOnly curto.
 */

import { foraDaPlataforma } from '@/lib/app';
import { auth } from '@/lib/auth';
import { origemDaRequisicao } from '@/lib/drive';
import { dropboxDisponivel } from '@/lib/dropbox';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const fora = foraDaPlataforma('SUCESSORISTA');
  if (fora) return fora;

  const session = await auth();
  const origem = origemDaRequisicao(req);
  if (!session) return Response.redirect(`${origem}/login?callbackUrl=%2F`, 302);

  if (!dropboxDisponivel()) {
    return Response.redirect(`${origem}/?dropbox=indisponivel`, 302);
  }
  const clientId = process.env.DROPBOX_CLIENT_ID!;

  const state = crypto.randomUUID();
  const autorizar = new URL('https://www.dropbox.com/oauth2/authorize');
  autorizar.searchParams.set('client_id', clientId);
  autorizar.searchParams.set('redirect_uri', `${origem}/api/dropbox/callback`);
  autorizar.searchParams.set('response_type', 'code');
  autorizar.searchParams.set('token_access_type', 'offline');
  autorizar.searchParams.set('state', state);

  return new Response(null, {
    status: 302,
    headers: {
      location: autorizar.toString(),
      'set-cookie': `dropbox_oauth_state=${state}; Path=/api/dropbox; Max-Age=600; HttpOnly; SameSite=Lax; Secure`,
    },
  });
}
