"use client";

// Grava a senha nova com o token do e-mail. Convenção de formulários
// (react-hook-form + zod, noValidate); token inválido/vencido mostra o
// caminho de pedir outro link em vez de um beco sem saída.

import * as React from "react";
import Link from "next/link";
import { zodResolver } from "@hookform/resolvers/zod";
import { KeyRound } from "lucide-react";
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
import { useProgressRouter } from "@/components/navigation-progress";

import { redefinirSenha } from "../../recuperar-senha/actions";

const esquema = z
  .object({
    senha: z.string().min(8, "A senha precisa de pelo menos 8 caracteres."),
    confirmacao: z.string().min(1, "Repita a senha nova."),
  })
  .refine((d) => d.senha === d.confirmacao, {
    path: ["confirmacao"],
    message: "As senhas não conferem.",
  });
type Dados = z.infer<typeof esquema>;

export function RedefinirSenhaForm({ token }: { token: string }) {
  const router = useProgressRouter();
  const [tokenInvalido, setTokenInvalido] = React.useState(false);
  const form = useForm<Dados>({
    resolver: zodResolver(esquema),
    defaultValues: { senha: "", confirmacao: "" },
  });
  const { errors, isSubmitting } = form.formState;

  if (tokenInvalido) {
    return (
      <div className="space-y-2 text-center text-sm">
        <p>
          Este link de redefinição <strong>não é mais válido</strong> — ele
          expira em 1 hora e só pode ser usado uma vez.
        </p>
        <p>
          <Link
            href="/recuperar-senha"
            className="underline underline-offset-2 hover:text-foreground"
          >
            Pedir um link novo
          </Link>
        </p>
      </div>
    );
  }

  return (
    <form
      noValidate
      onSubmit={form.handleSubmit(async (dados) => {
        const r = await redefinirSenha({ token, senha: dados.senha });
        if (!r.ok) {
          if (r.motivo === "token") {
            setTokenInvalido(true);
            return;
          }
          toast.error("Não foi possível redefinir a senha", {
            description: "Tente de novo em instantes.",
          });
          return;
        }
        toast.success("Senha redefinida", {
          description: "Entre com a senha nova.",
        });
        router.push("/login");
      })}
    >
      <FieldGroup>
        <Field data-invalid={Boolean(errors.senha)}>
          <FieldLabel htmlFor="senha-nova">Senha nova</FieldLabel>
          <Input
            id="senha-nova"
            type="password"
            autoComplete="new-password"
            autoFocus
            aria-invalid={Boolean(errors.senha)}
            {...form.register("senha")}
          />
          <FieldError errors={[errors.senha]} />
        </Field>
        <Field data-invalid={Boolean(errors.confirmacao)}>
          <FieldLabel htmlFor="senha-confirmacao">Repita a senha nova</FieldLabel>
          <Input
            id="senha-confirmacao"
            type="password"
            autoComplete="new-password"
            aria-invalid={Boolean(errors.confirmacao)}
            {...form.register("confirmacao")}
          />
          <FieldError errors={[errors.confirmacao]} />
        </Field>
        <Button type="submit" className="w-full" size="lg" loading={isSubmitting}>
          <KeyRound className="size-4" />
          Salvar senha nova
        </Button>
      </FieldGroup>
    </form>
  );
}
