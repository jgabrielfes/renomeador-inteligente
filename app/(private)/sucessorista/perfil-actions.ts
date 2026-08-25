"use server";

// Perfil de uso do Sucessorista VINCULADO À CONTA (users.perfilSucessorista):
// a conta comum escolhe UMA vez (primeiro acesso) e fica travada; MASTER
// circula pelos dois perfis sem gravar nada (o alternador é só da sessão).
//
// Server action é endpoint público — toda regra é validada AQUI, nunca só na
// UI. Falha de banco degrada com aviso (a escolha vale na sessão) — inclusive
// enquanto a migração `perfil_sucessorista_por_conta` não rodou no ambiente.

import { auth, isMaster } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { EH_SUCESSORISTA } from "@/lib/app";
import { UFS } from "@/lib/familias/tipos";
import { corrigirQuiz, type CorrecaoQuiz } from "@/lib/radar/quiz";

const PERFIS = ["ADVOGADO", "ESCREVENTE"] as const;
type PerfilConta = (typeof PERFIS)[number];

export async function salvarPerfilConta(
  perfil: string,
): Promise<{ ok: boolean; motivo?: string }> {
  if (!EH_SUCESSORISTA) return { ok: false, motivo: "plataforma" };
  const escolhido = PERFIS.find((p) => p === perfil);
  if (!escolhido) return { ok: false, motivo: "perfil-invalido" };

  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, motivo: "sem-sessao" };

  try {
    const usuario = await prisma.user.findUnique({
      where: { id: userId },
      select: { perfilSucessorista: true },
    });
    if (!usuario) return { ok: false, motivo: "sem-conta" };

    // Conta comum: a escolha é ÚNICA — só grava quando ainda não há perfil.
    // (Trocar depois é ato de administração; MASTER nem precisa gravar.)
    if (usuario.perfilSucessorista !== null && !isMaster(session)) {
      return usuario.perfilSucessorista === escolhido
        ? { ok: true }
        : { ok: false, motivo: "ja-escolhido" };
    }

    await prisma.user.update({
      where: { id: userId },
      data: { perfilSucessorista: escolhido as PerfilConta },
    });
    return { ok: true };
  } catch {
    // Banco fora (ou migração ainda não aplicada): degrada sem quebrar.
    return { ok: false, motivo: "banco" };
  }
}

/**
 * QUALIFICAÇÃO DO PRIMEIRO ACESSO — as etapas depois da escolha do perfil.
 *
 * O advogado se IDENTIFICA (nome completo + inscrição na OAB, que entra na
 * MESMA fila de verificação manual do /admin/radar) e faz o quiz
 * deontológico; o escrevente informa nome completo e a serventia onde
 * trabalha. Tudo aqui é da CONTA — por isso estas actions NÃO exigem
 * `radarAtivo()`: a identificação vale com o Radar ligado ou desligado
 * (diferente das actions do /radar, que são do produto).
 *
 * Toda validação no servidor (server action é endpoint público); falha de
 * banco degrada com motivo — o onboarding nunca trava a ferramenta.
 */


export async function salvarIdentificacaoAdvogado(entrada: {
  nomeCompleto: string;
  oab: string;
  uf: string;
}): Promise<{ ok: boolean; motivo?: string }> {
  if (!EH_SUCESSORISTA) return { ok: false, motivo: "plataforma" };
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, motivo: "sem-sessao" };

  const nome = String(entrada.nomeCompleto ?? "").trim().slice(0, 160);
  const numero = String(entrada.oab ?? "").trim().toUpperCase().slice(0, 20);
  const ufNorm = String(entrada.uf ?? "").trim().toUpperCase();
  if (nome.length < 5) return { ok: false, motivo: "nome" };
  if (!/^[0-9.\-A-Z/]{2,20}$/.test(numero)) return { ok: false, motivo: "oab" };
  if (!(UFS as readonly string[]).includes(ufNorm)) return { ok: false, motivo: "uf" };

  try {
    // Inscrição já VERIFICADA não é sobrescrita pelo onboarding (mesma regra
    // do /radar: alterar depois de aprovada é ato de administração).
    const atual = await prisma.advogadoPerfil.findUnique({ where: { userId } });
    if (atual && (atual.situacao === "aprovado" || atual.situacao === "suspenso")) {
      await prisma.user.update({ where: { id: userId }, data: { name: nome } });
      return { ok: true };
    }
    await prisma.$transaction([
      prisma.user.update({ where: { id: userId }, data: { name: nome } }),
      prisma.advogadoPerfil.upsert({
        where: { userId },
        update: { oab: numero, oabUf: ufNorm, situacao: "pendente", motivoRecusa: null },
        create: { userId, oab: numero, oabUf: ufNorm },
      }),
    ]);
    return { ok: true };
  } catch {
    return { ok: false, motivo: "banco" };
  }
}

export async function salvarIdentificacaoEscrevente(entrada: {
  nomeCompleto: string;
  serventia: string;
}): Promise<{ ok: boolean; motivo?: string }> {
  if (!EH_SUCESSORISTA) return { ok: false, motivo: "plataforma" };
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, motivo: "sem-sessao" };

  const nome = String(entrada.nomeCompleto ?? "").trim().slice(0, 160);
  const serventia = String(entrada.serventia ?? "").trim().slice(0, 200);
  if (nome.length < 5) return { ok: false, motivo: "nome" };
  if (serventia.length < 3) return { ok: false, motivo: "serventia" };

  try {
    await prisma.user.update({ where: { id: userId }, data: { name: nome, serventia } });
    return { ok: true };
  } catch {
    return { ok: false, motivo: "banco" };
  }
}

/**
 * Quiz deontológico no ONBOARDING — mesma correção do /radar
 * (`corrigirQuiz`), gravando `quizAprovadoEm` no perfil recém-criado.
 */
export async function responderQuizConta(
  respostas: Record<string, number>,
): Promise<{ ok: boolean; motivo?: string; correcao?: CorrecaoQuiz }> {
  if (!EH_SUCESSORISTA) return { ok: false, motivo: "plataforma" };
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, motivo: "sem-sessao" };
  const correcao = corrigirQuiz(respostas);
  try {
    if (correcao.aprovado) {
      await prisma.advogadoPerfil.update({
        where: { userId },
        data: { quizAprovadoEm: new Date() },
      });
    }
    return { ok: true, correcao };
  } catch {
    // Sem AdvogadoPerfil (identificação pulada): o quiz não tem onde gravar.
    return { ok: false, motivo: "sem-inscricao" };
  }
}
