import Link from "next/link";

import { GoogleAuthButton } from "@/components/google-auth-button";
import { LoginForm } from "@/components/login-form";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { IDENTIDADE } from "@/lib/app";
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
      {/* Sem link "voltar": `/` É a ferramenta e exige sessão — mandaria de
          volta para cá. */}
      <Card>
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">{IDENTIDADE.nome}</CardTitle>
          <CardDescription>
            Entre com sua conta para acessar a ferramenta.
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
