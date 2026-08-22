"use server";

// PAINEL DO CLIENTE — server actions do espelho publicado para a família.
//
// O advogado clica "Publicar para a família" e o navegador DELE monta o
// snapshot FILTRADO (lib/portal/painel.ts — allowlist campo a campo, um
// painel por convite/token); aqui só se valida, autoriza e grava. O caso
// completo NUNCA sobe — o que chega já é a projeção que a família pode ver.
//
// Autorização: server action é endpoint público — TODA action valida sessão
// e o dono do espelho. Quem pode mexer: quem publicou OU quem está na MESMA
// equipe do dono (equipes trabalham o mesmo caso). Encerrar apaga o painel
// (cascade nos eventos) E os convites do caso (cascade nos arquivos): é o
// clique único de "apagar tudo do servidor" prometido à família.
//
// Privacidade: dado do PRÓPRIO escritório e da família — NUNCA exibir em
// /admin; telemetria só de contagens (registrarPortal), nunca conteúdo.

import { headers } from "next/headers";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/lib/generated/prisma/client";
import { EH_SUCESSORISTA } from "@/lib/app";
import {
  notificarDigest,
  notificarMudancaDeFase,
  notificarQuinhaoLiberado,
  notificarVotacao,
} from "@/lib/portal/notificar";
import { textoLeigoDoEvento, TIPOS_VISIVEIS_AO_HERDEIRO } from "@/lib/portal/eventos";
import type { VotacaoDados } from "@/lib/portal/espolio";
import type { PainelHerdeiro, VisibilidadePainel } from "@/lib/portal/painel";
import type { CenarioCompartilhado, EspolioCompartilhado } from "@/lib/portal/espolio";
import type { ConviteHerdeiro } from "@/lib/portal/store";
import type { DetalheEventoPortal } from "@/lib/portal/eventos";
import { registrarEventoPortal } from "@/lib/portal/eventos-server";

// Snapshot generoso (fases + textos por herdeiro), mas com teto anti-abuso.
const TAMANHO_MAXIMO = 1_000_000;

export interface EstadoPainelPublicado {
  publicado: boolean;
  /** ISO da última publicação (updatedAt). */
  publicadoEm?: string;
  /** Quantos painéis (convites) o snapshot publicado contém. */
  convites?: number;
  erro?: string;
}

async function usuarioLogado(): Promise<{ id: string; equipeId: string | null } | null> {
  const session = await auth();
  const id = session?.user?.id;
  if (!id) return null;
  try {
    const eu = await prisma.user.findUnique({
      where: { id },
      select: { equipeId: true },
    });
    if (!eu) return null;
    return { id, equipeId: eu.equipeId };
  } catch {
    return null;
  }
}

/** Dono do espelho ou colega da MESMA equipe do dono. */
async function podeGerir(
  donoId: string,
  eu: { id: string; equipeId: string | null },
): Promise<boolean> {
  if (donoId === eu.id) return true;
  if (!eu.equipeId) return false;
  try {
    const dono = await prisma.user.findUnique({
      where: { id: donoId },
      select: { equipeId: true },
    });
    return dono?.equipeId != null && dono.equipeId === eu.equipeId;
  } catch {
    return false;
  }
}

/** Fase ATUAL (título leigo) do primeiro painel de um snapshot publicado. */
function faseDoSnapshot(snapshot: unknown): string | null {
  const paineis = Object.values((snapshot as Record<string, PainelHerdeiro> | null) ?? {});
  const atual = paineis[0]?.fases?.find?.((f) => f.atual);
  return atual?.titulo ?? null;
}

/**
 * Publica (ou republica) o espelho do caso. `paineis` já vem segmentado por
 * token — o servidor não recorta nada, só rejeita o que não deve subir.
 */
export async function publicarPainel(dados: {
  casoId: string;
  paineis: Record<string, PainelHerdeiro>;
  visibilidade: VisibilidadePainel;
  /** Espaço do Espólio: o snapshot COMPARTILHADO (igual para todos), já
   *  montado pela allowlist no navegador do advogado — null = fechado. */
  espolio?: EspolioCompartilhado | null;
}): Promise<EstadoPainelPublicado> {
  if (!EH_SUCESSORISTA) return { publicado: false, erro: "Recurso de outro site." };
  const eu = await usuarioLogado();
  if (!eu) return { publicado: false, erro: "Sessão expirada — entre de novo." };

  const casoId = String(dados.casoId ?? "").slice(0, 80);
  if (!casoId) return { publicado: false, erro: "Caso sem identificação." };
  const tokens = Object.keys(dados.paineis ?? {});
  if (tokens.length === 0) {
    return { publicado: false, erro: "Gere ao menos um convite no cofre antes de publicar." };
  }

  const snapshot = JSON.parse(JSON.stringify(dados.paineis)) as object;
  const visibilidade = JSON.parse(JSON.stringify(dados.visibilidade ?? {})) as object;
  const espolio = dados.espolio
    ? (JSON.parse(JSON.stringify(dados.espolio)) as object)
    : null;
  if (JSON.stringify(snapshot).length > TAMANHO_MAXIMO) {
    return { publicado: false, erro: "Espelho grande demais para publicar." };
  }
  if (espolio && JSON.stringify(espolio).length > TAMANHO_MAXIMO) {
    return { publicado: false, erro: "Espaço do espólio grande demais para publicar." };
  }

  try {
    const existente = await prisma.portalPainel.findUnique({
      where: { casoId },
      select: { userId: true, snapshot: true, visibilidade: true, espolio: true },
    });
    if (existente && !(await podeGerir(existente.userId, eu))) {
      return { publicado: false, erro: "Este painel foi publicado por outra conta." };
    }
    const linha = await prisma.portalPainel.upsert({
      where: { casoId },
      create: { casoId, userId: eu.id, snapshot, visibilidade, espolio: espolio ?? Prisma.JsonNull },
      update: { snapshot, visibilidade, espolio: espolio ?? Prisma.JsonNull },
    });
    // Registro de atendimento: abertura/fechamento do Espaço do Espólio.
    const espolioAntes = Boolean(existente && "espolio" in existente && existente.espolio);
    if (Boolean(espolio) !== espolioAntes) {
      void registrarEventoPortal(casoId, espolio ? "ESPOLIO_ABERTO" : "ESPOLIO_FECHADO");
    }
    void registrarEventoPortal(casoId, "PUBLICACAO", { convites: tokens.length });
    // Marcos do caso para o histórico do herdeiro: a FASE mudou entre as
    // publicações, e o quinhão saiu de fechado para LIBERADO. Com o e-mail
    // habilitado (RESEND_API_KEY), cada marco também dispara o aviso — o
    // advogado publica uma vez e a família inteira fica sabendo.
    const origem = await (async () => {
      try {
        const h = await headers();
        const host = h.get("x-forwarded-host") ?? h.get("host") ?? "";
        const proto = h.get("x-forwarded-proto") ?? "https";
        return host ? `${proto}://${host}` : "";
      } catch {
        return "";
      }
    })();
    const nomeFalecido =
      Object.values(dados.paineis)[0]?.nomeFalecido ?? "";
    const faseNova = faseDoSnapshot(snapshot);
    const faseAnterior = existente ? faseDoSnapshot(existente.snapshot) : null;
    if (faseNova && faseNova !== faseAnterior) {
      void registrarEventoPortal(casoId, "FASE", { fase: faseNova });
      if (existente) void notificarMudancaDeFase(casoId, nomeFalecido, faseNova, origem);
    }
    const quinhaoAntes = Boolean(
      (existente?.visibilidade as VisibilidadePainel | null)?.quinhao,
    );
    if (dados.visibilidade?.quinhao && !quinhaoAntes && existente) {
      void registrarEventoPortal(casoId, "QUINHAO_LIBERADO");
      void notificarQuinhaoLiberado(casoId, nomeFalecido, origem);
    }
    return {
      publicado: true,
      publicadoEm: linha.updatedAt.toISOString(),
      convites: tokens.length,
    };
  } catch {
    return { publicado: false, erro: "Falha ao publicar — tente novamente." };
  }
}

/** Estado atual do espelho (para a UI mostrar "publicado às…"). */
export async function estadoPainel(casoId: string): Promise<EstadoPainelPublicado> {
  if (!EH_SUCESSORISTA) return { publicado: false };
  const eu = await usuarioLogado();
  if (!eu) return { publicado: false };
  try {
    const linha = await prisma.portalPainel.findUnique({
      where: { casoId: String(casoId ?? "").slice(0, 80) },
      select: { userId: true, updatedAt: true, snapshot: true },
    });
    if (!linha || !(await podeGerir(linha.userId, eu))) return { publicado: false };
    return {
      publicado: true,
      publicadoEm: linha.updatedAt.toISOString(),
      convites: Object.keys((linha.snapshot as Record<string, unknown>) ?? {}).length,
    };
  } catch {
    return { publicado: false };
  }
}

/**
 * Encerra o compartilhamento: apaga o espelho (cascade nos eventos) e os
 * convites do caso (cascade nos arquivos enviados pelos herdeiros). É o
 * "apagar tudo do servidor" — os links da família morrem na hora.
 */
export async function encerrarPainel(
  casoId: string,
): Promise<{ ok: boolean; convitesApagados?: number; erro?: string }> {
  if (!EH_SUCESSORISTA) return { ok: false, erro: "Recurso de outro site." };
  const eu = await usuarioLogado();
  if (!eu) return { ok: false, erro: "Sessão expirada — entre de novo." };
  const id = String(casoId ?? "").slice(0, 80);
  if (!id) return { ok: false, erro: "Caso sem identificação." };

  try {
    const linha = await prisma.portalPainel.findUnique({
      where: { casoId: id },
      select: { userId: true },
    });
    if (!linha) {
      // Sem espelho publicado não há o que autorizar pelo dono — mas pode
      // haver convites antigos do caso; eles só caem junto de um espelho.
      return { ok: false, erro: "Este caso não tem painel publicado." };
    }
    if (!(await podeGerir(linha.userId, eu))) {
      return { ok: false, erro: "Este painel foi publicado por outra conta." };
    }
    const [convites] = await prisma.$transaction([
      prisma.portalConvite.deleteMany({ where: { casoId: id } }),
      prisma.portalPainel.delete({ where: { casoId: id } }),
      // Sem FK desde a migração registro_de_atendimento: o encerramento é
      // quem apaga o histórico — "apagar tudo do servidor" inclui os eventos
      // e os fatos do espólio (comentários, sugestões e despesas da família).
      prisma.portalEvento.deleteMany({ where: { casoId: id } }),
      prisma.espolioNota.deleteMany({ where: { casoId: id } }),
      prisma.espolioDespesa.deleteMany({ where: { casoId: id } }),
      prisma.espolioCenario.deleteMany({ where: { casoId: id } }),
      prisma.espolioAdesao.deleteMany({ where: { casoId: id } }),
      prisma.espolioVotacao.deleteMany({ where: { casoId: id } }),
      prisma.espolioVoto.deleteMany({ where: { casoId: id } }),
      prisma.espolioMural.deleteMany({ where: { casoId: id } }),
    ]);
    return { ok: true, convitesApagados: convites.count };
  } catch {
    return { ok: false, erro: "Falha ao encerrar — tente novamente." };
  }
}

/**
 * Revoga UM convite: o link daquele herdeiro morre (portal responde 410),
 * o registro fica para o histórico e o painel dele sai do snapshot. Não
 * apaga os arquivos que ele já enviou — isso é o encerramento do caso.
 */
export async function revogarConvite(
  token: string,
): Promise<{ ok: boolean; convite?: ConviteHerdeiro; erro?: string }> {
  if (!EH_SUCESSORISTA) return { ok: false, erro: "Recurso de outro site." };
  const eu = await usuarioLogado();
  if (!eu) return { ok: false, erro: "Sessão expirada — entre de novo." };
  const t = String(token ?? "").slice(0, 120);
  if (!t) return { ok: false, erro: "Convite sem identificação." };

  try {
    const linha = await prisma.portalConvite.findUnique({ where: { token: t } });
    if (!linha) return { ok: false, erro: "Convite não encontrado." };
    const convite = linha.dados as unknown as ConviteHerdeiro;

    // Com espelho publicado, vale o dono do espelho; sem espelho, qualquer
    // conta logada do site (mesma régua da emissão do convite hoje).
    const painel = await prisma.portalPainel.findUnique({
      where: { casoId: linha.casoId },
      select: { userId: true, snapshot: true },
    });
    if (painel && !(await podeGerir(painel.userId, eu))) {
      return { ok: false, erro: "O painel deste caso é de outra conta." };
    }

    convite.revogadoEm = new Date().toISOString();
    const dados = JSON.parse(JSON.stringify(convite)) as object;
    const atualizaConvite = prisma.portalConvite.update({ where: { token: t }, data: { dados } });
    const snapshot = { ...((painel?.snapshot as Record<string, unknown> | undefined) ?? {}) };
    if (painel && t in snapshot) {
      delete snapshot[t];
      await prisma.$transaction([
        atualizaConvite,
        prisma.portalPainel.update({
          where: { casoId: linha.casoId },
          data: { snapshot: snapshot as object },
        }),
      ]);
    } else {
      await atualizaConvite;
    }
    void registrarEventoPortal(
      linha.casoId,
      "CONVITE_REVOGADO",
      { herdeiro: convite.nomeHerdeiro },
      t,
    );
    return { ok: true, convite };
  } catch {
    return { ok: false, erro: "Falha ao revogar — tente novamente." };
  }
}

/* ------------------------------------------------------------------ */
/* Espaço do Espólio — fatos da família e a decisão do escritório      */
/* ------------------------------------------------------------------ */

export interface NotaEspolio {
  id: string;
  autor: string;
  bemId: string;
  tipo: string; // 'comentario' | 'sugestao_valor'
  texto: string;
  valorSugerido: string | null;
  status: string; // 'pendente' | 'aceita' | 'recusada'
  motivo: string | null;
  criadaEm: string;
}

export interface DespesaEspolio {
  id: string;
  autor: string;
  herdeiroId: string | null;
  categoria: string;
  valor: string;
  data: string;
  descricao: string;
  status: string; // 'pendente' | 'reconhecida' | 'nao_reconhecida'
  motivo: string | null;
  tratamento: string; // 'ressarcir' | 'compensar'
  criadaEm: string;
}

/** Mesma régua do relatório: dono do espelho ou colega de equipe; sem
 *  espelho publicado, qualquer conta logada do site. */
async function podeGerirCaso(
  casoId: string,
  eu: { id: string; equipeId: string | null },
): Promise<boolean> {
  const painel = await prisma.portalPainel.findUnique({
    where: { casoId },
    select: { userId: true },
  });
  return !painel || (await podeGerir(painel.userId, eu));
}

/** Lista os fatos do espólio de um caso (comentários, sugestões, despesas). */
export async function fatosDoEspolio(
  casoId: string,
): Promise<{ ok: boolean; notas?: NotaEspolio[]; despesas?: DespesaEspolio[]; erro?: string }> {
  if (!EH_SUCESSORISTA) return { ok: false, erro: "Recurso de outro site." };
  const eu = await usuarioLogado();
  if (!eu) return { ok: false, erro: "Sessão expirada — entre de novo." };
  const id = String(casoId ?? "").slice(0, 80);
  if (!id) return { ok: false, erro: "Caso sem identificação." };
  try {
    if (!(await podeGerirCaso(id, eu))) {
      return { ok: false, erro: "O painel deste caso é de outra conta." };
    }
    const [notas, despesas] = await Promise.all([
      prisma.espolioNota.findMany({
        where: { casoId: id },
        orderBy: { createdAt: "asc" },
        take: 300,
      }),
      prisma.espolioDespesa.findMany({
        where: { casoId: id },
        orderBy: { createdAt: "asc" },
        take: 300,
      }),
    ]);
    return {
      ok: true,
      notas: notas.map((n) => ({
        id: n.id,
        autor: n.autor,
        bemId: n.bemId,
        tipo: n.tipo,
        texto: n.texto,
        valorSugerido: n.valorSugerido,
        status: n.status,
        motivo: n.motivo,
        criadaEm: n.createdAt.toISOString(),
      })),
      despesas: despesas.map((d) => ({
        id: d.id,
        autor: d.autor,
        herdeiroId: d.herdeiroId,
        categoria: d.categoria,
        valor: d.valor,
        data: d.data,
        descricao: d.descricao,
        status: d.status,
        motivo: d.motivo,
        tratamento: d.tratamento,
        criadaEm: d.createdAt.toISOString(),
      })),
    };
  } catch {
    return { ok: false, erro: "Falha ao carregar os fatos do espólio." };
  }
}

/**
 * Decide uma sugestão de valor (ou arquiva um comentário). NADA muda no caso
 * sem o aceite: quem aplica o valor ao acervo é o NAVEGADOR do advogado,
 * depois desta gravação. O fato do herdeiro é imutável — a decisão só mexe
 * em status/motivo/decididaEm.
 */
export async function decidirSugestao(
  notaId: string,
  aceitar: boolean,
  motivo?: string,
): Promise<{ ok: boolean; nota?: NotaEspolio; erro?: string }> {
  if (!EH_SUCESSORISTA) return { ok: false, erro: "Recurso de outro site." };
  const eu = await usuarioLogado();
  if (!eu) return { ok: false, erro: "Sessão expirada — entre de novo." };
  const id = String(notaId ?? "").slice(0, 80);
  if (!id) return { ok: false, erro: "Nota sem identificação." };
  const motivoLimpo = String(motivo ?? "").trim().slice(0, 300);
  if (!aceitar && motivoLimpo === "") {
    return { ok: false, erro: "Explique o motivo da recusa — o herdeiro vai ler." };
  }
  try {
    const nota = await prisma.espolioNota.findUnique({ where: { id } });
    if (!nota) return { ok: false, erro: "Nota não encontrada." };
    if (!(await podeGerirCaso(nota.casoId, eu))) {
      return { ok: false, erro: "O painel deste caso é de outra conta." };
    }
    const atualizada = await prisma.espolioNota.update({
      where: { id },
      data: {
        status: aceitar ? "aceita" : "recusada",
        motivo: motivoLimpo === "" ? null : motivoLimpo,
        decididaEm: new Date(),
      },
    });
    void registrarEventoPortal(
      nota.casoId,
      "ESPOLIO_SUGESTAO_DECIDIDA",
      { herdeiro: nota.autor, motivo: aceitar ? undefined : motivoLimpo },
      nota.token,
    );
    return {
      ok: true,
      nota: {
        id: atualizada.id,
        autor: atualizada.autor,
        bemId: atualizada.bemId,
        tipo: atualizada.tipo,
        texto: atualizada.texto,
        valorSugerido: atualizada.valorSugerido,
        status: atualizada.status,
        motivo: atualizada.motivo,
        criadaEm: atualizada.createdAt.toISOString(),
      },
    };
  } catch {
    return { ok: false, erro: "Falha ao decidir — tente novamente." };
  }
}

/**
 * Decide uma despesa adiantada: reconhecida (com o TRATAMENTO que o motor de
 * cenários vai aplicar — ressarcir integral × compensar no quinhão) ou não
 * reconhecida com motivo.
 */
export async function decidirDespesa(
  despesaId: string,
  decisao: "reconhecida" | "nao_reconhecida",
  tratamento?: "ressarcir" | "compensar",
  motivo?: string,
): Promise<{ ok: boolean; despesa?: DespesaEspolio; erro?: string }> {
  if (!EH_SUCESSORISTA) return { ok: false, erro: "Recurso de outro site." };
  const eu = await usuarioLogado();
  if (!eu) return { ok: false, erro: "Sessão expirada — entre de novo." };
  const id = String(despesaId ?? "").slice(0, 80);
  if (!id) return { ok: false, erro: "Despesa sem identificação." };
  if (decisao !== "reconhecida" && decisao !== "nao_reconhecida") {
    return { ok: false, erro: "Decisão inválida." };
  }
  const motivoLimpo = String(motivo ?? "").trim().slice(0, 300);
  if (decisao === "nao_reconhecida" && motivoLimpo === "") {
    return { ok: false, erro: "Explique o motivo — o herdeiro vai ler." };
  }
  const trat = tratamento === "compensar" ? "compensar" : "ressarcir";
  try {
    const despesa = await prisma.espolioDespesa.findUnique({ where: { id } });
    if (!despesa) return { ok: false, erro: "Despesa não encontrada." };
    if (!(await podeGerirCaso(despesa.casoId, eu))) {
      return { ok: false, erro: "O painel deste caso é de outra conta." };
    }
    const atualizada = await prisma.espolioDespesa.update({
      where: { id },
      data: {
        status: decisao,
        tratamento: trat,
        motivo: motivoLimpo === "" ? null : motivoLimpo,
        decididaEm: new Date(),
      },
    });
    void registrarEventoPortal(
      despesa.casoId,
      "ESPOLIO_DESPESA_DECIDIDA",
      {
        herdeiro: despesa.autor,
        documento: despesa.descricao.slice(0, 160),
        motivo: decisao === "nao_reconhecida" ? motivoLimpo : undefined,
      },
      despesa.token,
    );
    return {
      ok: true,
      despesa: {
        id: atualizada.id,
        autor: atualizada.autor,
        herdeiroId: atualizada.herdeiroId,
        categoria: atualizada.categoria,
        valor: atualizada.valor,
        data: atualizada.data,
        descricao: atualizada.descricao,
        status: atualizada.status,
        motivo: atualizada.motivo,
        tratamento: atualizada.tratamento,
        criadaEm: atualizada.createdAt.toISOString(),
      },
    };
  } catch {
    return { ok: false, erro: "Falha ao decidir — tente novamente." };
  }
}

/* ------------------------------------------------------------------ */
/* Espaço do Espólio — cenários de divisão (simulador, Etapa 4)        */
/* ------------------------------------------------------------------ */

export interface AdesaoDoCenario {
  autor: string;
  resposta: string; // aceito | nao_aceito | conversar
  comentario: string | null;
  em: string;
  /** true = é a resposta MAIS RECENTE daquele herdeiro (a que vale). */
  atual: boolean;
}

export interface CenarioDoCaso {
  id: string;
  status: string; // proposto | congelado | retirado
  dados: CenarioCompartilhado;
  criadoEm: string;
  atualizadoEm: string;
  adesoes: AdesaoDoCenario[];
}

const TAMANHO_MAXIMO_CENARIO = 200_000;

/** Marca `atual` na resposta mais recente de cada token (append-only: mudar
 *  de ideia é linha nova; a mais recente vale). */
function marcarAtuais(
  linhas: { token: string; autor: string; resposta: string; comentario: string | null; createdAt: Date }[],
): AdesaoDoCenario[] {
  const ultimaPorToken = new Map<string, number>();
  linhas.forEach((l, i) => ultimaPorToken.set(l.token, i));
  return linhas.map((l, i) => ({
    autor: l.autor,
    resposta: l.resposta,
    comentario: l.comentario,
    em: l.createdAt.toISOString(),
    atual: ultimaPorToken.get(l.token) === i,
  }));
}

/** Cenários do caso com as adesões (para o card do advogado). */
export async function cenariosDoEspolio(
  casoId: string,
): Promise<{ ok: boolean; cenarios?: CenarioDoCaso[]; erro?: string }> {
  if (!EH_SUCESSORISTA) return { ok: false, erro: "Recurso de outro site." };
  const eu = await usuarioLogado();
  if (!eu) return { ok: false, erro: "Sessão expirada — entre de novo." };
  const id = String(casoId ?? "").slice(0, 80);
  if (!id) return { ok: false, erro: "Caso sem identificação." };
  try {
    if (!(await podeGerirCaso(id, eu))) {
      return { ok: false, erro: "O painel deste caso é de outra conta." };
    }
    const [cenarios, adesoes] = await Promise.all([
      prisma.espolioCenario.findMany({
        where: { casoId: id },
        orderBy: { createdAt: "asc" },
        take: 50,
      }),
      prisma.espolioAdesao.findMany({
        where: { casoId: id },
        orderBy: { createdAt: "asc" },
        take: 1000,
      }),
    ]);
    return {
      ok: true,
      cenarios: cenarios.map((c) => ({
        id: c.id,
        status: c.status,
        dados: c.dados as unknown as CenarioCompartilhado,
        criadoEm: c.createdAt.toISOString(),
        atualizadoEm: c.updatedAt.toISOString(),
        adesoes: marcarAtuais(adesoes.filter((a) => a.cenarioId === c.id)),
      })),
    };
  } catch {
    return { ok: false, erro: "Falha ao carregar os cenários." };
  }
}

/**
 * Cria ou atualiza um cenário proposto à família. O snapshot chega PRONTO do
 * navegador (montarCenarioCompartilhado — allowlist); aqui só se valida,
 * autoriza e grava. Cenário congelado não se edita (reabra antes); retirado
 * não volta — proponha um novo.
 */
export async function salvarCenario(dados: {
  casoId: string;
  cenarioId?: string;
  cenario: CenarioCompartilhado;
}): Promise<{ ok: boolean; cenarioId?: string; erro?: string }> {
  if (!EH_SUCESSORISTA) return { ok: false, erro: "Recurso de outro site." };
  const eu = await usuarioLogado();
  if (!eu) return { ok: false, erro: "Sessão expirada — entre de novo." };
  const casoId = String(dados.casoId ?? "").slice(0, 80);
  if (!casoId) return { ok: false, erro: "Caso sem identificação." };
  const titulo = String(dados.cenario?.titulo ?? "").trim();
  if (!titulo) return { ok: false, erro: "Dê um título ao cenário." };
  const snapshot = JSON.parse(JSON.stringify(dados.cenario)) as object;
  if (JSON.stringify(snapshot).length > TAMANHO_MAXIMO_CENARIO) {
    return { ok: false, erro: "Cenário grande demais para publicar." };
  }
  try {
    if (!(await podeGerirCaso(casoId, eu))) {
      return { ok: false, erro: "O painel deste caso é de outra conta." };
    }
    if (dados.cenarioId) {
      const existente = await prisma.espolioCenario.findUnique({
        where: { id: String(dados.cenarioId).slice(0, 80) },
      });
      if (!existente || existente.casoId !== casoId) {
        return { ok: false, erro: "Cenário não encontrado." };
      }
      if (existente.status !== "proposto") {
        return { ok: false, erro: "Cenário congelado ou retirado não se edita — reabra ou proponha um novo." };
      }
      await prisma.espolioCenario.update({
        where: { id: existente.id },
        data: { dados: snapshot },
      });
      return { ok: true, cenarioId: existente.id };
    }
    const criado = await prisma.espolioCenario.create({
      data: { casoId, dados: snapshot },
    });
    void registrarEventoPortal(casoId, "ESPOLIO_CENARIO", { cenario: titulo });
    return { ok: true, cenarioId: criado.id };
  } catch {
    return { ok: false, erro: "Falha ao salvar o cenário — tente novamente." };
  }
}

/** Retira um cenário da conversa (fica registrado; não volta a proposto). */
export async function retirarCenario(
  cenarioId: string,
): Promise<{ ok: boolean; erro?: string }> {
  if (!EH_SUCESSORISTA) return { ok: false, erro: "Recurso de outro site." };
  const eu = await usuarioLogado();
  if (!eu) return { ok: false, erro: "Sessão expirada — entre de novo." };
  const id = String(cenarioId ?? "").slice(0, 80);
  if (!id) return { ok: false, erro: "Cenário sem identificação." };
  try {
    const cenario = await prisma.espolioCenario.findUnique({ where: { id } });
    if (!cenario) return { ok: false, erro: "Cenário não encontrado." };
    if (!(await podeGerirCaso(cenario.casoId, eu))) {
      return { ok: false, erro: "O painel deste caso é de outra conta." };
    }
    await prisma.espolioCenario.update({ where: { id }, data: { status: "retirado" } });
    void registrarEventoPortal(cenario.casoId, "ESPOLIO_CENARIO_RETIRADO", {
      cenario: (cenario.dados as { titulo?: string } | null)?.titulo,
    });
    return { ok: true };
  } catch {
    return { ok: false, erro: "Falha ao retirar — tente novamente." };
  }
}

/**
 * Congela (consenso fechado — também vale para o consenso colhido fora do
 * portal) ou REABRE um cenário congelado. Congelado trava edição e novas
 * adesões.
 */
export async function congelarCenario(
  cenarioId: string,
  congelar: boolean,
): Promise<{ ok: boolean; erro?: string }> {
  if (!EH_SUCESSORISTA) return { ok: false, erro: "Recurso de outro site." };
  const eu = await usuarioLogado();
  if (!eu) return { ok: false, erro: "Sessão expirada — entre de novo." };
  const id = String(cenarioId ?? "").slice(0, 80);
  if (!id) return { ok: false, erro: "Cenário sem identificação." };
  try {
    const cenario = await prisma.espolioCenario.findUnique({ where: { id } });
    if (!cenario) return { ok: false, erro: "Cenário não encontrado." };
    if (cenario.status === "retirado") return { ok: false, erro: "Cenário retirado não reabre." };
    if (!(await podeGerirCaso(cenario.casoId, eu))) {
      return { ok: false, erro: "O painel deste caso é de outra conta." };
    }
    await prisma.espolioCenario.update({
      where: { id },
      data: { status: congelar ? "congelado" : "proposto" },
    });
    if (congelar) {
      void registrarEventoPortal(cenario.casoId, "ESPOLIO_CONSENSO", {
        cenario: (cenario.dados as { titulo?: string } | null)?.titulo,
      });
    }
    return { ok: true };
  } catch {
    return { ok: false, erro: "Falha ao alterar o cenário — tente novamente." };
  }
}

/* ------------------------------------------------------------------ */
/* Espaço do Espólio — votações formais (deliberação em duas etapas)   */
/* ------------------------------------------------------------------ */

export interface VotoDaVotacao {
  autor: string;
  opcaoId: string;
  comentario: string | null;
  em: string;
  /** true = o voto MAIS RECENTE daquele herdeiro (o que vale na apuração). */
  atual: boolean;
}

export interface VotacaoDoCaso {
  id: string;
  status: string; // aberta | encerrada
  dados: VotacaoDados;
  abertaEm: string;
  encerradaEm: string | null;
  votos: VotoDaVotacao[];
}

async function origemDaRequisicao(): Promise<string> {
  try {
    const h = await headers();
    const host = h.get("x-forwarded-host") ?? h.get("host") ?? "";
    const proto = h.get("x-forwarded-proto") ?? "https";
    return host ? `${proto}://${host}` : "";
  } catch {
    return "";
  }
}

function marcarVotosAtuais(
  linhas: { token: string; autor: string; opcaoId: string; comentario: string | null; createdAt: Date }[],
): VotoDaVotacao[] {
  const ultimaPorToken = new Map<string, number>();
  linhas.forEach((l, i) => ultimaPorToken.set(l.token, i));
  return linhas.map((l, i) => ({
    autor: l.autor,
    opcaoId: l.opcaoId,
    comentario: l.comentario,
    em: l.createdAt.toISOString(),
    atual: ultimaPorToken.get(l.token) === i,
  }));
}

/** Votações do caso com os votos (para o card e o termo em PDF). */
export async function votacoesDoEspolio(
  casoId: string,
): Promise<{ ok: boolean; votacoes?: VotacaoDoCaso[]; erro?: string }> {
  if (!EH_SUCESSORISTA) return { ok: false, erro: "Recurso de outro site." };
  const eu = await usuarioLogado();
  if (!eu) return { ok: false, erro: "Sessão expirada — entre de novo." };
  const id = String(casoId ?? "").slice(0, 80);
  if (!id) return { ok: false, erro: "Caso sem identificação." };
  try {
    if (!(await podeGerirCaso(id, eu))) {
      return { ok: false, erro: "O painel deste caso é de outra conta." };
    }
    const [votacoes, votos] = await Promise.all([
      prisma.espolioVotacao.findMany({
        where: { casoId: id },
        orderBy: { createdAt: "asc" },
        take: 50,
      }),
      prisma.espolioVoto.findMany({
        where: { casoId: id },
        orderBy: { createdAt: "asc" },
        take: 2000,
      }),
    ]);
    return {
      ok: true,
      votacoes: votacoes.map((v) => ({
        id: v.id,
        status: v.status,
        dados: v.dados as unknown as VotacaoDados,
        abertaEm: v.createdAt.toISOString(),
        encerradaEm: v.encerradaEm?.toISOString() ?? null,
        votos: marcarVotosAtuais(votos.filter((x) => x.votacaoId === v.id)),
      })),
    };
  } catch {
    return { ok: false, erro: "Falha ao carregar as votações." };
  }
}

/**
 * PRIMEIRA etapa da deliberação: abre a votação (pergunta + opções fechadas)
 * e avisa a família por e-mail (env-gated). A votação some do portal com o
 * espólio fechado; encerrada não reabre — deliberação nova é outra votação.
 */
export async function abrirVotacao(dados: {
  casoId: string;
  pergunta: string;
  descricao?: string;
  opcoes: string[];
  nomeFalecido?: string;
}): Promise<{ ok: boolean; votacaoId?: string; erro?: string }> {
  if (!EH_SUCESSORISTA) return { ok: false, erro: "Recurso de outro site." };
  const eu = await usuarioLogado();
  if (!eu) return { ok: false, erro: "Sessão expirada — entre de novo." };
  const casoId = String(dados.casoId ?? "").slice(0, 80);
  if (!casoId) return { ok: false, erro: "Caso sem identificação." };
  const pergunta = String(dados.pergunta ?? "").trim().slice(0, 300);
  if (!pergunta) return { ok: false, erro: "Escreva a pergunta da votação." };
  const opcoes = (Array.isArray(dados.opcoes) ? dados.opcoes : [])
    .map((o) => String(o ?? "").trim().slice(0, 200))
    .filter((o) => o !== "")
    .slice(0, 6);
  if (opcoes.length < 2) {
    return { ok: false, erro: "A votação precisa de ao menos duas opções." };
  }
  const descricao = String(dados.descricao ?? "").trim().slice(0, 600);
  try {
    if (!(await podeGerirCaso(casoId, eu))) {
      return { ok: false, erro: "O painel deste caso é de outra conta." };
    }
    const conteudo: VotacaoDados = {
      v: 1,
      pergunta,
      descricao: descricao === "" ? undefined : descricao,
      opcoes: opcoes.map((texto, i) => ({ id: `op-${i + 1}`, texto })),
    };
    const criada = await prisma.espolioVotacao.create({
      data: { casoId, dados: JSON.parse(JSON.stringify(conteudo)) as object },
    });
    void registrarEventoPortal(casoId, "ESPOLIO_VOTACAO_ABERTA", { votacao: pergunta });
    void notificarVotacao(
      casoId,
      String(dados.nomeFalecido ?? "").slice(0, 160),
      pergunta,
      "aberta",
      undefined,
      await origemDaRequisicao(),
    );
    return { ok: true, votacaoId: criada.id };
  } catch {
    return { ok: false, erro: "Falha ao abrir a votação — tente novamente." };
  }
}

/**
 * SEGUNDA etapa: encerra a votação, apura o resultado (voto mais recente de
 * cada herdeiro) e avisa a família por e-mail. Encerrada não reabre.
 */
export async function encerrarVotacao(
  votacaoId: string,
  nomeFalecido?: string,
): Promise<{ ok: boolean; votacao?: VotacaoDoCaso; erro?: string }> {
  if (!EH_SUCESSORISTA) return { ok: false, erro: "Recurso de outro site." };
  const eu = await usuarioLogado();
  if (!eu) return { ok: false, erro: "Sessão expirada — entre de novo." };
  const id = String(votacaoId ?? "").slice(0, 80);
  if (!id) return { ok: false, erro: "Votação sem identificação." };
  try {
    const votacao = await prisma.espolioVotacao.findUnique({ where: { id } });
    if (!votacao) return { ok: false, erro: "Votação não encontrada." };
    if (votacao.status !== "aberta") return { ok: false, erro: "Esta votação já foi encerrada." };
    if (!(await podeGerirCaso(votacao.casoId, eu))) {
      return { ok: false, erro: "O painel deste caso é de outra conta." };
    }
    const encerrada = await prisma.espolioVotacao.update({
      where: { id },
      data: { status: "encerrada", encerradaEm: new Date() },
    });
    const votos = marcarVotosAtuais(
      await prisma.espolioVoto.findMany({
        where: { votacaoId: id },
        orderBy: { createdAt: "asc" },
      }),
    );
    const conteudo = encerrada.dados as unknown as VotacaoDados;
    // Resultado leigo para o e-mail: contagem dos votos válidos por opção.
    const contagem = new Map<string, number>();
    for (const v of votos.filter((x) => x.atual)) {
      contagem.set(v.opcaoId, (contagem.get(v.opcaoId) ?? 0) + 1);
    }
    const resultado = conteudo.opcoes
      .map((o) => `"${o.texto}": ${contagem.get(o.id) ?? 0} voto(s)`)
      .join("; ");
    void registrarEventoPortal(votacao.casoId, "ESPOLIO_VOTACAO_ENCERRADA", {
      votacao: conteudo.pergunta,
    });
    void notificarVotacao(
      votacao.casoId,
      String(nomeFalecido ?? "").slice(0, 160),
      conteudo.pergunta,
      "encerrada",
      resultado,
      await origemDaRequisicao(),
    );
    return {
      ok: true,
      votacao: {
        id: encerrada.id,
        status: encerrada.status,
        dados: conteudo,
        abertaEm: encerrada.createdAt.toISOString(),
        encerradaEm: encerrada.encerradaEm?.toISOString() ?? null,
        votos,
      },
    };
  } catch {
    return { ok: false, erro: "Falha ao encerrar a votação — tente novamente." };
  }
}

/* ------------------------------------------------------------------ */
/* Espaço do Espólio — mural moderado + resumo por e-mail (digest)     */
/* ------------------------------------------------------------------ */

export interface MensagemMural {
  id: string;
  autor: string;
  texto: string;
  status: string; // pendente | aprovada | recusada
  motivo: string | null;
  criadaEm: string;
}

/** Mensagens do mural (todas — o card modera as pendentes). */
export async function muralDoEspolio(
  casoId: string,
): Promise<{ ok: boolean; mensagens?: MensagemMural[]; erro?: string }> {
  if (!EH_SUCESSORISTA) return { ok: false, erro: "Recurso de outro site." };
  const eu = await usuarioLogado();
  if (!eu) return { ok: false, erro: "Sessão expirada — entre de novo." };
  const id = String(casoId ?? "").slice(0, 80);
  if (!id) return { ok: false, erro: "Caso sem identificação." };
  try {
    if (!(await podeGerirCaso(id, eu))) {
      return { ok: false, erro: "O painel deste caso é de outra conta." };
    }
    const linhas = await prisma.espolioMural.findMany({
      where: { casoId: id },
      orderBy: { createdAt: "asc" },
      take: 300,
    });
    return {
      ok: true,
      mensagens: linhas.map((m) => ({
        id: m.id,
        autor: m.autor,
        texto: m.texto,
        status: m.status,
        motivo: m.motivo,
        criadaEm: m.createdAt.toISOString(),
      })),
    };
  } catch {
    return { ok: false, erro: "Falha ao carregar o mural." };
  }
}

/**
 * Moderação prévia do mural: aprovar publica para a família inteira;
 * recusar exige motivo (o autor lê). A mensagem em si é imutável.
 */
export async function moderarMural(
  mensagemId: string,
  aprovar: boolean,
  motivo?: string,
): Promise<{ ok: boolean; mensagem?: MensagemMural; erro?: string }> {
  if (!EH_SUCESSORISTA) return { ok: false, erro: "Recurso de outro site." };
  const eu = await usuarioLogado();
  if (!eu) return { ok: false, erro: "Sessão expirada — entre de novo." };
  const id = String(mensagemId ?? "").slice(0, 80);
  if (!id) return { ok: false, erro: "Mensagem sem identificação." };
  const motivoLimpo = String(motivo ?? "").trim().slice(0, 300);
  if (!aprovar && motivoLimpo === "") {
    return { ok: false, erro: "Explique o motivo — o autor vai ler." };
  }
  try {
    const mensagem = await prisma.espolioMural.findUnique({ where: { id } });
    if (!mensagem) return { ok: false, erro: "Mensagem não encontrada." };
    if (!(await podeGerirCaso(mensagem.casoId, eu))) {
      return { ok: false, erro: "O painel deste caso é de outra conta." };
    }
    const atualizada = await prisma.espolioMural.update({
      where: { id },
      data: {
        status: aprovar ? "aprovada" : "recusada",
        motivo: motivoLimpo === "" ? null : motivoLimpo,
        decididaEm: new Date(),
      },
    });
    void registrarEventoPortal(
      mensagem.casoId,
      "ESPOLIO_MURAL_MODERADA",
      { herdeiro: mensagem.autor, motivo: aprovar ? undefined : motivoLimpo },
      mensagem.token,
    );
    return {
      ok: true,
      mensagem: {
        id: atualizada.id,
        autor: atualizada.autor,
        texto: atualizada.texto,
        status: atualizada.status,
        motivo: atualizada.motivo,
        criadaEm: atualizada.createdAt.toISOString(),
      },
    };
  } catch {
    return { ok: false, erro: "Falha ao moderar — tente novamente." };
  }
}

/**
 * RESUMO por e-mail (digest) com um clique: compila os marcos do CASO
 * INTEIRO (eventos visíveis ao herdeiro e SEM token — conteúdo idêntico
 * para todos) desde o último resumo e envia à família. O envio vira o
 * evento ESPOLIO_DIGEST — o marco do próximo período.
 */
export async function enviarDigest(
  casoId: string,
  nomeFalecido: string,
): Promise<{ ok: boolean; itens?: number; enviados?: number; erro?: string }> {
  if (!EH_SUCESSORISTA) return { ok: false, erro: "Recurso de outro site." };
  const eu = await usuarioLogado();
  if (!eu) return { ok: false, erro: "Sessão expirada — entre de novo." };
  const id = String(casoId ?? "").slice(0, 80);
  if (!id) return { ok: false, erro: "Caso sem identificação." };
  try {
    if (!(await podeGerirCaso(id, eu))) {
      return { ok: false, erro: "O painel deste caso é de outra conta." };
    }
    const ultimoDigest = await prisma.portalEvento.findFirst({
      where: { casoId: id, tipo: "ESPOLIO_DIGEST" },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    });
    const eventos = await prisma.portalEvento.findMany({
      where: {
        casoId: id,
        tipo: { in: TIPOS_VISIVEIS_AO_HERDEIRO },
        token: null,
        ...(ultimoDigest ? { createdAt: { gt: ultimoDigest.createdAt } } : {}),
      },
      orderBy: { createdAt: "asc" },
      take: 30,
      select: { tipo: true, detalhe: true, createdAt: true },
    });
    const itens = eventos
      .map((e) => ({
        data: e.createdAt.toLocaleDateString("pt-BR"),
        texto: textoLeigoDoEvento(e.tipo, (e.detalhe as DetalheEventoPortal | null) ?? null),
      }))
      .filter((i): i is { data: string; texto: string } => i.texto !== null);
    if (itens.length === 0) {
      return { ok: false, erro: "Nada novo desde o último resumo — não há o que enviar." };
    }
    const enviados = await notificarDigest(id, nomeFalecido, itens, await origemDaRequisicao());
    if (enviados === 0) {
      return {
        ok: false,
        erro: "Nenhum e-mail pôde ser enviado — confira a RESEND_API_KEY e os e-mails salvos dos herdeiros.",
      };
    }
    void registrarEventoPortal(id, "ESPOLIO_DIGEST", { convites: enviados });
    return { ok: true, itens: itens.length, enviados };
  } catch {
    return { ok: false, erro: "Falha ao enviar o resumo — tente novamente." };
  }
}

export interface EventoDoCaso {
  quando: string;
  tipo: string;
  token: string | null;
  detalhe: DetalheEventoPortal | null;
}

/**
 * Registro de atendimento completo do caso — alimenta o "Relatório de
 * comunicação com a família" (PDF montado no navegador do advogado).
 * Autorização: dono do espelho (ou colega de equipe); sem espelho publicado,
 * qualquer conta logada do site — a mesma régua da emissão de convites.
 */
export async function eventosDoCaso(
  casoId: string,
): Promise<{ ok: boolean; eventos?: EventoDoCaso[]; erro?: string }> {
  if (!EH_SUCESSORISTA) return { ok: false, erro: "Recurso de outro site." };
  const eu = await usuarioLogado();
  if (!eu) return { ok: false, erro: "Sessão expirada — entre de novo." };
  const id = String(casoId ?? "").slice(0, 80);
  if (!id) return { ok: false, erro: "Caso sem identificação." };

  try {
    const painel = await prisma.portalPainel.findUnique({
      where: { casoId: id },
      select: { userId: true },
    });
    if (painel && !(await podeGerir(painel.userId, eu))) {
      return { ok: false, erro: "O painel deste caso é de outra conta." };
    }
    const linhas = await prisma.portalEvento.findMany({
      where: { casoId: id },
      orderBy: { createdAt: "asc" },
      take: 500,
      select: { createdAt: true, tipo: true, token: true, detalhe: true },
    });
    return {
      ok: true,
      eventos: linhas.map((l) => ({
        quando: l.createdAt.toISOString(),
        tipo: l.tipo,
        token: l.token,
        detalhe: (l.detalhe as DetalheEventoPortal | null) ?? null,
      })),
    };
  } catch {
    return { ok: false, erro: "Falha ao carregar o registro — tente novamente." };
  }
}
