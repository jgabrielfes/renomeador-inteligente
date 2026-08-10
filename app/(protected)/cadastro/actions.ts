"use server";

// Criação de conta pela plataforma. Sem confirmação de e-mail por enquanto —
// a conta nasce com emailVerified = null e a UI marca "e-mail não confirmado".
// A validação repete o schema do cliente: nunca confiar só no formulário.

import { hash } from "bcryptjs";
import { z } from "zod";

import { prisma } from "@/lib/prisma";

const registerSchema = z.object({
  name: z.string().trim().min(2, "Informe seu nome."),
  email: z.string().trim().min(1).pipe(z.email()),
  password: z.string().min(8),
});

export type RegisterResult = { ok: true } | { ok: false; error: string };

export async function registerUser(input: unknown): Promise<RegisterResult> {
  const parsed = registerSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Dados inválidos — confira os campos." };
  }

  const email = parsed.data.email.toLowerCase();
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return { ok: false, error: "Já existe uma conta com este e-mail." };
  }

  await prisma.user.create({
    data: {
      name: parsed.data.name,
      email,
      passwordHash: await hash(parsed.data.password, 12),
      role: "USER",
    },
  });

  return { ok: true };
}
