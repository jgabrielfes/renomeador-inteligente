"use client";

// Remove cookie de sessão MORTO (assinatura inválida, sessão expirada pelo
// prazo do token, usuário apagado do banco…). Server component não pode
// apagar cookie, então a página renderiza este componente quando detecta
// "cookie presente + sessão inválida" e o signOut do NextAuth (que roda numa
// rota, onde pode escrever cookies) faz a limpeza — sem redirect.

import * as React from "react";
import { signOut } from "next-auth/react";

export function ClearStaleSession() {
  React.useEffect(() => {
    void signOut({ redirect: false });
  }, []);

  return null;
}
