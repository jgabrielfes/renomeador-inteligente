"use client";

// Botão "Entrar/Cadastrar com o Google" + divisor "ou", no padrão das telas
// de convidado. O fluxo é o OAuth do NextAuth: redireciona para o Google e
// volta já logado (conta local criada/vinculada em lib/auth.ts).

import * as React from "react";
import { signIn } from "next-auth/react";

import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

// "G" oficial do Google (4 cores) — inline para não depender de rede.
function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="size-4">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18A10.97 10.97 0 0 0 1 12c0 1.78.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      />
    </svg>
  );
}

export function GoogleAuthButton({
  rotulo,
  callbackUrl,
}: {
  rotulo: string;
  callbackUrl: string;
}) {
  const [redirecionando, setRedirecionando] = React.useState(false);

  async function entrar() {
    setRedirecionando(true);
    try {
      // Redireciona a página inteira para o Google; o loading fica até sair.
      await signIn("google", { redirectTo: callbackUrl });
    } catch {
      setRedirecionando(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Separator className="flex-1" />
        <span className="text-xs text-muted-foreground">ou</span>
        <Separator className="flex-1" />
      </div>
      <Button
        type="button"
        variant="outline"
        size="lg"
        className="w-full"
        loading={redirecionando}
        onClick={entrar}
      >
        <GoogleIcon />
        {rotulo}
      </Button>
    </div>
  );
}
