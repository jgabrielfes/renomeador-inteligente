/**
 * Gravação do registro de atendimento — SÓ SERVIDOR (rotas do portal e
 * server actions; importa o Prisma, que não pode entrar no bundle do
 * cliente). Tipos e rótulos vivem em `./eventos`, importável dos dois lados.
 *
 * Melhor-esforço: falha de banco não derruba a ação que originou o evento.
 */

import { prisma } from '@/lib/prisma';
import type { DetalheEventoPortal, TipoEventoPortal } from './eventos';

export async function registrarEventoPortal(
  casoId: string,
  tipo: TipoEventoPortal,
  detalhe?: DetalheEventoPortal,
  token?: string,
): Promise<void> {
  try {
    await prisma.portalEvento.create({
      data: {
        casoId,
        tipo,
        token: token ?? null,
        detalhe: detalhe ? (JSON.parse(JSON.stringify(detalhe)) as object) : undefined,
      },
    });
  } catch {
    // melhor-esforço — o registro nunca derruba a ação que o originou
  }
}
