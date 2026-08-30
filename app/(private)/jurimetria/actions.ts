'use server';

/**
 * Jurimetria Registral — actions da CONSULTA (produto LexCausa).
 *
 * O que sai daqui é sempre HISTÓRICO de entendimentos publicados e revisados
 * (exigência registrada em…, frequência observada) — nunca previsão ou
 * garantia; o disclaimer é fixo nas telas. Fronteira de dados do modo
 * "arrastar o título": o documento é lido NO NAVEGADOR e para cá vem só a
 * estrutura (cartório + tipo de ato + ids de tema) — nenhum conteúdo.
 */

import { auth } from '@/lib/auth';
import { EH_SUCESSORISTA } from '@/lib/app';
import { prisma } from '@/lib/prisma';

type Falha = { ok: false; erro: string };

async function sessaoValida(): Promise<boolean> {
  if (!EH_SUCESSORISTA) return false;
  const session = await auth();
  return Boolean(session?.user?.id);
}

export interface ExigenciaPublica {
  texto: string;
  fundamentacao: string[];
  resultado: string | null;
  dataExigencia: string;
  cartorioId: string;
  cartorioNome: string;
  temaId: string | null;
  temaRotulo: string | null;
  fonteNome: string;
}

export interface HistoricoJurimetria {
  ok: true;
  total: number;
  porTema: { temaId: string | null; rotulo: string; n: number }[];
  porCartorio: { cartorioId: string; nome: string; n: number }[];
  exigencias: ExigenciaPublica[];
}

/**
 * Consulta o histórico publicado, filtrado por cartório e/ou temas.
 * `temas` vem da detecção local no navegador (modo título) ou dos filtros
 * clicados (modo navegação) — sempre validados contra o catálogo.
 */
export async function consultarJurimetria(entrada: {
  cartorioId?: string | null;
  temas?: string[];
}): Promise<HistoricoJurimetria | Falha> {
  if (!(await sessaoValida())) return { ok: false, erro: 'Sessão expirada — entre de novo.' };

  const cartorioId =
    typeof entrada.cartorioId === 'string' && /^[a-z0-9-]{2,40}$/.test(entrada.cartorioId)
      ? entrada.cartorioId
      : null;
  const temasValidos = (
    await prisma.temaRegistral.findMany({ select: { id: true, rotulo: true } })
  ).filter((t) => (entrada.temas ?? []).includes(t.id));
  const filtroTemas = temasValidos.length > 0 ? temasValidos.map((t) => t.id) : null;

  const where = {
    publicado: true,
    duplicataDe: null,
    ...(cartorioId ? { cartorioId } : { cartorioId: { not: null } }),
    ...(filtroTemas ? { temaId: { in: filtroTemas } } : {}),
  };

  const [total, gruposTema, gruposCartorio, linhas] = await Promise.all([
    prisma.exigencia.count({ where }),
    prisma.exigencia.groupBy({ by: ['temaId'], where, _count: { _all: true } }),
    prisma.exigencia.groupBy({ by: ['cartorioId'], where, _count: { _all: true } }),
    prisma.exigencia.findMany({
      where,
      orderBy: { dataExigencia: 'desc' },
      take: 30,
      include: {
        cartorio: { select: { nome: true } },
        tema: { select: { rotulo: true } },
        documento: { select: { fonte: { select: { nome: true } } } },
      },
    }),
  ]);

  const [temas, cartorios] = await Promise.all([
    prisma.temaRegistral.findMany({ select: { id: true, rotulo: true } }),
    prisma.cartorio.findMany({ select: { id: true, nome: true } }),
  ]);
  const rotuloTema = new Map(temas.map((t) => [t.id, t.rotulo]));
  const nomeCartorio = new Map(cartorios.map((c) => [c.id, c.nome]));

  return {
    ok: true,
    total,
    porTema: gruposTema
      .map((g) => ({
        temaId: g.temaId,
        rotulo: g.temaId ? (rotuloTema.get(g.temaId) ?? g.temaId) : '(sem tema)',
        n: g._count._all,
      }))
      .sort((a, b) => b.n - a.n),
    porCartorio: gruposCartorio
      .filter((g) => g.cartorioId)
      .map((g) => ({
        cartorioId: g.cartorioId as string,
        nome: nomeCartorio.get(g.cartorioId as string) ?? (g.cartorioId as string),
        n: g._count._all,
      }))
      .sort((a, b) => b.n - a.n),
    exigencias: linhas.map((e) => ({
      texto: e.textoNormalizado,
      fundamentacao: e.fundamentacao,
      resultado: e.resultado,
      dataExigencia: e.dataExigencia.toISOString().slice(0, 10),
      cartorioId: e.cartorioId as string,
      cartorioNome: e.cartorio?.nome ?? '',
      temaId: e.temaId,
      temaRotulo: e.tema?.rotulo ?? null,
      fonteNome: e.documento.fonte.nome,
    })),
  };
}

/** Catálogo para os filtros e para o resolvedor local de cartório. */
export async function catalogoJurimetria(): Promise<
  | Falha
  | {
      ok: true;
      cartorios: { id: string; nome: string; aliases: string[] }[];
      temas: { id: string; rotulo: string }[];
    }
> {
  if (!(await sessaoValida())) return { ok: false, erro: 'Sessão expirada — entre de novo.' };
  const [cartorios, temas] = await Promise.all([
    prisma.cartorio.findMany({
      orderBy: { nome: 'asc' },
      select: { id: true, nome: true, aliases: true },
    }),
    prisma.temaRegistral.findMany({ orderBy: { rotulo: 'asc' }, select: { id: true, rotulo: true } }),
  ]);
  return { ok: true, cartorios, temas };
}
