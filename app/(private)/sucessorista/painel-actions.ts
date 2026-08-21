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

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { EH_SUCESSORISTA } from "@/lib/app";
import type { PainelHerdeiro, VisibilidadePainel } from "@/lib/portal/painel";
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
  if (JSON.stringify(snapshot).length > TAMANHO_MAXIMO) {
    return { publicado: false, erro: "Espelho grande demais para publicar." };
  }

  try {
    const existente = await prisma.portalPainel.findUnique({
      where: { casoId },
      select: { userId: true, snapshot: true, visibilidade: true },
    });
    if (existente && !(await podeGerir(existente.userId, eu))) {
      return { publicado: false, erro: "Este painel foi publicado por outra conta." };
    }
    const linha = await prisma.portalPainel.upsert({
      where: { casoId },
      create: { casoId, userId: eu.id, snapshot, visibilidade },
      update: { snapshot, visibilidade },
    });
    void registrarEventoPortal(casoId, "PUBLICACAO", { convites: tokens.length });
    // Marcos do caso para o histórico do herdeiro: a FASE mudou entre as
    // publicações, e o quinhão saiu de fechado para LIBERADO.
    const faseNova = faseDoSnapshot(snapshot);
    const faseAnterior = existente ? faseDoSnapshot(existente.snapshot) : null;
    if (faseNova && faseNova !== faseAnterior) {
      void registrarEventoPortal(casoId, "FASE", { fase: faseNova });
    }
    const quinhaoAntes = Boolean(
      (existente?.visibilidade as VisibilidadePainel | null)?.quinhao,
    );
    if (dados.visibilidade?.quinhao && !quinhaoAntes && existente) {
      void registrarEventoPortal(casoId, "QUINHAO_LIBERADO");
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
      // quem apaga o histórico — "apagar tudo do servidor" inclui os eventos.
      prisma.portalEvento.deleteMany({ where: { casoId: id } }),
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
