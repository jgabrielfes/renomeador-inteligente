import Link from "next/link";

import { GoogleAuthButton } from "@/components/google-auth-button";
import { SignupForm } from "@/components/signup-form";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { IDENTIDADE } from "@/lib/app";
import { googleHabilitado } from "@/lib/auth";

export default function CadastroPage() {
  // Gate de convidado e limpeza de cookie morto: no layout do grupo (protected).
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-4 px-4 py-10">
      {/* Sem link "voltar": `/` É a ferramenta e exige sessão. */}
      <Card>
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">Criar conta</CardTitle>
          <CardDescription>
            A conta vale para o {IDENTIDADE.nome}. Sem confirmação de e-mail por
            enquanto — você já entra direto.
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
