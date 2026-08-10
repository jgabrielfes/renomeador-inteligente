"use client";

// Cadastro no padrão de formulários da plataforma (AGENTS.md):
// react-hook-form + zod, mensagens amigáveis, noValidate.

import * as React from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { signIn } from "next-auth/react";
import { UserPlus } from "lucide-react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { registerUser } from "@/app/cadastro/actions";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { useProgressRouter } from "@/components/navigation-progress";

const signupSchema = z
  .object({
    name: z.string().trim().min(2, "Informe seu nome."),
    email: z
      .string()
      .trim()
      .min(1, "Informe seu e-mail.")
      .pipe(z.email("Este e-mail não parece válido.")),
    password: z.string().min(8, "A senha precisa ter ao menos 8 caracteres."),
    confirm: z.string().min(1, "Repita a senha."),
  })
  .refine((data) => data.password === data.confirm, {
    path: ["confirm"],
    message: "As senhas não conferem.",
  });

type SignupData = z.infer<typeof signupSchema>;

export function SignupForm() {
  const router = useProgressRouter();
  const form = useForm<SignupData>({
    resolver: zodResolver(signupSchema),
    defaultValues: { name: "", email: "", password: "", confirm: "" },
  });
  const { errors, isSubmitting } = form.formState;

  async function onSubmit(data: SignupData) {
    const result = await registerUser({
      name: data.name,
      email: data.email,
      password: data.password,
    });
    if (!result.ok) {
      toast.error("Não foi possível criar a conta", {
        description: result.error,
      });
      return;
    }

    // Conta criada: entra direto (com "permanecer conectado").
    const login = await signIn("credentials", {
      email: data.email,
      password: data.password,
      remember: "true",
      redirect: false,
    });
    if (login?.error) {
      // Conta existe; se o login automático falhar, segue para a tela de login.
      router.push("/login");
      return;
    }
    router.push("/");
    router.refresh();
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} noValidate>
      <FieldGroup>
        <Field data-invalid={Boolean(errors.name)}>
          <FieldLabel htmlFor="name">Nome completo</FieldLabel>
          <Input
            id="name"
            autoComplete="name"
            autoFocus
            aria-invalid={Boolean(errors.name)}
            {...form.register("name")}
          />
          <FieldError errors={[errors.name]} />
        </Field>
        <Field data-invalid={Boolean(errors.email)}>
          <FieldLabel htmlFor="email">E-mail</FieldLabel>
          <Input
            id="email"
            type="email"
            autoComplete="email"
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
            autoComplete="new-password"
            aria-invalid={Boolean(errors.password)}
            {...form.register("password")}
          />
          <FieldError errors={[errors.password]} />
        </Field>
        <Field data-invalid={Boolean(errors.confirm)}>
          <FieldLabel htmlFor="confirm">Confirmar senha</FieldLabel>
          <Input
            id="confirm"
            type="password"
            autoComplete="new-password"
            aria-invalid={Boolean(errors.confirm)}
            {...form.register("confirm")}
          />
          <FieldError errors={[errors.confirm]} />
        </Field>
        <Button
          type="submit"
          className="w-full"
          size="lg"
          loading={isSubmitting}
        >
          <UserPlus className="size-4" />
          Criar conta
        </Button>
      </FieldGroup>
    </form>
  );
}
