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
import { ehTextoCru, ementaDoDocumento, origemDoProcesso } from '@/lib/jurimetria/origem';
import { prisma } from '@/lib/prisma';

type Falha = { ok: false; erro: string };

async function sessaoValida(): Promise<boolean> {
  if (!EH_SUCESSORISTA) return false;
  const session = await auth();
  return Boolean(session?.user?.id);
}

export interface ExigenciaPublica {
  texto: string;
  /** Resumo determinístico do documento de origem (classe/vara/comarca). */
  ementa: string | null;
  numeroProcesso: string | null;
  /** Consulta de julgados do e-SAJ filtrada pelo número — abre a sentença. */
  linkSentenca: string | null;
  /** Consulta processual pública do e-SAJ (CPOPG). */
  linkProcesso: string | null;
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
  /**
   * Placar das dúvidas JULGADAS no recorte: exigência afastada = dúvida
   * improcedente = êxito do apresentante; mantida = procedente. O resto
   * (notas devolutivas, orientações) fica em semJulgamento.
   */
  porResultado: {
    mantidas: number;
    afastadas: number;
    parciais: number;
    semJulgamento: number;
  };
  /**
   * "Antes de protocolar": as exigências RECORRENTES do recorte, agrupadas
   * por semelhança e ordenadas por frequência — o checklist de adequação.
   */
  dicas: { texto: string; n: number }[];
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
  /** true = SÓ as exigências ainda sem tema (a linha "Ainda sem tema" da lista). */
  semTema?: boolean;
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
    ...(entrada.semTema ? { temaId: null } : filtroTemas ? { temaId: { in: filtroTemas } } : {}),
  };

  const [total, gruposTema, gruposCartorio, gruposResultado, linhas] = await Promise.all([
    prisma.exigencia.count({ where }),
    prisma.exigencia.groupBy({ by: ['temaId'], where, _count: { _all: true } }),
    prisma.exigencia.groupBy({ by: ['cartorioId'], where, _count: { _all: true } }),
    prisma.exigencia.groupBy({ by: ['resultado'], where, _count: { _all: true } }),
    prisma.exigencia.findMany({
      where,
      orderBy: { dataExigencia: 'desc' },
      take: 30,
      include: {
        cartorio: { select: { nome: true } },
        tema: { select: { rotulo: true } },
        documento: {
          select: { urlOrigem: true, textoAnonimizado: true, fonte: { select: { nome: true } } },
        },
      },
    }),
  ]);

  // "Antes de protocolar": agrupa as exigências do recorte por semelhança
  // (chave = primeiras palavras significativas, sem acento) e devolve as
  // mais recorrentes — o checklist de adequação prévia.
  const paraDicas = await prisma.exigencia.findMany({
    where,
    select: { textoNormalizado: true },
    orderBy: { dataExigencia: 'desc' },
    take: 300,
  });
  const grupos = new Map<string, { texto: string; n: number }>();
  for (const { textoNormalizado } of paraDicas) {
    if (ehTextoCru(textoNormalizado)) continue;
    const chave = textoNormalizado
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((p) => p.length > 2)
      .slice(0, 6)
      .join(' ');
    if (chave.length < 10) continue;
    const g = grupos.get(chave);
    if (g) g.n++;
    else grupos.set(chave, { texto: textoNormalizado, n: 1 });
  }
  const dicas = [...grupos.values()].sort((a, b) => b.n - a.n).slice(0, 8);

  const [temas, cartorios] = await Promise.all([
    prisma.temaRegistral.findMany({ select: { id: true, rotulo: true } }),
    prisma.cartorio.findMany({ select: { id: true, nome: true } }),
  ]);
  const rotuloTema = new Map(temas.map((t) => [t.id, t.rotulo]));
  const nomeCartorio = new Map(cartorios.map((c) => [c.id, c.nome]));

  const nResultado = (r: string) =>
    gruposResultado.find((g) => g.resultado === r)?._count._all ?? 0;
  const julgadas =
    nResultado('mantida') + nResultado('afastada') + nResultado('parcial');

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
    porResultado: {
      mantidas: nResultado('mantida'),
      afastadas: nResultado('afastada'),
      parciais: nResultado('parcial'),
      semJulgamento: total - julgadas,
    },
    dicas,
    exigencias: linhas.map((e) => {
      const origem = origemDoProcesso(e.documento.urlOrigem);
      const ementa = ementaDoDocumento(e.documento.textoAnonimizado ?? '');
      return {
        // Texto cru (fallback antigo) nunca chega à tela — vale a ementa.
        texto: ehTextoCru(e.textoNormalizado) ? (ementa ?? e.textoNormalizado) : e.textoNormalizado,
        ementa,
        numeroProcesso: origem.numeroCNJ,
        linkSentenca: origem.linkSentenca,
        linkProcesso: origem.linkProcesso,
        fundamentacao: e.fundamentacao,
        resultado: e.resultado,
        dataExigencia: e.dataExigencia.toISOString().slice(0, 10),
        cartorioId: e.cartorioId,
        cartorioNome: e.cartorio?.nome ?? '(cartório não identificado)',
        temaId: e.temaId,
        temaRotulo: e.tema?.rotulo ?? null,
        fonteNome: e.documento.fonte.nome,
      };
    }),
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

/**
 * Catálogo para os filtros e para o resolvedor local de cartório. Os temas
 * saem em ORDEM ALFABÉTICA e cada um leva a contagem do que está publicado
 * nele — é o que alimenta a lista recolhida da tela de consulta.
 */
export async function catalogoJurimetria(): Promise<
  | Falha
  | {
      ok: true;
      cartorios: { id: string; nome: string; aliases: string[] }[];
      temas: { id: string; rotulo: string; n: number }[];
      totalPublicado: number;
      /** Publicadas ainda sem tema — a linha extra da lista da consulta. */
      semTema: number;
    }
> {
  if (!(await sessaoValida())) return { ok: false, erro: 'Sessão expirada — entre de novo.' };
  const [cartorios, temas, grupos] = await Promise.all([
    prisma.cartorio.findMany({
      orderBy: { nome: 'asc' },
      select: { id: true, nome: true, aliases: true },
    }),
    prisma.temaRegistral.findMany({ orderBy: { rotulo: 'asc' }, select: { id: true, rotulo: true } }),
    prisma.exigencia.groupBy({
      by: ['temaId'],
      where: { publicado: true, duplicataDe: null },
      _count: { _all: true },
    }),
  ]);
  const contagem = new Map(grupos.map((g) => [g.temaId, g._count._all]));
  return {
    ok: true,
    cartorios,
    temas: temas.map((t) => ({ ...t, n: contagem.get(t.id) ?? 0 })),
    totalPublicado: grupos.reduce((s, g) => s + g._count._all, 0),
    semTema: grupos.find((g) => g.temaId === null)?._count._all ?? 0,
  };
}
