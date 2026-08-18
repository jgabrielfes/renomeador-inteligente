"use server";

// NUVEM DE CASOS — server actions do espelho do caso.json no servidor.
//
// DUAS nuvens atrás das MESMAS actions (o cliente não sabe qual está ativa):
// - NUVEM DA EQUIPE (tabela equipe_casos): CHEFE sempre, e o MEMBRO que
//   entrou por convite de ACESSO TOTAL (users.acessoCasosEquipe);
// - NUVEM DA CONTA (tabela conta_casos): TODO usuário logado sem a da
//   equipe — é o que faz o login "puxar" os casos em qualquer computador.
// A leitura cobre as duas (quem entra numa equipe não perde o que já tinha
// espelhado na conta); a escrita vai para a ativa, apagando a sombra da
// conta quando o mesmo caso passa a viver na da equipe.
//
// O que sobe é SÓ o `caso.json` (folha do caso: cabeçalho, dados do wizard e
// manifesto de metadados) — os DOCUMENTOS nunca saem da máquina (fronteira
// de dados do módulo).
// Toda validação é aqui no servidor — server action é endpoint público.
//
// Concorrência: a gravação carrega a mesma guarda dos stores locais —
// `baseAtualizadoEm` de quando o caso foi aberto; divergiu e não forçou,
// volta o conflito com o arquivo atual para o dialog de três saídas. O
// espelho automático (salvamento local com nuvem ativa) usa `espelho: true`:
// nunca sobrescreve versão mais nova — só avisa que ficou para trás.
//
// Privacidade: dado do PRÓPRIO escritório (como renamer_lessons) — NUNCA
// exibir em /admin, nenhuma telemetria de conteúdo.

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { EH_SUCESSORISTA } from "@/lib/app";

/** Cabeçalho como trafega na listagem (mesma forma do CabecalhoCaso do cliente). */
export interface CabecalhoNuvem {
  caseId: string;
  titulo: string;
  autorDaHeranca: string;
  dataObito: string;
  criadoEm: string;
  atualizadoEm: string;
  atualizadoPor: string;
  qtdDocumentos: number;
  custoProjetado: number | null;
}

export interface ResultadoSalvamentoNuvem {
  ok: boolean;
  salvoEm?: string;
  /** Outro membro salvou depois de você abrir (gravação direta na nuvem). */
  conflito?: { atualizadoEm: string; atualizadoPor: string; arquivo: unknown };
  /** Espelho recusado: a nuvem tem versão mais nova (quem/quando). */
  desatualizado?: { atualizadoEm: string; atualizadoPor: string };
  erro?: string;
}

// ~4 MB serializado: folha + manifesto cabem com folga; barra abuso.
const TAMANHO_MAXIMO = 4_000_000;

interface EscopoNuvem {
  userId: string;
  /** Nuvem da equipe ativa (chefe ou membro com acesso total); null = só a da conta. */
  equipeId: string | null;
}

async function escopoNuvem(): Promise<EscopoNuvem | null> {
  const session = await auth();
  const id = session?.user?.id;
  if (!id) return null;
  const eu = await prisma.user.findUnique({
    where: { id },
    select: { equipeId: true, papelEquipe: true, acessoCasosEquipe: true },
  });
  if (!eu) return null;
  const equipeId =
    eu.equipeId && (eu.papelEquipe === "CHEFE" || eu.acessoCasosEquipe) ? eu.equipeId : null;
  return { userId: id, equipeId };
}

function lerCabecalho(arquivo: unknown): CabecalhoNuvem | null {
  if (!arquivo || typeof arquivo !== "object") return null;
  const c = (arquivo as { cabecalho?: Record<string, unknown> }).cabecalho;
  if (!c || typeof c.caseId !== "string" || !c.caseId) return null;
  if (typeof c.atualizadoEm !== "string" || !c.atualizadoEm) return null;
  return {
    caseId: c.caseId,
    titulo: typeof c.titulo === "string" ? c.titulo : "Caso sem título",
    autorDaHeranca: typeof c.autorDaHeranca === "string" ? c.autorDaHeranca : "",
    dataObito: typeof c.dataObito === "string" ? c.dataObito : "",
    criadoEm: typeof c.criadoEm === "string" ? c.criadoEm : "",
    atualizadoEm: c.atualizadoEm,
    atualizadoPor: typeof c.atualizadoPor === "string" ? c.atualizadoPor : "",
    qtdDocumentos: typeof c.qtdDocumentos === "number" ? c.qtdDocumentos : 0,
    custoProjetado: typeof c.custoProjetado === "number" ? c.custoProjetado : null,
  };
}

/** Cabeçalhos dos casos na nuvem (equipe + conta). null = deslogado/falha. */
export async function listarCasosNuvem(): Promise<CabecalhoNuvem[] | null> {
  if (!EH_SUCESSORISTA) return null;
  try {
    const escopo = await escopoNuvem();
    if (!escopo) return null;
    const [daEquipe, daConta] = await Promise.all([
      escopo.equipeId
        ? prisma.equipeCaso.findMany({
            where: { equipeId: escopo.equipeId },
            select: { cabecalho: true },
            orderBy: { atualizadoEm: "desc" },
          })
        : Promise.resolve([]),
      prisma.contaCaso.findMany({
        where: { userId: escopo.userId },
        select: { cabecalho: true },
        orderBy: { atualizadoEm: "desc" },
      }),
    ]);
    // O mesmo caso pode existir nas duas nuvens (conta antiga + equipe nova):
    // fica UM cabeçalho por caseId, o mais novo.
    const porCaso = new Map<string, CabecalhoNuvem>();
    for (const l of [...daEquipe, ...daConta]) {
      const c = lerCabecalho({ cabecalho: l.cabecalho });
      if (!c) continue;
      const atual = porCaso.get(c.caseId);
      if (!atual || c.atualizadoEm > atual.atualizadoEm) porCaso.set(c.caseId, c);
    }
    return [...porCaso.values()].sort((a, b) => (a.atualizadoEm < b.atualizadoEm ? 1 : -1));
  } catch {
    return null;
  }
}

/** O arquivo do caso (caso.json) guardado na nuvem. null = não achou/sem acesso. */
export async function abrirCasoNuvem(caseId: string): Promise<unknown | null> {
  if (!EH_SUCESSORISTA || typeof caseId !== "string" || !caseId) return null;
  try {
    const escopo = await escopoNuvem();
    if (!escopo) return null;
    const [daEquipe, daConta] = await Promise.all([
      escopo.equipeId
        ? prisma.equipeCaso.findUnique({
            where: { id: caseId },
            select: { equipeId: true, arquivo: true, atualizadoEm: true },
          })
        : Promise.resolve(null),
      prisma.contaCaso.findUnique({
        where: { userId_id: { userId: escopo.userId, id: caseId } },
        select: { arquivo: true, atualizadoEm: true },
      }),
    ]);
    const equipeVale = daEquipe && daEquipe.equipeId === escopo.equipeId ? daEquipe : null;
    if (equipeVale && daConta)
      return equipeVale.atualizadoEm >= daConta.atualizadoEm ? equipeVale.arquivo : daConta.arquivo;
    return equipeVale?.arquivo ?? daConta?.arquivo ?? null;
  } catch {
    return null;
  }
}

/**
 * Grava/espelha um caso na nuvem da equipe.
 * - `espelho: true` (salvamento local com nuvem ativa): só grava se NÃO
 *   houver versão mais nova na nuvem — nunca sobrescreve trabalho alheio.
 * - gravação direta (caso aberto DA nuvem): guarda de conflito por
 *   `baseAtualizadoEm`, com `forcar` para "manter a minha versão".
 */
export async function salvarCasoNuvem(
  arquivo: unknown,
  opcoes: { baseAtualizadoEm: string | null; forcar?: boolean; espelho?: boolean },
): Promise<ResultadoSalvamentoNuvem> {
  if (!EH_SUCESSORISTA) return { ok: false, erro: "Indisponível nesta plataforma." };
  const cabecalho = lerCabecalho(arquivo);
  if (!cabecalho) return { ok: false, erro: "Arquivo de caso inválido." };
  try {
    if (JSON.stringify(arquivo).length > TAMANHO_MAXIMO)
      return { ok: false, erro: "Caso grande demais para a nuvem." };
  } catch {
    return { ok: false, erro: "Arquivo de caso inválido." };
  }
  try {
    const escopo = await escopoNuvem();
    if (!escopo) return { ok: false, erro: "Sem acesso à nuvem." };
    // A versão vigente para a guarda de conflito é a MAIS NOVA entre as duas
    // nuvens — quem entrou numa equipe não perde o histórico da conta.
    const [linhaEquipe, linhaConta] = await Promise.all([
      escopo.equipeId
        ? prisma.equipeCaso.findUnique({
            where: { id: cabecalho.caseId },
            select: { equipeId: true, arquivo: true, atualizadoPor: true, atualizadoEm: true },
          })
        : Promise.resolve(null),
      prisma.contaCaso.findUnique({
        where: { userId_id: { userId: escopo.userId, id: cabecalho.caseId } },
        select: { arquivo: true, atualizadoPor: true, atualizadoEm: true },
      }),
    ]);
    if (linhaEquipe && linhaEquipe.equipeId !== escopo.equipeId)
      return { ok: false, erro: "Este caso pertence a outra equipe." };
    const atual =
      linhaEquipe && linhaConta
        ? linhaEquipe.atualizadoEm >= linhaConta.atualizadoEm
          ? linhaEquipe
          : linhaConta
        : (linhaEquipe ?? linhaConta);
    const cabecalhoAtual = atual ? lerCabecalho(atual.arquivo) : null;

    if (atual && cabecalhoAtual && opcoes.forcar !== true) {
      if (opcoes.espelho === true) {
        // Espelho nunca anda para trás: versão da nuvem mais nova fica.
        if (cabecalhoAtual.atualizadoEm > cabecalho.atualizadoEm)
          return {
            ok: false,
            desatualizado: {
              atualizadoEm: cabecalhoAtual.atualizadoEm,
              atualizadoPor: cabecalhoAtual.atualizadoPor || atual.atualizadoPor,
            },
          };
      } else if (
        opcoes.baseAtualizadoEm &&
        cabecalhoAtual.atualizadoEm !== opcoes.baseAtualizadoEm
      ) {
        return {
          ok: false,
          conflito: {
            atualizadoEm: cabecalhoAtual.atualizadoEm,
            atualizadoPor: cabecalhoAtual.atualizadoPor || atual.atualizadoPor || "outra pessoa",
            arquivo: atual.arquivo,
          },
        };
      }
    }

    // Mesmo padrão do store do portal: JSON "puro" para as colunas Json.
    const cabecalhoJson = JSON.parse(JSON.stringify(cabecalho)) as object;
    const arquivoJson = JSON.parse(JSON.stringify(arquivo)) as object;
    if (escopo.equipeId) {
      await prisma.equipeCaso.upsert({
        where: { id: cabecalho.caseId },
        create: {
          id: cabecalho.caseId,
          equipeId: escopo.equipeId,
          cabecalho: cabecalhoJson,
          arquivo: arquivoJson,
          atualizadoEm: new Date(cabecalho.atualizadoEm),
          atualizadoPor: cabecalho.atualizadoPor,
        },
        update: {
          cabecalho: cabecalhoJson,
          arquivo: arquivoJson,
          atualizadoEm: new Date(cabecalho.atualizadoEm),
          atualizadoPor: cabecalho.atualizadoPor,
        },
      });
      // O caso agora vive na nuvem da equipe: a sombra da conta sai, para a
      // listagem não carregar duas versões do mesmo caso para sempre.
      if (linhaConta) {
        await prisma.contaCaso.deleteMany({
          where: { userId: escopo.userId, id: cabecalho.caseId },
        });
      }
    } else {
      await prisma.contaCaso.upsert({
        where: { userId_id: { userId: escopo.userId, id: cabecalho.caseId } },
        create: {
          id: cabecalho.caseId,
          userId: escopo.userId,
          cabecalho: cabecalhoJson,
          arquivo: arquivoJson,
          atualizadoEm: new Date(cabecalho.atualizadoEm),
          atualizadoPor: cabecalho.atualizadoPor,
        },
        update: {
          cabecalho: cabecalhoJson,
          arquivo: arquivoJson,
          atualizadoEm: new Date(cabecalho.atualizadoEm),
          atualizadoPor: cabecalho.atualizadoPor,
        },
      });
    }
    return { ok: true, salvoEm: cabecalho.atualizadoEm };
  } catch {
    return { ok: false, erro: "Banco indisponível (ou migração pendente) — tente mais tarde." };
  }
}

/** Remove um caso da nuvem (ex.: junto do arquivamento local). Melhor-esforço. */
export async function removerCasoNuvem(caseId: string): Promise<boolean> {
  if (!EH_SUCESSORISTA || typeof caseId !== "string" || !caseId) return false;
  try {
    const escopo = await escopoNuvem();
    if (!escopo) return false;
    const [daEquipe, daConta] = await Promise.all([
      escopo.equipeId
        ? prisma.equipeCaso.deleteMany({ where: { id: caseId, equipeId: escopo.equipeId } })
        : Promise.resolve({ count: 0 }),
      prisma.contaCaso.deleteMany({ where: { id: caseId, userId: escopo.userId } }),
    ]);
    return daEquipe.count + daConta.count > 0;
  } catch {
    return false;
  }
}
