"use server";

// EQUIPES de trabalho — server actions com TODA a validação no servidor
// (server action é endpoint público; botão escondido não protege nada):
//   * criar equipe: qualquer conta SEM equipe vira CHEFE da sua;
//   * gerar código de convite: SÓ o chefe;
//   * entrar com código: conta sem equipe + código válido e não usado —
//     vira MEMBRO e herda o perfil do chefe quando ainda não escolheu;
//   * remover membro / renomear / excluir a equipe: SÓ o chefe;
//   * sair: só o MEMBRO (o chefe exclui a equipe quando for o único).
//
// Falha de banco (ou migração `equipes_de_trabalho` pendente) devolve erro
// amigável — nunca quebra o módulo.

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { EH_SUCESSORISTA, appComConta } from "@/lib/app";

export interface MembroEquipe {
  id: string;
  nome: string;
  email: string;
  papel: "CHEFE" | "MEMBRO";
  /** Entrou por convite de ACESSO TOTAL (enxerga a nuvem de casos). */
  acessoCasos: boolean;
}

export interface InfoEquipe {
  id: string;
  nome: string;
  /** Papel de QUEM consulta. */
  papel: "CHEFE" | "MEMBRO";
  /** QUEM consulta enxerga a nuvem de casos (chefe sempre; membro só com convite de acesso total). */
  meuAcessoCasos: boolean;
  membros: MembroEquipe[];
}

type Resultado<T> = { ok: true; dados: T } | { ok: false; erro: string };

async function usuarioDaSessao() {
  const session = await auth();
  const id = session?.user?.id;
  if (!id) return null;
  return prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      equipeId: true,
      papelEquipe: true,
      perfilSucessorista: true,
      acessoCasosEquipe: true,
    },
  });
}

async function montarInfo(
  equipeId: string,
  papel: "CHEFE" | "MEMBRO",
  meuAcessoCasos: boolean,
): Promise<InfoEquipe | null> {
  const equipe = await prisma.equipe.findUnique({
    where: { id: equipeId },
    select: {
      id: true,
      nome: true,
      membros: {
        select: { id: true, name: true, email: true, papelEquipe: true, acessoCasosEquipe: true },
        orderBy: { createdAt: "asc" },
      },
    },
  });
  if (!equipe) return null;
  return {
    id: equipe.id,
    nome: equipe.nome,
    papel,
    meuAcessoCasos: papel === "CHEFE" || meuAcessoCasos,
    membros: equipe.membros.map((m) => ({
      id: m.id,
      nome: m.name,
      email: m.email,
      papel: m.papelEquipe === "CHEFE" ? "CHEFE" : "MEMBRO",
      acessoCasos: m.papelEquipe === "CHEFE" || m.acessoCasosEquipe,
    })),
  };
}

/** A equipe da conta logada (null = sem equipe). Melhor-esforço. */
export async function minhaEquipe(): Promise<InfoEquipe | null> {
  if (!EH_SUCESSORISTA) return null;
  try {
    const eu = await usuarioDaSessao();
    if (!eu?.equipeId || !eu.papelEquipe) return null;
    return await montarInfo(
      eu.equipeId,
      eu.papelEquipe === "CHEFE" ? "CHEFE" : "MEMBRO",
      eu.acessoCasosEquipe,
    );
  } catch {
    return null;
  }
}

export async function criarEquipe(nome: string): Promise<Resultado<InfoEquipe>> {
  if (!EH_SUCESSORISTA) return { ok: false, erro: "Indisponível nesta plataforma." };
  const nomeLimpo = typeof nome === "string" ? nome.trim().slice(0, 80) : "";
  if (!nomeLimpo) return { ok: false, erro: "Dê um nome à equipe." };
  try {
    const eu = await usuarioDaSessao();
    if (!eu) return { ok: false, erro: "Sessão expirada — entre de novo." };
    if (eu.equipeId) return { ok: false, erro: "Você já está numa equipe — saia dela primeiro." };
    const equipe = await prisma.equipe.create({ data: { nome: nomeLimpo, app: appComConta() } });
    await prisma.user.update({
      where: { id: eu.id },
      data: { equipeId: equipe.id, papelEquipe: "CHEFE" },
    });
    const info = await montarInfo(equipe.id, "CHEFE", true);
    return info ? { ok: true, dados: info } : { ok: false, erro: "Falha ao montar a equipe." };
  } catch {
    return { ok: false, erro: "Banco indisponível (ou migração pendente) — tente mais tarde." };
  }
}

/**
 * SÓ o chefe: gera um código de convite de USO ÚNICO. Com `acessoCasos`,
 * o convite é de ACESSO TOTAL — quem entrar com ele enxerga todos os casos
 * da nuvem da equipe (continua sem poder gerir a equipe).
 */
export async function gerarConviteEquipe(
  acessoCasos = false,
): Promise<Resultado<{ codigo: string; acessoCasos: boolean }>> {
  if (!EH_SUCESSORISTA) return { ok: false, erro: "Indisponível nesta plataforma." };
  try {
    const eu = await usuarioDaSessao();
    if (!eu?.equipeId) return { ok: false, erro: "Você não está numa equipe." };
    if (eu.papelEquipe !== "CHEFE")
      return { ok: false, erro: "Só o(a) chefe da equipe gera convites." };
    const bytes = new Uint8Array(9);
    crypto.getRandomValues(bytes);
    const codigo = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
    await prisma.equipeConvite.create({
      data: { token: codigo, equipeId: eu.equipeId, acessoCasos: acessoCasos === true },
    });
    return { ok: true, dados: { codigo, acessoCasos: acessoCasos === true } };
  } catch {
    return { ok: false, erro: "Banco indisponível (ou migração pendente) — tente mais tarde." };
  }
}

/** Conta sem equipe + código válido: entra como MEMBRO e herda o perfil do
 *  chefe quando ainda não escolheu o próprio. */
export async function entrarNaEquipe(codigo: string): Promise<Resultado<InfoEquipe>> {
  if (!EH_SUCESSORISTA) return { ok: false, erro: "Indisponível nesta plataforma." };
  const codigoLimpo = typeof codigo === "string" ? codigo.trim().toLowerCase() : "";
  if (!codigoLimpo) return { ok: false, erro: "Cole o código do convite." };
  try {
    const eu = await usuarioDaSessao();
    if (!eu) return { ok: false, erro: "Sessão expirada — entre de novo." };
    if (eu.equipeId) return { ok: false, erro: "Você já está numa equipe — saia dela primeiro." };
    const convite = await prisma.equipeConvite.findUnique({
      where: { token: codigoLimpo },
      select: { token: true, equipeId: true, usadoEm: true, acessoCasos: true },
    });
    if (!convite) return { ok: false, erro: "Código de convite não encontrado — confira com o(a) chefe." };
    if (convite.usadoEm) return { ok: false, erro: "Este código já foi usado — peça um novo ao(à) chefe." };

    // Perfil da equipe = o do chefe; membro sem escolha própria herda.
    const chefe = await prisma.user.findFirst({
      where: { equipeId: convite.equipeId, papelEquipe: "CHEFE" },
      select: { perfilSucessorista: true },
    });
    await prisma.$transaction([
      prisma.user.update({
        where: { id: eu.id },
        data: {
          equipeId: convite.equipeId,
          papelEquipe: "MEMBRO",
          acessoCasosEquipe: convite.acessoCasos,
          ...(eu.perfilSucessorista === null && chefe?.perfilSucessorista
            ? { perfilSucessorista: chefe.perfilSucessorista }
            : {}),
        },
      }),
      prisma.equipeConvite.update({
        where: { token: convite.token },
        data: { usadoEm: new Date(), usadoPorId: eu.id },
      }),
    ]);
    const info = await montarInfo(convite.equipeId, "MEMBRO", convite.acessoCasos);
    return info ? { ok: true, dados: info } : { ok: false, erro: "Falha ao montar a equipe." };
  } catch {
    return { ok: false, erro: "Banco indisponível (ou migração pendente) — tente mais tarde." };
  }
}

/** SÓ o chefe: remove um membro (nunca a si próprio). */
export async function removerMembroEquipe(membroId: string): Promise<Resultado<InfoEquipe>> {
  if (!EH_SUCESSORISTA) return { ok: false, erro: "Indisponível nesta plataforma." };
  try {
    const eu = await usuarioDaSessao();
    if (!eu?.equipeId) return { ok: false, erro: "Você não está numa equipe." };
    if (eu.papelEquipe !== "CHEFE")
      return { ok: false, erro: "Só o(a) chefe da equipe remove membros." };
    if (membroId === eu.id) return { ok: false, erro: "O(a) chefe não remove a si — exclua a equipe." };
    const alvo = await prisma.user.findUnique({
      where: { id: membroId },
      select: { id: true, equipeId: true },
    });
    if (!alvo || alvo.equipeId !== eu.equipeId)
      return { ok: false, erro: "Membro não encontrado nesta equipe." };
    await prisma.user.update({
      where: { id: alvo.id },
      data: { equipeId: null, papelEquipe: null, acessoCasosEquipe: false },
    });
    const info = await montarInfo(eu.equipeId, "CHEFE", true);
    return info ? { ok: true, dados: info } : { ok: false, erro: "Falha ao montar a equipe." };
  } catch {
    return { ok: false, erro: "Banco indisponível (ou migração pendente) — tente mais tarde." };
  }
}

/** MEMBRO sai da equipe (o chefe não sai — exclui quando for o único). */
export async function sairDaEquipe(): Promise<Resultado<null>> {
  if (!EH_SUCESSORISTA) return { ok: false, erro: "Indisponível nesta plataforma." };
  try {
    const eu = await usuarioDaSessao();
    if (!eu?.equipeId) return { ok: false, erro: "Você não está numa equipe." };
    if (eu.papelEquipe === "CHEFE")
      return { ok: false, erro: "O(a) chefe não sai — remova os membros e exclua a equipe." };
    await prisma.user.update({
      where: { id: eu.id },
      data: { equipeId: null, papelEquipe: null, acessoCasosEquipe: false },
    });
    return { ok: true, dados: null };
  } catch {
    return { ok: false, erro: "Banco indisponível (ou migração pendente) — tente mais tarde." };
  }
}

/** SÓ o chefe, e só quando for o ÚNICO membro: exclui a equipe. */
export async function excluirEquipe(): Promise<Resultado<null>> {
  if (!EH_SUCESSORISTA) return { ok: false, erro: "Indisponível nesta plataforma." };
  try {
    const eu = await usuarioDaSessao();
    if (!eu?.equipeId) return { ok: false, erro: "Você não está numa equipe." };
    if (eu.papelEquipe !== "CHEFE")
      return { ok: false, erro: "Só o(a) chefe exclui a equipe." };
    const membros = await prisma.user.count({ where: { equipeId: eu.equipeId } });
    if (membros > 1)
      return { ok: false, erro: "Remova os demais membros antes de excluir a equipe." };
    const equipeId = eu.equipeId;
    await prisma.user.update({
      where: { id: eu.id },
      data: { equipeId: null, papelEquipe: null, acessoCasosEquipe: false },
    });
    // Os casos da nuvem caem junto (FK em cascata de equipe_casos).
    await prisma.equipe.delete({ where: { id: equipeId } });
    return { ok: true, dados: null };
  } catch {
    return { ok: false, erro: "Banco indisponível (ou migração pendente) — tente mais tarde." };
  }
}
