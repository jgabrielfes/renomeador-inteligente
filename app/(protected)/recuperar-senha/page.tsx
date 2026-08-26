import Link from "next/link";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { IDENTIDADE } from "@/lib/app";
import { emailHabilitado } from "@/lib/portal/email";

import { RecuperarSenhaForm } from "./recuperar-senha-form";

// "Esqueci minha senha" — só para quem está DESLOGADO (gate no layout do
// grupo). Env-gated pelo Resend: sem e-mail configurado a página orienta a
// falar com a administração, no mesmo espírito do /portal ("perdi o link").
export default function RecuperarSenhaPage() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-4 px-4 py-10">
      <Card>
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">Esqueci minha senha</CardTitle>
          <CardDescription>
            Informe o e-mail da sua conta em {IDENTIDADE.nome} — enviaremos um
            link para você criar uma senha nova.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {emailHabilitado() ? (
            <RecuperarSenhaForm />
          ) : (
            <p className="text-sm text-muted-foreground">
              O envio de e-mails não está configurado neste ambiente. Fale com a
              administração da plataforma para redefinir a sua senha.
            </p>
          )}
          <p className="text-center text-sm text-muted-foreground">
            Lembrou a senha?{" "}
            <Link
              href="/login"
              className="underline underline-offset-2 hover:text-foreground"
            >
              Voltar ao login
            </Link>
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
