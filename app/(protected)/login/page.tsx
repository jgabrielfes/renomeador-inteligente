import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { GoogleAuthButton } from "@/components/google-auth-button";
import { LoginForm } from "@/components/login-form";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { googleHabilitado } from "@/lib/auth";

export default async function LoginPage({
  searchParams,
}: PageProps<"/login">) {
  // Gate de convidado no layout do grupo (protected); aqui só o destino.
  const { callbackUrl } = await searchParams;
  const destino =
    typeof callbackUrl === "string" && callbackUrl.startsWith("/")
      ? callbackUrl
      : "/";

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-4 px-4 py-10">
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
