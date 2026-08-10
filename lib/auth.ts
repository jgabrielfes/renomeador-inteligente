// NextAuth (v5) com login por credenciais e sessão JWT — sem tabelas de
// sessão no banco; só a tabela de usuários (prisma/schema.prisma).
//
// - O papel (USER/MASTER) viaja no token e chega em session.user.role.
// - "Permanecer conectado" (checkbox do login) define o tempo de vida REAL da
//   sessão: o cookie dura até 30 dias, mas o token carrega o próprio prazo
//   (sessionExpires) — sem o "permanecer", expira em 8 horas e o jwt callback
//   invalida a sessão devolvendo null.
// - emailVerified (booleano) marca na UI as contas com e-mail não confirmado.

import { compare } from "bcryptjs";
import NextAuth, { type NextAuthConfig } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";

import { prisma } from "@/lib/prisma";
import type { Role } from "@/lib/generated/prisma/enums";

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
const EIGHT_HOURS_MS = 8 * 60 * 60 * 1000;

/** Login com Google é opcional: só entra quando as envs existem. */
export function googleHabilitado(): boolean {
  return Boolean(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET);
}

const providers: NextAuthConfig["providers"] = [];
if (googleHabilitado()) providers.push(Google);

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60, // teto do cookie; o prazo real vai no token
  },
  pages: { signIn: "/login" },
  providers: [
    ...providers,
    Credentials({
      credentials: {
        email: { label: "E-mail", type: "email" },
        password: { label: "Senha", type: "password" },
        remember: { label: "Permanecer conectado", type: "text" },
      },
      authorize: async (credentials) => {
        const email = String(credentials?.email ?? "")
          .trim()
          .toLowerCase();
        const password = String(credentials?.password ?? "");
        if (!email || !password) return null;

        const user = await prisma.user.findUnique({ where: { email } });
        if (!user) return null;
        // Conta criada via Google não tem senha: só entra pelo OAuth.
        if (!user.passwordHash) return null;

        const valid = await compare(password, user.passwordHash);
        if (!valid) return null;

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          emailConfirmed: user.emailVerified !== null,
          remember: String(credentials?.remember) !== "false",
        };
      },
    }),
  ],
  callbacks: {
    // Google: cria/atualiza a conta local no primeiro acesso. Só aceita
    // e-mail que o Google atesta como verificado — vincular conta existente
    // por e-mail não verificado seria brecha de sequestro de conta.
    async signIn({ account, profile }) {
      if (account?.provider !== "google") return true;
      const email = profile?.email?.toLowerCase();
      const verificado =
        (profile as { email_verified?: boolean } | null)?.email_verified;
      if (!email || verificado !== true) return false;
      await prisma.user.upsert({
        where: { email },
        // Conta já existente: marca o e-mail como confirmado (o Google atesta).
        update: { emailVerified: new Date() },
        create: {
          email,
          name: profile?.name ?? email,
          emailVerified: new Date(),
          role: "USER",
        },
      });
      return true;
    },
    async jwt({ token, user, account }) {
      // `user` só existe no login; nas demais requisições o token já carrega.
      if (user) {
        if (account?.provider === "google") {
          // O id do `user` aqui é o do perfil Google — o que vale é o NOSSO.
          const local = await prisma.user.findUnique({
            where: { email: String(user.email).toLowerCase() },
            select: { id: true },
          });
          if (!local) return null;
          token.id = local.id;
        } else {
          token.id = user.id;
        }
        const remember = (user as { remember?: boolean }).remember !== false;
        token.sessionExpires =
          Date.now() + (remember ? THIRTY_DAYS_MS : EIGHT_HOURS_MS);
      }
      // Prazo escolhido no login venceu: invalida a sessão.
      if (
        typeof token.sessionExpires === "number" &&
        Date.now() > token.sessionExpires
      ) {
        return null;
      }
      // SEGURANÇA: o token NUNCA é fonte de verdade para identidade/papel.
      // Em toda requisição o usuário é revalidado no banco — conta apagada
      // derruba a sessão na hora, e papel alterado (ex.: revogar master)
      // vale na requisição seguinte. Falha de banco = sessão negada
      // (fail-closed): a plataforma continua utilizável deslogada.
      if (typeof token.id !== "string") return null;
      try {
        const atual = await prisma.user.findUnique({
          where: { id: token.id },
          select: { role: true, emailVerified: true },
        });
        if (!atual) return null;
        token.role = atual.role;
        token.emailConfirmed = atual.emailVerified !== null;
      } catch {
        return null;
      }
      return token;
    },
    session({ session, token }) {
      if (token.id) session.user.id = token.id as string;
      session.user.role = (token.role as Role | undefined) ?? "USER";
      session.user.emailConfirmed = token.emailConfirmed === true;
      return session;
    },
  },
});

/** Telas/ações exclusivas de administrador. */
export function isMaster(
  session: { user?: { role?: Role } } | null | undefined
): boolean {
  return session?.user?.role === "MASTER";
}

/**
 * Gate de página/ação de administração: devolve a sessão de um MASTER ou
 * responde 404 — para quem não é master, a rota de administração "não
 * existe" (não revelar a superfície é parte da segurança). Usar no topo de
 * toda página/server action /admin.
 */
export async function requireMaster() {
  const { notFound } = await import("next/navigation");
  const session = await auth();
  if (!isMaster(session)) notFound();
  return session!;
}

/**
 * Gate das páginas privadas (grupo `(private)`): devolve a sessão ou manda
 * para o login levando o caminho desejado — ao entrar, a pessoa volta direto
 * para onde queria ir. Cada página passa o próprio caminho (layout não sabe
 * a URL da requisição).
 */
export async function requireSession(caminhoDeVolta: string) {
  const { redirect } = await import("next/navigation");
  const session = await auth();
  if (!session) {
    redirect(`/login?callbackUrl=${encodeURIComponent(caminhoDeVolta)}`);
  }
  return session!;
}
