"use client";

// Padrão de formulários da plataforma (ver AGENTS.md): react-hook-form + zod,
// mensagens de erro amigáveis via <FieldError>, e `noValidate` no <form> para
// o navegador não exibir os balões nativos ("Preencha este campo").

import * as React from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { signIn } from "next-auth/react";
import { LogIn } from "lucide-react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { useProgressRouter } from "@/components/navigation-progress";

const loginSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, "Informe seu e-mail.")
    .pipe(z.email("Este e-mail não parece válido.")),
  password: z.string().min(1, "Informe sua senha."),
  remember: z.boolean(),
});

type LoginData = z.infer<typeof loginSchema>;

export function LoginForm({ callbackUrl }: { callbackUrl: string }) {
  const router = useProgressRouter();
  const form = useForm<LoginData>({
    resolver: zodResolver(loginSchema),
    // "Permanecer conectado" vem marcado por padrão.
    defaultValues: { email: "", password: "", remember: true },
  });
  const { errors, isSubmitting } = form.formState;

  async function onSubmit(data: LoginData) {
    const result = await signIn("credentials", {
      email: data.email,
      password: data.password,
      // Vai como string para o provider de credenciais; controla o prazo real
      // da sessão em lib/auth.ts (30 dias × 8 horas).
      remember: String(data.remember),
      redirect: false,
    });
    if (result?.error) {
      toast.error("Não foi possível entrar", {
        description: "E-mail ou senha incorretos.",
      });
      return;
    }
    // useProgressRouter: redirecionamento programático mostra a barra de
    // progresso no topo (convenção do AGENTS.md).
    router.push(callbackUrl);
    router.refresh();
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} noValidate>
      <FieldGroup>
        <Field data-invalid={Boolean(errors.email)}>
          <FieldLabel htmlFor="email">E-mail</FieldLabel>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            autoFocus
            aria-invalid={Boolean(errors.email)}
            {...form.register("email")}
          />
          <FieldError errors={[errors.email]} />
        </Field>
        <Field data-invalid={Boolean(errors.password)}>
          <FieldLabel htmlFor="password">Senha</FieldLabel>
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            aria-invalid={Boolean(errors.password)}
            {...form.register("password")}
          />
          <FieldError errors={[errors.password]} />
        </Field>
        {/* Checkbox do Base UI não é input nativo: entra via Controller. */}
        <Controller
          control={form.control}
          name="remember"
          render={({ field }) => (
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={field.value}
                onCheckedChange={(checked) => field.onChange(checked === true)}
              />
              Permanecer conectado
            </label>
          )}
        />
        <Button
          type="submit"
          className="w-full"
          size="lg"
          loading={isSubmitting}
        >
          <LogIn className="size-4" />
          Entrar
        </Button>
      </FieldGroup>
    </form>
  );
}
