// Grupo (protected): rotas de convidado (login/cadastro) — só acessíveis
// DESLOGADO. Com sessão válida, volta ao painel. Cookie presente mas sessão
// inválida (banco resetado, prazo vencido…) é removido pelo ClearStaleSession.
// Nunca gatear por presença de cookie — só a validação real do auth().

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { ClearStaleSession } from "@/components/clear-stale-session";
import { auth } from "@/lib/auth";

export default async function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (session) redirect("/");

  const jar = await cookies();
  const cookieMorto =
    jar.has("authjs.session-token") || jar.has("__Secure-authjs.session-token");

  return (
    <>
      {cookieMorto && <ClearStaleSession />}
      {children}
    </>
  );
}
