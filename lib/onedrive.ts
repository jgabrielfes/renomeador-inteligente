/**
 * OneDrive conectado (Sucessorista) — helpers de SERVIDOR do OAuth Microsoft.
 *
 * Espelho do `lib/drive.ts`, sobre a Microsoft identity platform: o escopo é
 * `Files.ReadWrite.AppFolder` — a aplicação só enxerga a PASTA DE APP
 * ("Apps/O Sucessorista") no OneDrive do usuário, nada mais. O refresh token
 * fica na conta (`users.oneDriveRefreshToken`) e vale em qualquer
 * dispositivo; o navegador recebe só ACCESS tokens de vida curta.
 *
 * DIFERENÇA IMPORTANTE do Google: o refresh token da Microsoft ROTACIONA —
 * cada renovação devolve um refresh token NOVO que substitui o anterior.
 * `novoAccessTokenOneDrive` devolve o token novo e quem chama (a server
 * action) REGRAVA a coluna. E a Microsoft não tem endpoint público de
 * revogação: desconectar limpa a coluna; o usuário pode também remover o
 * app em https://account.live.com/consent/Manage.
 *
 * Cadastro (só do dono, uma vez): app no portal do Azure/Microsoft Entra
 * (Contas pessoais + organizacionais), com o redirect `/api/onedrive/callback`
 * e um client secret — envs ONEDRIVE_CLIENT_ID / ONEDRIVE_CLIENT_SECRET.
 */

const TOKEN_URL = 'https://login.microsoftonline.com/common/oauth2/v2.0/token';

/** Escopos: pasta de app + offline (refresh) + e-mail para exibição. */
export const ESCOPOS_ONEDRIVE = 'Files.ReadWrite.AppFolder offline_access openid email';

export function oneDriveDisponivel(): boolean {
  return Boolean(process.env.ONEDRIVE_CLIENT_ID && process.env.ONEDRIVE_CLIENT_SECRET);
}

export interface TokensOneDrive {
  refreshToken: string | null;
  accessToken: string;
  expiresIn: number;
  email: string | null;
}

/** E-mail de EXIBIÇÃO a partir do id_token (sem verificação — não é credencial). */
function emailDoIdToken(idToken: string | undefined): string | null {
  try {
    if (!idToken) return null;
    const payload = JSON.parse(
      Buffer.from(idToken.split('.')[1], 'base64url').toString('utf-8'),
    ) as { email?: string; preferred_username?: string };
    if (typeof payload.email === 'string') return payload.email;
    if (typeof payload.preferred_username === 'string' && payload.preferred_username.includes('@'))
      return payload.preferred_username;
    return null;
  } catch {
    return null;
  }
}

/** Troca o code do consentimento pelos tokens (callback do OAuth). */
export async function trocarCodigoOneDrive(
  code: string,
  redirectUri: string,
): Promise<TokensOneDrive | null> {
  const r = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: process.env.ONEDRIVE_CLIENT_ID ?? '',
      client_secret: process.env.ONEDRIVE_CLIENT_SECRET ?? '',
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
      scope: ESCOPOS_ONEDRIVE,
    }),
  });
  if (!r.ok) return null;
  const dados = (await r.json()) as {
    refresh_token?: string;
    access_token?: string;
    expires_in?: number;
    id_token?: string;
  };
  if (!dados.access_token) return null;
  return {
    refreshToken: dados.refresh_token ?? null,
    accessToken: dados.access_token,
    expiresIn: dados.expires_in ?? 3600,
    email: emailDoIdToken(dados.id_token),
  };
}

/**
 * Access token novo a partir do refresh token da conta. O refresh token
 * DEVOLVIDO substitui o usado (rotação da Microsoft) — regravar a coluna.
 * null = falha temporária; 'revogado' = autorização desfeita pelo usuário.
 */
export async function novoAccessTokenOneDrive(
  refreshToken: string,
): Promise<{ accessToken: string; expiresIn: number; refreshToken: string | null } | 'revogado' | null> {
  const r = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: process.env.ONEDRIVE_CLIENT_ID ?? '',
      client_secret: process.env.ONEDRIVE_CLIENT_SECRET ?? '',
      grant_type: 'refresh_token',
      scope: ESCOPOS_ONEDRIVE,
    }),
  });
  if (r.status === 400 || r.status === 401) {
    try {
      const corpo = (await r.json()) as { error?: string };
      // invalid_grant: o usuário revogou/expirou de vez — reconectar.
      if (corpo.error === 'invalid_grant') return 'revogado';
    } catch {
      // corpo ilegível — trata como falha temporária
    }
    return null;
  }
  if (!r.ok) return null;
  const dados = (await r.json()) as {
    access_token?: string;
    expires_in?: number;
    refresh_token?: string;
  };
  if (!dados.access_token) return null;
  return {
    accessToken: dados.access_token,
    expiresIn: dados.expires_in ?? 3600,
    refreshToken: dados.refresh_token ?? null,
  };
}
