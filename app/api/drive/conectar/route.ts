/**
 * GET /api/drive/conectar — início do OAuth do Google Drive (Sucessorista).
 *
 * Abre o consentimento do Google com o escopo `drive.file` (a aplicação só
 * enxerga a pasta que ELA criar no Drive do usuário — nada mais). Reusa o
 * MESMO cliente OAuth do login com Google (AUTH_GOOGLE_ID/SECRET); o
 * redirect `/api/drive/callback` precisa estar cadastrado no console.
 * `state` anti-CSRF vai num cookie httpOnly de vida curta.
 */

import { foraDaPlataforma } from '@/lib/app';
import { auth } from '@/lib/auth';
import { driveDisponivel, origemDaRequisicao } from '@/lib/drive';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const fora = foraDaPlataforma('SUCESSORISTA');
  if (fora) return fora;

  const session = await auth();
  const origem = origemDaRequisicao(req);
  if (!session) return Response.redirect(`${origem}/login?callbackUrl=%2F`, 302);

  if (!driveDisponivel()) {
    return Response.redirect(`${origem}/?drive=indisponivel`, 302);
  }
  const clientId = process.env.AUTH_GOOGLE_ID!;

  const state = crypto.randomUUID();
  const autorizar = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  autorizar.searchParams.set('client_id', clientId);
  autorizar.searchParams.set('redirect_uri', `${origem}/api/drive/callback`);
  autorizar.searchParams.set('response_type', 'code');
  autorizar.searchParams.set('scope', 'https://www.googleapis.com/auth/drive.file email');
  // offline + consent: garante o REFRESH token (a conexão vale para sempre,
  // até o usuário desconectar) mesmo quando o usuário já consentiu antes.
  autorizar.searchParams.set('access_type', 'offline');
  autorizar.searchParams.set('prompt', 'consent');
  autorizar.searchParams.set('state', state);

  return new Response(null, {
    status: 302,
    headers: {
      location: autorizar.toString(),
      'set-cookie': `drive_oauth_state=${state}; Path=/api/drive; Max-Age=600; HttpOnly; SameSite=Lax; Secure`,
    },
  });
}
