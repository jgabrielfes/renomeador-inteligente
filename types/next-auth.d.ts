// Estende os tipos do NextAuth com papel de acesso e estado do e-mail.

import type { DefaultSession } from "next-auth";

import type { Role } from "@/lib/generated/prisma/enums";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: Role;
      /** false = conta criada sem confirmação de e-mail (a UI marca). */
      emailConfirmed: boolean;
    } & DefaultSession["user"];
  }

  interface User {
    role: Role;
    /** Espelho booleano de users.emailVerified (o campo Date fica no banco). */
    emailConfirmed?: boolean;
    /** Vem do checkbox "permanecer conectado" do login. */
    remember?: boolean;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
    role?: Role;
    emailConfirmed?: boolean;
    /** Prazo real da sessão (ms epoch), definido no login. */
    sessionExpires?: number;
  }
}
