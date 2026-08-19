/**
 * Dropbox conectado (Sucessorista) — helpers de SERVIDOR do OAuth.
 *
 * Espelho de `lib/drive.ts`/`lib/onedrive.ts` sobre o Dropbox: o app é
 * cadastrado com acesso "App folder" — a aplicação só enxerga a pasta
 * "Apps/O Sucessorista" no Dropbox do usuário, nada mais (os caminhos da
 * API são RELATIVOS a essa pasta). O refresh token fica na conta
 * (`users.dropboxRefreshToken`) e NÃO rotaciona (como o do Google); o
 * navegador recebe só ACCESS tokens de vida curta.
 *
 * Cadastro (só do dono, uma vez): app em https://www.dropbox.com/developers
 * com acesso "App folder", permissões files.content.read/write +
 * account_info.read, e o redirect `/api/dropbox/callback` — envs
 * DROPBOX_CLIENT_ID (App key) / DROPBOX_CLIENT_SECRET (App secret).
 */

const TOKEN_URL = 'https://api.dropboxapi.com/oauth2/token';

export function dropboxDisponivel(): boolean {
  return Boolean(process.env.DROPBOX_CLIENT_ID && process.env.DROPBOX_CLIENT_SECRET);
}

export interface TokensDropbox {
  refreshToken: string | null;
  accessToken: string;
  expiresIn: number;
  email: string | null;
}

/** Troca o code do consentimento pelos tokens (callback do OAuth). */
export async function trocarCodigoDropbox(
  code: string,
  redirectUri: string,
): Promise<TokensDropbox | null> {
  const r = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: process.env.DROPBOX_CLIENT_ID ?? '',
      client_secret: process.env.DROPBOX_CLIENT_SECRET ?? '',
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  });
  if (!r.ok) return null;
  const dados = (await r.json()) as {
    refresh_token?: string;
    access_token?: string;
    expires_in?: number;
  };
  if (!dados.access_token) return null;
  // E-mail só para EXIBIÇÃO ("Dropbox conectado: fulano@…") — da própria API.
  let email: string | null = null;
  try {
    const conta = await fetch('https://api.dropboxapi.com/2/users/get_current_account', {
      method: 'POST',
      headers: { authorization: `Bearer ${dados.access_token}` },
    });
    if (conta.ok) {
      const info = (await conta.json()) as { email?: string };
      email = typeof info.email === 'string' ? info.email : null;
    }
  } catch {
    email = null;
  }
  return {
    refreshToken: dados.refresh_token ?? null,
    accessToken: dados.access_token,
    expiresIn: dados.expires_in ?? 14400,
    email,
  };
}

/**
 * Access token novo a partir do refresh token da conta.
 * null = falha temporária; 'revogado' = o usuário desfez a autorização no
 * Dropbox (a coluna deve ser limpa e a UI volta a oferecer a conexão).
 */
export async function novoAccessTokenDropbox(
  refreshToken: string,
): Promise<{ accessToken: string; expiresIn: number } | 'revogado' | null> {
  const r = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: process.env.DROPBOX_CLIENT_ID ?? '',
      client_secret: process.env.DROPBOX_CLIENT_SECRET ?? '',
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
  return { accessToken: dados.access_token, expiresIn: dados.expires_in ?? 14400 };
}

/**
 * Revoga a autorização no Dropbox (melhor-esforço — a coluna é limpa
 * sempre). A revogação é pelo ACCESS token e derruba o par inteiro.
 */
export async function revogarDropbox(refreshToken: string): Promise<void> {
  try {
    const r = await novoAccessTokenDropbox(refreshToken);
    if (!r || r === 'revogado') return;
    await fetch('https://api.dropboxapi.com/2/auth/token/revoke', {
      method: 'POST',
      headers: { authorization: `Bearer ${r.accessToken}` },
    });
  } catch {
    // sem rede/já revogado — segue
  }
}
