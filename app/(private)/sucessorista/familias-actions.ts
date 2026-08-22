"use server";

// Handoff "Para famílias" → Sucessorista: o advogado troca o CÓDIGO recebido
// da família pelo intake e o CASO NASCE NO NAVEGADOR DELE (intakeParaCaso —
// local-first; o servidor nunca monta caso). Confirmada a importação, o
// intake é PODADO: respostas e resultado são apagados; fica só o histórico
// da solicitação e do aceite (retenção mínima — LGPD).

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { EH_SUCESSORISTA } from "@/lib/app";
import { sanitizarRespostas } from "@/lib/familias/sanitizar";
import type { RespostasFamilia } from "@/lib/familias/tipos";

/**
 * PRIMEIRO passo do advogado: troca o código pelas respostas do questionário.
 * Marca quem importou e quando; o código continua trocável até a CONFIRMAÇÃO
 * (se o navegador falhar no meio, dá para tentar de novo).
 */
export async function resgatarIntake(codigo: string): Promise<{
  ok: boolean;
  respostas?: RespostasFamilia;
  nome?: string | null;
  email?: string | null;
  erro?: string;
}> {
  if (!EH_SUCESSORISTA) return { ok: false, erro: "Recurso de outro site." };
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, erro: "Sessão expirada — entre de novo." };
  const cod = String(codigo ?? "").trim().toUpperCase().slice(0, 20);
  if (!cod) return { ok: false, erro: "Informe o código recebido da família." };

  try {
    const handoff = await prisma.intakeHandoff.findUnique({ where: { codigo: cod } });
    if (!handoff) return { ok: false, erro: "Código não encontrado — confira com a família." };
    if (handoff.confirmadoEm) {
      return { ok: false, erro: "Este código já foi usado — peça um novo à família." };
    }
    const intake = await prisma.familiaIntake.findUnique({ where: { id: handoff.intakeId } });
    if (
      !intake ||
      intake.status === "retirado" ||
      intake.status === "expirado" ||
      intake.expiraEm < new Date()
    ) {
      return { ok: false, erro: "A solicitação da família não está mais disponível." };
    }
    const respostas = sanitizarRespostas(intake.respostas);
    if (!respostas) return { ok: false, erro: "A solicitação está sem os dados mínimos." };

    await prisma.intakeHandoff.update({
      where: { id: handoff.id },
      data: { advogadoUserId: userId, importadoEm: new Date() },
    });
    return { ok: true, respostas, nome: intake.nome, email: intake.email };
  } catch {
    return { ok: false, erro: "Falha ao resgatar o código — tente novamente." };
  }
}

/**
 * SEGUNDO passo, depois que o caso foi criado e salvo no navegador: PODA o
 * intake no servidor (respostas/resultado apagados) e trava o código.
 */
export async function confirmarImportacaoIntake(
  codigo: string,
): Promise<{ ok: boolean; erro?: string }> {
  if (!EH_SUCESSORISTA) return { ok: false, erro: "Recurso de outro site." };
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, erro: "Sessão expirada — entre de novo." };
  const cod = String(codigo ?? "").trim().toUpperCase().slice(0, 20);

  try {
    const handoff = await prisma.intakeHandoff.findUnique({ where: { codigo: cod } });
    if (!handoff || handoff.advogadoUserId !== userId) {
      return { ok: false, erro: "Código não encontrado para esta conta." };
    }
    if (handoff.confirmadoEm) return { ok: true };
    await prisma.$transaction([
      prisma.intakeHandoff.update({
        where: { id: handoff.id },
        data: { confirmadoEm: new Date() },
      }),
      // Poda: os dados do espólio saem do servidor; ficam nome/e-mail (o
      // contato que a família deixou) e o histórico da solicitação.
      prisma.familiaIntake.update({
        where: { id: handoff.intakeId },
        data: { respostas: {}, resultado: {}, status: "contratado" },
      }),
    ]);
    return { ok: true };
  } catch {
    return { ok: false, erro: "Falha ao confirmar — tente novamente." };
  }
}
