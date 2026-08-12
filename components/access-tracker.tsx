"use client";

// Conta a ABERTURA de um módulo, não o login: monta no page.tsx de cada
// ferramenta e registra UMA vez por sessão do navegador (flag no
// sessionStorage). Ir e voltar entre módulos não infla a contagem — sair e
// abrir de novo em outra aba/dia conta como novo acesso.
// Melhor-esforço: falha em silêncio, nunca atrapalha o uso da ferramenta.

import * as React from "react";

import { registrarAcesso } from "@/app/(private)/acesso-actions";
import type { Modulo } from "@/lib/generated/prisma/enums";

export function AccessTracker({ modulo }: { modulo: Modulo }) {
  React.useEffect(() => {
    const chave = `acesso-${modulo}`;
    try {
      if (sessionStorage.getItem(chave)) return;
      // Marca ANTES de enviar: em modo estrito o efeito roda duas vezes, e
      // um segundo registro contaria acesso que não houve.
      sessionStorage.setItem(chave, "1");
    } catch {
      return; // sessionStorage bloqueado: não registra (evita contar demais)
    }
    void registrarAcesso(modulo);
  }, [modulo]);

  return null;
}
