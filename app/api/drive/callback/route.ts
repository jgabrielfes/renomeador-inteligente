/**
 * GET /api/drive/callback — volta do consentimento do Google Drive.
 *
 * Valida o `state` anti-CSRF (cookie da rota /conectar), troca o code pelos
 * tokens e guarda o REFRESH token na conta — a partir daqui a conexão vale
 * em qualquer dispositivo em que o usuário logar. O navegador nunca vê o
 * refresh token; ele recebe access tokens de vida curta pela server action.
 */

import { foraDaPlataforma } from '@/lib/app';
import { auth } from '@/lib/auth';
import { origemDaRequisicao, trocarCodigoDrive } from '@/lib/drive';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const LIMPA_STATE = 'drive_oauth_state=; Path=/api/drive; Max-Age=0; HttpOnly; SameSite=Lax; Secure';

export async function GET(req: Request) {
  const fora = foraDaPlataforma('SUCESSORISTA');
  if (fora) return fora;

  const origem = origemDaRequisicao(req);
  const volta = (q: string) =>
    new Response(null, {
      status: 302,
      headers: { location: `${origem}/?drive=${q}`, 'set-cookie': LIMPA_STATE },
    });

  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return volta('sem-sessao');

  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const cookieState = (req.headers.get('cookie') ?? '')
    .split(/;\s*/)
    .find((c) => c.startsWith('drive_oauth_state='))
    ?.slice('drive_oauth_state='.length);
  if (!code || !state || !cookieState || state !== cookieState) return volta('erro');

  const tokens = await trocarCodigoDrive(code, `${origem}/api/drive/callback`);
  if (!tokens?.refreshToken) return volta('erro');

  try {
    await prisma.user.update({
      where: { id: userId },
      data: {
        driveRefreshToken: tokens.refreshToken,
        driveEmail: tokens.email,
        driveConectadoEm: new Date(),
      },
    });
  } catch {
    return volta('erro');
  }
  return volta('conectado');
}
