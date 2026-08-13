// Rótulos das ferramentas na administração — o enum `Modulo` do Prisma é a
// fonte dos valores; aqui só o texto que o painel exibe.

import type { Modulo } from "@/lib/generated/prisma/enums";

// NOTAS saiu da plataforma (módulo descontinuado); o valor permanece no enum
// do banco pelos acessos históricos, mas não é mais listado nem registrado.
export const MODULOS: readonly Modulo[] = ["RENOMEADOR", "SUCESSORISTA"];

export const ROTULO_MODULO: Record<Modulo, string> = {
  RENOMEADOR: "Renomeador",
  NOTAS: "Resolvedor de notas (descontinuado)",
  SUCESSORISTA: "O Sucessorista",
};
