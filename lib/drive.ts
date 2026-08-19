/**
 * Google Drive conectado (Sucessorista) — helpers de SERVIDOR do OAuth.
 *
 * O escopo é `drive.file`: a aplicação só enxerga a pasta que ELA criar no
 * Drive do usuário. O refresh token fica na conta (`users.driveRefreshToken`)
 * e vale em qualquer dispositivo; o navegador recebe só ACCESS tokens de
 * vida curta (o refresh nunca sai do servidor). Reusa o cliente OAuth do
 * login com Google (AUTH_GOOGLE_ID/SECRET) — cadastrar o redirect
 * `/api/drive/callback` no console do Google Cloud.
 */

export function driveDisponivel(): boolean {
  return Boolean(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET);
}

export function origemDaRequisicao(req: Request): string {
  const url = new URL(req.url);
  const proto = req.headers.get('x-forwarded-proto') ?? url.protocol.replace(':', '');
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host') ?? url.host;
  return `${proto}://${host}`;
}

export interface TokensDrive {
  refreshToken: string | null;
  accessToken: string;
  expiresIn: number;
  email: string | null;
}

/** Troca o code do consentimento pelos tokens (callback do OAuth). */
export async function trocarCodigoDrive(
  code: string,
  redirectUri: string,
): Promise<TokensDrive | null> {
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: process.env.AUTH_GOOGLE_ID ?? '',
      client_secret: process.env.AUTH_GOOGLE_SECRET ?? '',
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
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
  // E-mail só para EXIBIÇÃO ("Drive conectado: fulano@gmail.com") — vem do
  // id_token, decodificado sem verificação (não é credencial de nada aqui).
  let email: string | null = null;
  try {
    if (dados.id_token) {
      const payload = JSON.parse(
        Buffer.from(dados.id_token.split('.')[1], 'base64url').toString('utf-8'),
      ) as { email?: string };
      email = typeof payload.email === 'string' ? payload.email : null;
    }
  } catch {
    email = null;
  }
  return {
    refreshToken: dados.refresh_token ?? null,
    accessToken: dados.access_token,
    expiresIn: dados.expires_in ?? 3600,
    email,
  };
}

/**
 * Access token novo a partir do refresh token da conta.
 * null = falha temporária; 'revogado' = o usuário desfez a autorização no
 * Google (a coluna deve ser limpa e a UI volta a oferecer a conexão).
 */
export async function novoAccessTokenDrive(
  refreshToken: string,
): Promise<{ accessToken: string; expiresIn: number } | 'revogado' | null> {
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: process.env.AUTH_GOOGLE_ID ?? '',
      client_secret: process.env.AUTH_GOOGLE_SECRET ?? '',
      grant_type: 'refresh_token',
    }),
  });
  if (r.status === 400 || r.status === 401) {
    try {
      const corpo = (await r.json()) as { error?: string };
      if (corpo.error === 'invalid_grant') return 'revogado';
    } catch {
      // corpo ilegível — trata como falha temporária
    }
    return null;
  }
  if (!r.ok) return null;
  const dados = (await r.json()) as { access_token?: string; expires_in?: number };
  if (!dados.access_token) return null;
  return { accessToken: dados.access_token, expiresIn: dados.expires_in ?? 3600 };
}

/** Revoga a autorização no Google (melhor-esforço — a coluna é limpa sempre). */
export async function revogarDrive(refreshToken: string): Promise<void> {
  try {
    await fetch('https://oauth2.googleapis.com/revoke', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ token: refreshToken }),
    });
  } catch {
    // sem rede/já revogado — segue
  }
}
