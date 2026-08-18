"use server";

// Acessos aos módulos: uma linha por ABERTURA de módulo numa sessão de
// navegador (o cliente garante o "uma vez por sessão" — components/
// access-tracker.tsx). Mede uso real da ferramenta, não login.
// Privacidade: só usuário + módulo + data. Nada de conteúdo, nome de arquivo,
// URL completa ou identificador de dispositivo.

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { Modulo } from "@/lib/generated/prisma/enums";

const MODULOS: Modulo[] = ["RENOMEADOR", "NOTAS", "SUCESSORISTA"];

export async function registrarAcesso(modulo: Modulo): Promise<void> {
  try {
    if (!MODULOS.includes(modulo)) return;
    const session = await auth();
    if (!session?.user?.id) return; // módulos são privados: sem sessão, sem registro
    await prisma.moduleAccess.create({
      data: { modulo, userId: session.user.id },
    });
  } catch {
    // telemetria é melhor-esforço
  }
}
