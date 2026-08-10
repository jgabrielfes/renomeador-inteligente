// Autenticação das rotas /api/* — só roda no servidor (route handlers).
//
// Modelo: senha única de acesso (APP_PASSWORD) compartilhada com a equipe.
// Ao acertar a senha, o navegador recebe um cookie HttpOnly com um token
// assinado (HMAC-SHA256 via Web Crypto, sem dependências) e validade fixa.
// Sem o cookie válido, as rotas que chamam o Gemini respondem 401 — o que
// impede scripts anônimos de gerar custo/fila na API.
//
// Sem APP_PASSWORD definida a proteção fica DESLIGADA (comportamento atual,
// útil em desenvolvimento). A assinatura usa AUTH_SECRET se existir; senão é
// derivada da própria senha — trocar a senha invalida as sessões antigas.

import { cookies } from "next/headers";

export const SESSION_COOKIE = "renomeador_sessao";

// Validade da sessão: 30 dias (renovada a cada novo login).
const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

const encoder = new TextEncoder();

export function authEnabled(): boolean {
  return Boolean(process.env.APP_PASSWORD);
}

async function signingKey(): Promise<CryptoKey> {
  const secret =
    process.env.AUTH_SECRET ?? `renomeador:${process.env.APP_PASSWORD}`;
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(secret));
  return crypto.subtle.importKey(
    "raw",
    digest,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

function base64url(bytes: ArrayBuffer): string {
  return Buffer.from(bytes)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

async function signExpiry(exp: number): Promise<string> {
  const key = await signingKey();
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(`renomeador-sessao:v1:${exp}`)
  );
  return base64url(sig);
}

// Comparação em tempo constante: reduz os dois lados a digests de tamanho
// fixo, para não vazar tamanho nem prefixo da senha pelo tempo de resposta.
async function safeEqual(a: string, b: string): Promise<boolean> {
  const [da, db] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(a)),
    crypto.subtle.digest("SHA-256", encoder.encode(b)),
  ]);
  const va = new Uint8Array(da);
  const vb = new Uint8Array(db);
  let diff = 0;
  for (let i = 0; i < va.length; i++) diff |= va[i] ^ vb[i];
  return diff === 0;
}

export async function checkPassword(candidate: string): Promise<boolean> {
  const expected = process.env.APP_PASSWORD;
  if (!expected) return false;
  return safeEqual(candidate, expected);
}

// Token: "<expiração em segundos unix>.<assinatura base64url>".
export async function createSessionToken(): Promise<string> {
  const exp = Math.floor(Date.now() / 1000) + SESSION_MAX_AGE_SECONDS;
  return `${exp}.${await signExpiry(exp)}`;
}

export async function verifySessionToken(token: string): Promise<boolean> {
  const dot = token.indexOf(".");
  if (dot === -1) return false;
  const exp = Number(token.slice(0, dot));
  if (!Number.isInteger(exp) || exp <= Math.floor(Date.now() / 1000)) {
    return false;
  }
  return safeEqual(token.slice(dot + 1), await signExpiry(exp));
}

export async function setSessionCookie(token: string): Promise<void> {
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: SESSION_MAX_AGE_SECONDS,
    path: "/",
  });
}

export async function clearSessionCookie(): Promise<void> {
  (await cookies()).delete(SESSION_COOKIE);
}

export async function hasValidSession(): Promise<boolean> {
  if (!authEnabled()) return true;
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return token ? verifySessionToken(token) : false;
}

// Guard das rotas protegidas: null = liberado; Response = 401 pronto para
// devolver. O campo authRequired permite ao cliente distinguir de outros erros.
export async function requireSession(): Promise<Response | null> {
  if (await hasValidSession()) return null;
  return Response.json(
    {
      error:
        "Acesso não autorizado — recarregue a página e informe a senha de acesso.",
      authRequired: true,
    },
    { status: 401 }
  );
}
