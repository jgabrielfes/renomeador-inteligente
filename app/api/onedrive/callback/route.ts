/**
 * GET /api/onedrive/callback — volta do consentimento da Microsoft.
 *
 * Valida o `state` anti-CSRF (cookie da rota /conectar), troca o code pelos
 * tokens e guarda o REFRESH token na conta — a conexão vale em qualquer
 * dispositivo em que o usuário logar. O navegador nunca vê o refresh token;
 * ele recebe access tokens de vida curta pela server action.
 */

import { foraDaPlataforma } from '@/lib/app';
import { auth } from '@/lib/auth';
import { origemDaRequisicao } from '@/lib/drive';
import { trocarCodigoOneDrive } from '@/lib/onedrive';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const LIMPA_STATE =
  'onedrive_oauth_state=; Path=/api/onedrive; Max-Age=0; HttpOnly; SameSite=Lax; Secure';

export async function GET(req: Request) {
  const fora = foraDaPlataforma('SUCESSORISTA');
  if (fora) return fora;

  const origem = origemDaRequisicao(req);
  const volta = (q: string) =>
    new Response(null, {
      status: 302,
      headers: { location: `${origem}/?onedrive=${q}`, 'set-cookie': LIMPA_STATE },
    });

  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return volta('sem-sessao');

  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const cookieState = (req.headers.get('cookie') ?? '')
    .split(/;\s*/)
    .find((c) => c.startsWith('onedrive_oauth_state='))
    ?.slice('onedrive_oauth_state='.length);
  if (!code || !state || !cookieState || state !== cookieState) return volta('erro');

  const tokens = await trocarCodigoOneDrive(code, `${origem}/api/onedrive/callback`);
  if (!tokens?.refreshToken) return volta('erro');

  try {
    await prisma.user.update({
      where: { id: userId },
      data: {
        oneDriveRefreshToken: tokens.refreshToken,
        oneDriveEmail: tokens.email,
        oneDriveConectadoEm: new Date(),
      },
    });
  } catch {
    return volta('erro');
  }
  return volta('conectado');
}
