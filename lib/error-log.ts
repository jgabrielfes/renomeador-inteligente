// Registro de erros da plataforma (melhor-esforço: logar erro nunca pode
// causar outro erro). Guarda origem, mensagem truncada, status e o usuário
// logado no momento — null quando a pessoa estava deslogada.

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function registrarErro(dados: {
  origem: string;
  mensagem: string;
  status?: number;
}): Promise<void> {
  try {
    const session = await auth();
    await prisma.errorEvent.create({
      data: {
        origem: dados.origem.slice(0, 60),
        mensagem: dados.mensagem.slice(0, 500),
        status: dados.status ?? null,
        userId: session?.user?.id ?? null,
      },
    });
  } catch {
    // Sem banco (ou com falha nele), o log é descartado em silêncio.
  }
}
