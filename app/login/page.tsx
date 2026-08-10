import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { ClearStaleSession } from "@/components/clear-stale-session";
import { GoogleAuthButton } from "@/components/google-auth-button";
import { LoginForm } from "@/components/login-form";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { auth, googleHabilitado } from "@/lib/auth";

export default async function LoginPage({
  searchParams,
}: PageProps<"/login">) {
  // Gate de convidado: só a validação REAL decide (o cookie sozinho não é
  // sessão — pode estar morto após reset do banco, expiração etc.).
  const session = await auth();
  const { callbackUrl } = await searchParams;
  const destino =
    typeof callbackUrl === "string" && callbackUrl.startsWith("/")
      ? callbackUrl
      : "/";

  if (session) redirect(destino);

  // Sessão inválida com cookie presente: remove o cookie morto.
  const jar = await cookies();
  const cookieMorto =
    jar.has("authjs.session-token") || jar.has("__Secure-authjs.session-token");

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-4 px-4 py-10">
      {cookieMorto && <ClearStaleSession />}
      <Link
        href="/"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Voltar para as ferramentas
      </Link>
      <Card>
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">Ferramentas</CardTitle>
          <CardDescription>
            Entre com sua conta para acessar a plataforma.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <LoginForm callbackUrl={destino} />
          {googleHabilitado() && (
            <GoogleAuthButton
              rotulo="Entrar com o Google"
              callbackUrl={destino}
            />
          )}
          <p className="text-center text-sm text-muted-foreground">
            Não tem conta?{" "}
            <Link
              href="/cadastro"
              className="underline underline-offset-2 hover:text-foreground"
            >
              Criar conta
            </Link>
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
