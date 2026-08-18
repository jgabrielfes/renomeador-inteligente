// Rótulos das ferramentas na administração — o enum `Modulo` do Prisma é a
// fonte dos valores; aqui só o texto que o painel exibe.

import type { Modulo } from "@/lib/generated/prisma/enums";

export const MODULOS: readonly Modulo[] = ["RENOMEADOR", "NOTAS", "SUCESSORISTA"];

export const ROTULO_MODULO: Record<Modulo, string> = {
  RENOMEADOR: "Renomeador",
  NOTAS: "Resolvedor de notas",
  SUCESSORISTA: "O Sucessorista",
};
