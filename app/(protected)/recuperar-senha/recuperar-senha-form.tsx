"use client";

// Formulário do "esqueci minha senha" (convenção: react-hook-form + zod,
// noValidate, Field/FieldError). Depois do envio a tela vira a confirmação
// NEUTRA — a resposta é a mesma exista ou não a conta (sem enumeração).

import * as React from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { MailCheck, Send } from "lucide-react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";

import { solicitarRedefinicaoDeSenha } from "./actions";

const esquema = z.object({
  email: z
    .string()
    .trim()
    .min(1, "Informe o e-mail da sua conta.")
    .pipe(z.email("Este e-mail não parece válido.")),
});
type Dados = z.infer<typeof esquema>;

export function RecuperarSenhaForm() {
  const [enviado, setEnviado] = React.useState(false);
  const form = useForm<Dados>({
    resolver: zodResolver(esquema),
    defaultValues: { email: "" },
  });
  const { errors, isSubmitting } = form.formState;

  if (enviado) {
    return (
      <div className="flex flex-col items-center gap-2 text-center text-sm">
        <MailCheck className="size-8 text-muted-foreground" />
        <p>
          Se houver uma conta com este e-mail, enviamos as instruções de
          redefinição. O link vale por <strong>1 hora</strong> — confira também
          a caixa de spam.
        </p>
      </div>
    );
  }

  return (
    <form
      noValidate
      onSubmit={form.handleSubmit(async (dados) => {
        const r = await solicitarRedefinicaoDeSenha(dados);
        if (!r.ok) {
          toast.error("Não foi possível enviar", {
            description:
              r.motivo === "indisponivel"
                ? "O envio de e-mails não está configurado — fale com a administração."
                : "Confira o e-mail digitado e tente de novo.",
          });
          return;
        }
        setEnviado(true);
      })}
    >
      <FieldGroup>
        <Field data-invalid={Boolean(errors.email)}>
          <FieldLabel htmlFor="email-recuperacao">E-mail</FieldLabel>
          <Input
            id="email-recuperacao"
            type="email"
            autoComplete="email"
            autoFocus
            aria-invalid={Boolean(errors.email)}
            {...form.register("email")}
          />
          <FieldError errors={[errors.email]} />
        </Field>
        <Button type="submit" className="w-full" size="lg" loading={isSubmitting}>
          <Send className="size-4" />
          Enviar link de redefinição
        </Button>
      </FieldGroup>
    </form>
  );
}
