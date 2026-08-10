import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { ClearStaleSession } from "@/components/clear-stale-session";
import { GoogleAuthButton } from "@/components/google-auth-button";
import { SignupForm } from "@/components/signup-form";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { auth, googleHabilitado } from "@/lib/auth";

export default async function CadastroPage() {
  // Gate de convidado: só a validação REAL decide (cookie sozinho não é sessão).
  const session = await auth();
  if (session) redirect("/");

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
          <CardTitle className="text-2xl">Criar conta</CardTitle>
          <CardDescription>
            Sem confirmação de e-mail por enquanto — você já entra direto.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <SignupForm />
          {googleHabilitado() && (
            <GoogleAuthButton
              rotulo="Cadastrar com o Google"
              callbackUrl="/"
            />
          )}
          <p className="text-center text-sm text-muted-foreground">
            Já tem conta?{" "}
            <Link
              href="/login"
              className="underline underline-offset-2 hover:text-foreground"
            >
              Entrar
            </Link>
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
