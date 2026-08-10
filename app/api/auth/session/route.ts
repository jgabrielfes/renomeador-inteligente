// /api/auth/session — sessão de acesso do app.
//
//   GET    → status: a proteção está ativa? esta sessão está autenticada?
//   POST   → login: { password } certo grava o cookie de sessão (HttpOnly).
//   DELETE → logout: apaga o cookie.
//
// O login tem rate limit próprio, mais apertado, para frear força bruta.

import {
  authEnabled,
  checkPassword,
  clearSessionCookie,
  createSessionToken,
  hasValidSession,
  setSessionCookie,
} from "@/lib/auth";
import { clientIp, rateLimit, rateLimitResponse } from "@/lib/rate-limit";

const LOGIN_ATTEMPTS_PER_MINUTE = 5;

export async function GET() {
  return Response.json({
    authRequired: authEnabled(),
    authenticated: await hasValidSession(),
  });
}

export async function POST(request: Request) {
  if (!authEnabled()) {
    return Response.json({ authRequired: false, authenticated: true });
  }

  const limited = rateLimit(
    "login",
    clientIp(request),
    LOGIN_ATTEMPTS_PER_MINUTE,
    60_000
  );
  if (!limited.ok) return rateLimitResponse(limited);

  let password: unknown;
  try {
    ({ password } = await request.json());
  } catch {
    return Response.json(
      { error: "Corpo inválido: esperado JSON { password }." },
      { status: 400 }
    );
  }
  if (typeof password !== "string" || !(await checkPassword(password))) {
    return Response.json({ error: "Senha incorreta." }, { status: 401 });
  }

  await setSessionCookie(await createSessionToken());
  return Response.json({ authRequired: true, authenticated: true });
}

export async function DELETE() {
  await clearSessionCookie();
  return Response.json({ authenticated: false });
}
