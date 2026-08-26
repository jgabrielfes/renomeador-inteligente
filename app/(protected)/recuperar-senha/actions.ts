"use server";

// "ESQUECI MINHA SENHA" — redefinição por e-mail, com as mesmas cautelas do
// "perdi o link" do portal:
//
// - Resposta SEMPRE neutra ("se houver conta, enviamos"): server action é
//   endpoint público e não pode servir de oráculo de quem tem conta.
// - Token de USO ÚNICO com validade de 1 hora; no banco fica só o HASH
//   SHA-256 (vazamento da tabela não entrega link válido).
// - Env-gated pelo Resend (emailHabilitado) — sem a env, a página orienta a
//   falar com a administração e nada é enviado.
// - Conta criada pelo Google (passwordHash null) não ganha senha por aqui:
//   recebe um e-mail explicando que o acesso é pelo botão do Google.
// - A conta é POR SITE: tudo consulta o par (email, appComConta()).

import { createHash, randomBytes } from "node:crypto";
import { hash } from "bcryptjs";
import { headers } from "next/headers";
import { z } from "zod";

import { appComConta, IDENTIDADE } from "@/lib/app";
import { emailHabilitado, enviarEmailPortal } from "@/lib/portal/email";
import { prisma } from "@/lib/prisma";

const VALIDADE_MS = 60 * 60 * 1000; // 1 hora
const INTERVALO_REENVIO_MS = 60 * 1000; // no mínimo 1 min entre e-mails

const sha256 = (v: string) => createHash("sha256").update(v).digest("hex");

const RODAPE_EMAIL =
  "Aviso automático — não responda a este e-mail. Se você não pediu a redefinição, nenhuma ação é necessária: sua senha continua a mesma.";

/** Origem desta requisição (o link do e-mail tem de voltar PARA ESTE site). */
async function origemDaRequisicao(): Promise<string> {
  const h = await headers();
  const proto = h.get("x-forwarded-proto") ?? "https";
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "";
  return `${proto}://${host}`;
}

export type SolicitarResult = { ok: true } | { ok: false; motivo: "dados" | "indisponivel" };

/**
 * Passo 1: a pessoa informa o e-mail e, EXISTINDO conta neste site, recebe o
 * link de redefinição. O retorno não diz se a conta existe.
 */
export async function solicitarRedefinicaoDeSenha(input: unknown): Promise<SolicitarResult> {
  const parsed = z.object({ email: z.string().trim().min(1).pipe(z.email()) }).safeParse(input);
  if (!parsed.success) return { ok: false, motivo: "dados" };
  if (!emailHabilitado()) return { ok: false, motivo: "indisponivel" };

  const email = parsed.data.email.toLowerCase();
  try {
    const usuario = await prisma.user.findUnique({
      where: { email_app: { email, app: appComConta() } },
      select: { id: true, name: true, passwordHash: true },
    });
    // Conta inexistente: silêncio — a resposta é a mesma de quando existe.
    if (!usuario) return { ok: true };

    if (!usuario.passwordHash) {
      // Conta Google: não há senha para redefinir. O e-mail (que só o dono
      // recebe) explica o caminho certo em vez de deixar a pessoa no escuro.
      await enviarEmailPortal({
        para: email,
        assunto: `Sua conta em ${IDENTIDADE.nome} entra pelo Google`,
        titulo: "Esta conta não usa senha",
        paragrafos: [
          `Recebemos um pedido de redefinição de senha para esta conta em ${IDENTIDADE.nome} — mas ela foi criada com o login do Google e não tem senha própria.`,
          'Para entrar, use o botão "Entrar com o Google" na tela de login, com esta mesma conta de e-mail.',
        ],
        urlPortal: `${await origemDaRequisicao()}/login`,
        rotuloBotao: "Ir para o login",
        rodape: RODAPE_EMAIL,
      });
      return { ok: true };
    }

    // Anti-rajada: pedido repetido dentro de 1 min não dispara outro e-mail
    // (a resposta segue a mesma — quem pediu já tem o link na caixa).
    const recente = await prisma.passwordReset.findFirst({
      where: {
        userId: usuario.id,
        usadoEm: null,
        createdAt: { gt: new Date(Date.now() - INTERVALO_REENVIO_MS) },
      },
      select: { id: true },
    });
    if (recente) return { ok: true };

    // Um pedido vivo por vez: os anteriores não usados caem.
    const token = randomBytes(32).toString("hex");
    await prisma.$transaction([
      prisma.passwordReset.deleteMany({ where: { userId: usuario.id, usadoEm: null } }),
      prisma.passwordReset.create({
        data: {
          userId: usuario.id,
          tokenHash: sha256(token),
          expiraEm: new Date(Date.now() + VALIDADE_MS),
        },
      }),
    ]);

    await enviarEmailPortal({
      para: email,
      assunto: `Redefinição de senha — ${IDENTIDADE.nome}`,
      titulo: "Redefinir a sua senha",
      paragrafos: [
        `Olá, ${usuario.name}. Recebemos um pedido para redefinir a senha da sua conta em ${IDENTIDADE.nome}.`,
        "O botão abaixo vale por 1 hora e só pode ser usado uma vez.",
      ],
      urlPortal: `${await origemDaRequisicao()}/redefinir-senha/${token}`,
      rotuloBotao: "Redefinir minha senha",
      rodape: RODAPE_EMAIL,
    });
    return { ok: true };
  } catch {
    // Falha de banco/e-mail não vira oráculo: a resposta continua neutra.
    return { ok: true };
  }
}

export type RedefinirResult =
  | { ok: true }
  | { ok: false; motivo: "dados" | "token" | "banco" };

/**
 * Passo 2: com o token do e-mail, grava a senha nova. O uso do link prova a
 * posse do e-mail — de quebra, confirma o `emailVerified` de conta antiga.
 */
export async function redefinirSenha(input: unknown): Promise<RedefinirResult> {
  const parsed = z
    .object({
      token: z.string().trim().min(32).max(128),
      senha: z.string().min(8),
    })
    .safeParse(input);
  if (!parsed.success) return { ok: false, motivo: "dados" };

  try {
    const pedido = await prisma.passwordReset.findUnique({
      where: { tokenHash: sha256(parsed.data.token) },
      include: { user: { select: { id: true, app: true, emailVerified: true } } },
    });
    if (
      !pedido ||
      pedido.usadoEm !== null ||
      pedido.expiraEm < new Date() ||
      pedido.user.app !== appComConta()
    ) {
      return { ok: false, motivo: "token" };
    }

    await prisma.$transaction([
      prisma.user.update({
        where: { id: pedido.user.id },
        data: {
          passwordHash: await hash(parsed.data.senha, 12),
          ...(pedido.user.emailVerified ? {} : { emailVerified: new Date() }),
        },
      }),
      prisma.passwordReset.update({
        where: { id: pedido.id },
        data: { usadoEm: new Date() },
      }),
    ]);
    return { ok: true };
  } catch {
    return { ok: false, motivo: "banco" };
  }
}
