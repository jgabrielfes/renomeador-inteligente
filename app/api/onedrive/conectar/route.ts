/**
 * GET /api/onedrive/conectar — início do OAuth do OneDrive (Sucessorista).
 *
 * Abre o consentimento da Microsoft com o escopo `Files.ReadWrite.AppFolder`
 * (a aplicação só enxerga a pasta de app "Apps/O Sucessorista" no OneDrive
 * do usuário — nada mais). Cliente OAuth próprio (ONEDRIVE_CLIENT_ID/SECRET,
 * cadastrado no portal do Azure/Microsoft Entra com o redirect
 * `/api/onedrive/callback`). `state` anti-CSRF num cookie httpOnly curto.
 */

import { foraDaPlataforma } from '@/lib/app';
import { auth } from '@/lib/auth';
import { origemDaRequisicao } from '@/lib/drive';
import { ESCOPOS_ONEDRIVE, oneDriveDisponivel } from '@/lib/onedrive';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const fora = foraDaPlataforma('SUCESSORISTA');
  if (fora) return fora;

  const session = await auth();
  const origem = origemDaRequisicao(req);
  if (!session) return Response.redirect(`${origem}/login?callbackUrl=%2F`, 302);

  if (!oneDriveDisponivel()) {
    return Response.redirect(`${origem}/?onedrive=indisponivel`, 302);
  }
  const clientId = process.env.ONEDRIVE_CLIENT_ID!;

  const state = crypto.randomUUID();
  const autorizar = new URL('https://login.microsoftonline.com/common/oauth2/v2.0/authorize');
  autorizar.searchParams.set('client_id', clientId);
  autorizar.searchParams.set('redirect_uri', `${origem}/api/onedrive/callback`);
  autorizar.searchParams.set('response_type', 'code');
  autorizar.searchParams.set('response_mode', 'query');
  // offline_access garante o REFRESH token; select_account SEMPRE abre o
  // seletor de contas da Microsoft (sem ele, entra a conta já logada no
  // navegador — e o usuário não consegue conectar a conta do escritório).
  // O consentimento aparece sozinho na primeira autorização do app.
  autorizar.searchParams.set('scope', ESCOPOS_ONEDRIVE);
  autorizar.searchParams.set('prompt', 'select_account');
  autorizar.searchParams.set('state', state);

  return new Response(null, {
    status: 302,
    headers: {
      location: autorizar.toString(),
      'set-cookie': `onedrive_oauth_state=${state}; Path=/api/onedrive; Max-Age=600; HttpOnly; SameSite=Lax; Secure`,
    },
  });
}
