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

import { createHash } from 'node:crypto';

import { auth } from '@/lib/auth';
import { EH_SUCESSORISTA } from '@/lib/app';
import { anonimizar } from '@/lib/jurimetria/anonimizar';
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
  cartorioId: string | null;
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

  // Sem filtro de cartório o recorte traz TUDO que está publicado —
  // inclusive exigências ainda sem cartório resolvido (aparecem rotuladas).
  const where = {
    publicado: true,
    duplicataDe: null,
    ...(cartorioId ? { cartorioId } : {}),
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
      cartorioId: e.cartorioId,
      cartorioNome: e.cartorio?.nome ?? '(cartório não identificado)',
      temaId: e.temaId,
      temaRotulo: e.tema?.rotulo ?? null,
      fonteNome: e.documento.fonte.nome,
    })),
  };
}

/**
 * CONTRIBUIÇÃO da nota devolutiva (Camada B): o navegador manda o texto JÁ
 * ANONIMIZADO (o entregável — decomposição + PDF — é local e independe
 * disto). O servidor anonimiza DE NOVO (defesa em profundidade), deduplica
 * por hash e enfileira para o worker diário: extração, dedupe por trigram e
 * fila de revisão seguem o MESMO pipeline das fontes públicas — nada é
 * publicado sem os critérios de confiança/revisão.
 */
export async function contribuirNota(entrada: {
  texto: string;
  cartorioId?: string | null;
}): Promise<{ ok: true; recebida: boolean } | Falha> {
  if (!(await sessaoValida())) return { ok: false, erro: 'Sessão expirada — entre de novo.' };
  const bruto = String(entrada.texto ?? '').slice(0, 60_000);
  if (bruto.trim().length < 120)
    return { ok: false, erro: 'Texto curto demais para contribuir.' };

  const { texto } = anonimizar(bruto);
  const hash = createHash('sha256').update(texto).digest('hex');
  const jaTem = await prisma.documentoJurimetria.findUnique({ where: { hashConteudo: hash } });
  if (jaTem) return { ok: true, recebida: false };

  const cartorioId =
    typeof entrada.cartorioId === 'string' && /^[a-z0-9-]{2,40}$/.test(entrada.cartorioId)
      ? entrada.cartorioId
      : null;
  const doc = await prisma.documentoJurimetria.create({
    data: {
      fonteId: 'fonte-usuarios',
      urlOrigem: cartorioId ? `usuario:${cartorioId}` : null,
      hashConteudo: hash,
      mime: 'text/plain',
      textoAnonimizado: texto,
      dataDocumento: new Date(),
      status: 'anonimizado',
      versaoExtrator: 'contribuicao-usuario-v1',
    },
  });
  await prisma.jobJurimetria.create({
    data: { tipo: 'processar_documento', payload: { documentoId: doc.id } },
  });
  return { ok: true, recebida: true };
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
