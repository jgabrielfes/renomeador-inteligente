'use server';

/**
 * Correspondentes de sucessões (camada 4, pilar B) — server actions.
 *
 * Regras duras: aparecer nas buscas exige o SELO (OAB aprovada + quiz da
 * camada 3) e perfil ATIVO; a ordem é NEUTRA (motor puro — nunca preço ou
 * nota); o correspondente só alcança a PASTA da diligência; o combinado de
 * valores fica no termo de referência, ENTRE os advogados — a plataforma
 * não processa pagamento. Nota agregada só para ASSINANTES logados.
 */

import { auth, isMaster } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { EH_SUCESSORISTA } from '@/lib/app';
import { buscarMunicipios, municipioPorIbge, type Municipio } from '@/lib/rede/municipios';
import {
  conteudoDaPasta,
  mediaAgregada,
  ROTULO_TIPO_DILIGENCIA,
  type AvaliacaoCriterios,
} from '@/lib/rede/diligencias';

type Falha = { ok: false; erro: string };

async function contexto(): Promise<{ userId: string; master: boolean } | null> {
  if (!EH_SUCESSORISTA) return null;
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return null;
  return { userId, master: isMaster(session) };
}

async function temSelo(userId: string): Promise<boolean> {
  const p = await prisma.advogadoPerfil.findUnique({ where: { userId } });
  return p !== null && p.situacao === 'aprovado' && p.quizAprovadoEm !== null;
}

async function ehAssinante(userId: string): Promise<boolean> {
  return (await prisma.radarAssinatura.count({ where: { userId } })) > 0;
}

/** Autocomplete de comarcas — a base fica no servidor, nunca no bundle. */
export async function buscarComarcas(q: string): Promise<Municipio[]> {
  const ctx = await contexto();
  if (!ctx) return [];
  return buscarMunicipios(String(q ?? '').slice(0, 60));
}

/* ------------------------------------------------------------------ */
/* B1 — perfil de correspondente                                       */
/* ------------------------------------------------------------------ */

export interface PerfilCorrespondente {
  comarcas: Municipio[];
  tipos: string[];
  prazoMedioDias: number;
  raioKm: number;
  ativo: boolean;
}

export async function estadoCorrespondente(): Promise<{
  ok: boolean;
  selo?: boolean;
  assinante?: boolean;
  perfil?: PerfilCorrespondente | null;
  historico?: { concluidas: number; comarcasAtendidas: number; media: number | null };
  erro?: string;
}> {
  const ctx = await contexto();
  if (!ctx) return { ok: false, erro: 'Sessão inválida.' };
  try {
    const [selo, assinante, linha] = await Promise.all([
      temSelo(ctx.userId),
      ehAssinante(ctx.userId),
      prisma.correspondentePerfil.findUnique({ where: { userId: ctx.userId } }),
    ]);
    const comarcas = (Array.isArray(linha?.comarcas) ? (linha.comarcas as number[]) : [])
      .map((c) => municipioPorIbge(c))
      .filter((m): m is Municipio => m !== null);
    const historico = await historicoDoUsuario(ctx.userId, true);
    return {
      ok: true,
      selo: selo || ctx.master,
      assinante: assinante || ctx.master,
      perfil: linha
        ? {
            comarcas,
            tipos: Array.isArray(linha.tipos) ? (linha.tipos as string[]) : [],
            prazoMedioDias: linha.prazoMedioDias,
            raioKm: linha.raioKm,
            ativo: linha.ativo,
          }
        : null,
      historico,
    };
  } catch {
    return { ok: false, erro: 'Não foi possível carregar o perfil.' };
  }
}

export async function salvarPerfilCorrespondente(perfil: {
  comarcas: number[];
  tipos: string[];
  prazoMedioDias: number;
  raioKm: number;
  ativo: boolean;
}): Promise<{ ok: boolean; erro?: string }> {
  const ctx = await contexto();
  if (!ctx) return { ok: false, erro: 'Sessão inválida.' };
  try {
    if (!ctx.master && !(await temSelo(ctx.userId))) {
      return { ok: false, erro: 'Atuar como correspondente exige a OAB verificada e o questionário do Radar (selo).' };
    }
    const comarcas = [...new Set(perfil.comarcas)]
      .filter((c) => municipioPorIbge(Number(c)) !== null)
      .slice(0, 60);
    const tipos = perfil.tipos.filter((t) => t in ROTULO_TIPO_DILIGENCIA).slice(0, 10);
    if (comarcas.length === 0) return { ok: false, erro: 'Escolha ao menos uma comarca.' };
    if (tipos.length === 0) return { ok: false, erro: 'Escolha ao menos um tipo de diligência.' };
    const prazo = Math.min(60, Math.max(1, Math.round(Number(perfil.prazoMedioDias) || 5)));
    const raio = Math.min(500, Math.max(0, Math.round(Number(perfil.raioKm) || 0)));
    await prisma.correspondentePerfil.upsert({
      where: { userId: ctx.userId },
      update: { comarcas, tipos, prazoMedioDias: prazo, raioKm: raio, ativo: perfil.ativo === true },
      create: { userId: ctx.userId, comarcas, tipos, prazoMedioDias: prazo, raioKm: raio, ativo: perfil.ativo === true },
    });
    return { ok: true };
  } catch {
    return { ok: false, erro: 'Não foi possível salvar o perfil.' };
  }
}

async function historicoDoUsuario(userId: string, comMedia: boolean) {
  const concluidas = await prisma.diligencia.findMany({
    where: { correspondenteUserId: userId, status: 'concluida' },
    select: { comarcaIbge: true, prazoEm: true, updatedAt: true, justificativaAtraso: true },
  });
  let media: number | null = null;
  if (comMedia) {
    const avaliacoes = await prisma.diligenciaAvaliacao.findMany({
      where: { avaliadoUserId: userId },
      select: { criterios: true },
    });
    const atrasos = concluidas.filter(
      (d) => d.prazoEm && d.updatedAt > d.prazoEm && !d.justificativaAtraso,
    ).length;
    media = mediaAgregada(
      avaliacoes.map((a) => a.criterios as unknown as AvaliacaoCriterios),
      atrasos,
      concluidas.length,
    );
  }
  return {
    concluidas: concluidas.length,
    comarcasAtendidas: new Set(concluidas.map((d) => d.comarcaIbge)).size,
    media,
  };
}

/* ------------------------------------------------------------------ */
/* B2 — solicitações, ofertas e termo de referência                    */
/* ------------------------------------------------------------------ */

export interface DiligenciaResumo {
  id: string;
  casoId: string | null;
  municipio: string;
  uf: string;
  tipo: string;
  descricao: string;
  prazoEm: string | null;
  status: string;
  criadaEm: string;
  ofertas: number;
  jaOfertei?: boolean;
  souSolicitante: boolean;
  termo?: { escopo: string; prazo: string; valor: string; confirmadoEm?: string } | null;
  correspondente?: { nome: string; oab: string } | null;
  solicitante?: { nome: string } | null;
  justificativaAtraso?: string | null;
  minhaAvaliacaoFeita?: boolean;
}

function paraResumo(
  d: {
    id: string; casoId: string | null; municipio: string; uf: string; tipo: string;
    descricao: string; prazoEm: Date | null; status: string; createdAt: Date;
    solicitanteUserId: string; correspondenteUserId: string | null;
    termoJson: unknown; justificativaAtraso: string | null;
  },
  eu: string,
  extras: Partial<DiligenciaResumo> = {},
): DiligenciaResumo {
  return {
    id: d.id,
    casoId: d.casoId,
    municipio: d.municipio,
    uf: d.uf,
    tipo: d.tipo,
    descricao: d.descricao,
    prazoEm: d.prazoEm ? d.prazoEm.toISOString().slice(0, 10) : null,
    status: d.status,
    criadaEm: d.createdAt.toISOString().slice(0, 10),
    ofertas: 0,
    souSolicitante: d.solicitanteUserId === eu,
    termo: (d.termoJson as DiligenciaResumo['termo']) ?? null,
    justificativaAtraso: d.justificativaAtraso,
    ...extras,
  };
}

/** Minhas diligências — como SOLICITANTE e como CORRESPONDENTE. */
export async function minhasDiligencias(): Promise<
  { ok: true; solicitadas: DiligenciaResumo[]; aceitas: DiligenciaResumo[] } | Falha
> {
  const ctx = await contexto();
  if (!ctx) return { ok: false, erro: 'Sessão inválida.' };
  try {
    const [solicitadas, aceitas, contagens, avaliacoesMinhas] = await Promise.all([
      prisma.diligencia.findMany({
        where: { solicitanteUserId: ctx.userId },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
      prisma.diligencia.findMany({
        where: { correspondenteUserId: ctx.userId },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
      prisma.diligenciaOferta.groupBy({ by: ['diligenciaId'], _count: { _all: true } }),
      prisma.diligenciaAvaliacao.findMany({
        where: { avaliadorUserId: ctx.userId },
        select: { diligenciaId: true },
      }),
    ]);
    const ofertasPor = new Map(contagens.map((c) => [c.diligenciaId, c._count._all]));
    const avaliei = new Set(avaliacoesMinhas.map((a) => a.diligenciaId));
    const idsCorrespondentes = [
      ...new Set(solicitadas.map((d) => d.correspondenteUserId).filter((x): x is string => !!x)),
    ];
    const idsSolicitantes = [...new Set(aceitas.map((d) => d.solicitanteUserId))];
    const [usuarios, perfis] = await Promise.all([
      prisma.user.findMany({
        where: { id: { in: [...idsCorrespondentes, ...idsSolicitantes] } },
        select: { id: true, name: true },
      }),
      prisma.advogadoPerfil.findMany({ where: { userId: { in: idsCorrespondentes } } }),
    ]);
    const nomePor = new Map(usuarios.map((u) => [u.id, u.name ?? 'Advogado(a)']));
    const oabPor = new Map(perfis.map((p) => [p.userId, `OAB/${p.oabUf} ${p.oab}`]));
    return {
      ok: true,
      solicitadas: solicitadas.map((d) =>
        paraResumo(d, ctx.userId, {
          ofertas: ofertasPor.get(d.id) ?? 0,
          correspondente: d.correspondenteUserId
            ? { nome: nomePor.get(d.correspondenteUserId) ?? 'Advogado(a)', oab: oabPor.get(d.correspondenteUserId) ?? '' }
            : null,
          minhaAvaliacaoFeita: avaliei.has(d.id),
        }),
      ),
      aceitas: aceitas.map((d) =>
        paraResumo(d, ctx.userId, {
          solicitante: { nome: nomePor.get(d.solicitanteUserId) ?? 'Advogado(a)' },
          minhaAvaliacaoFeita: avaliei.has(d.id),
        }),
      ),
    };
  } catch {
    return { ok: false, erro: 'Não foi possível carregar as diligências.' };
  }
}

/** Diligências ABERTAS visíveis ao correspondente (selo + perfil ativo):
 *  comarca atendida ou mesma UF; nunca as próprias. Ordem por data. */
export async function diligenciasAbertas(): Promise<{ ok: true; abertas: DiligenciaResumo[] } | Falha> {
  const ctx = await contexto();
  if (!ctx) return { ok: false, erro: 'Sessão inválida.' };
  try {
    if (!ctx.master && !(await temSelo(ctx.userId))) {
      return { ok: false, erro: 'Diligências abertas são visíveis a correspondentes verificados.' };
    }
    const perfil = await prisma.correspondentePerfil.findUnique({ where: { userId: ctx.userId } });
    if (!ctx.master && (!perfil || !perfil.ativo)) {
      return { ok: false, erro: 'Ative o seu perfil de correspondente para ver as diligências abertas.' };
    }
    const comarcas = Array.isArray(perfil?.comarcas) ? (perfil.comarcas as number[]) : [];
    const ufs = [...new Set(comarcas.map((c) => municipioPorIbge(c)?.uf).filter(Boolean))] as string[];
    const linhas = await prisma.diligencia.findMany({
      where: {
        status: 'aberta',
        solicitanteUserId: { not: ctx.userId },
        ...(ctx.master ? {} : { OR: [{ comarcaIbge: { in: comarcas } }, { uf: { in: ufs } }] }),
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    const minhasOfertas = await prisma.diligenciaOferta.findMany({
      where: { correspondenteUserId: ctx.userId, diligenciaId: { in: linhas.map((l) => l.id) } },
      select: { diligenciaId: true },
    });
    const ofertei = new Set(minhasOfertas.map((o) => o.diligenciaId));
    return {
      ok: true,
      abertas: linhas.map((d) => paraResumo(d, ctx.userId, { jaOfertei: ofertei.has(d.id) })),
    };
  } catch {
    return { ok: false, erro: 'Não foi possível carregar as diligências abertas.' };
  }
}

export async function ofertar(
  diligenciaId: string,
  mensagem: string,
  prazoDias: number,
): Promise<{ ok: boolean; erro?: string }> {
  const ctx = await contexto();
  if (!ctx) return { ok: false, erro: 'Sessão inválida.' };
  const msg = String(mensagem ?? '').trim().slice(0, 600);
  const prazo = Math.min(90, Math.max(1, Math.round(Number(prazoDias) || 0)));
  if (msg.length < 10) return { ok: false, erro: 'Diga como atenderia (ao menos 10 caracteres).' };
  try {
    if (!ctx.master && !(await temSelo(ctx.userId))) {
      return { ok: false, erro: 'Ofertar exige o selo de verificação.' };
    }
    const d = await prisma.diligencia.findUnique({ where: { id: diligenciaId } });
    if (!d || d.status !== 'aberta') return { ok: false, erro: 'Esta diligência não está mais aberta.' };
    if (d.solicitanteUserId === ctx.userId) return { ok: false, erro: 'A diligência é sua.' };
    await prisma.diligenciaOferta.create({
      data: { diligenciaId, correspondenteUserId: ctx.userId, mensagem: msg, prazoDias: prazo },
    });
    return { ok: true };
  } catch {
    return { ok: false, erro: 'Você já respondeu a esta diligência.' };
  }
}

export interface OfertaResumo {
  id: string;
  nome: string;
  oab: string;
  mensagem: string;
  prazoDias: number;
  em: string;
  historico: { concluidas: number; comarcasAtendidas: number; media: number | null };
}

/** Ofertas de uma diligência MINHA — ordem de chegada (neutra); a média
 *  agregada só aparece para assinantes (ou master). */
export async function ofertasDaDiligencia(
  diligenciaId: string,
): Promise<{ ok: true; ofertas: OfertaResumo[] } | Falha> {
  const ctx = await contexto();
  if (!ctx) return { ok: false, erro: 'Sessão inválida.' };
  try {
    const d = await prisma.diligencia.findUnique({ where: { id: diligenciaId } });
    if (!d || d.solicitanteUserId !== ctx.userId) return { ok: false, erro: 'Diligência não encontrada.' };
    const ofertas = await prisma.diligenciaOferta.findMany({
      where: { diligenciaId },
      orderBy: { createdAt: 'asc' },
    });
    const ids = ofertas.map((o) => o.correspondenteUserId);
    const [usuarios, perfis] = await Promise.all([
      prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } }),
      prisma.advogadoPerfil.findMany({ where: { userId: { in: ids } } }),
    ]);
    const nomePor = new Map(usuarios.map((u) => [u.id, u.name ?? 'Advogado(a)']));
    const oabPor = new Map(perfis.map((p) => [p.userId, `OAB/${p.oabUf} ${p.oab}`]));
    const mostrarMedia = ctx.master || (await ehAssinante(ctx.userId));
    const resultados: OfertaResumo[] = [];
    for (const o of ofertas) {
      const h = await historicoDoUsuario(o.correspondenteUserId, mostrarMedia);
      resultados.push({
        id: o.id,
        nome: nomePor.get(o.correspondenteUserId) ?? 'Advogado(a)',
        oab: oabPor.get(o.correspondenteUserId) ?? '',
        mensagem: o.mensagem,
        prazoDias: o.prazoDias,
        em: o.createdAt.toISOString().slice(0, 10),
        historico: mostrarMedia ? h : { ...h, media: null },
      });
    }
    return { ok: true, ofertas: resultados };
  } catch {
    return { ok: false, erro: 'Não foi possível carregar as ofertas.' };
  }
}

export async function escolherOferta(
  diligenciaId: string,
  ofertaId: string,
  termo: { escopo: string; prazo: string; valor: string },
): Promise<{ ok: boolean; erro?: string }> {
  const ctx = await contexto();
  if (!ctx) return { ok: false, erro: 'Sessão inválida.' };
  try {
    const d = await prisma.diligencia.findUnique({ where: { id: diligenciaId } });
    if (!d || d.solicitanteUserId !== ctx.userId) return { ok: false, erro: 'Diligência não encontrada.' };
    if (d.status !== 'aberta') return { ok: false, erro: 'Esta diligência já foi encaminhada.' };
    const oferta = await prisma.diligenciaOferta.findUnique({ where: { id: ofertaId } });
    if (!oferta || oferta.diligenciaId !== diligenciaId) return { ok: false, erro: 'Oferta não encontrada.' };
    await prisma.diligencia.update({
      where: { id: diligenciaId },
      data: {
        status: 'aceita',
        correspondenteUserId: oferta.correspondenteUserId,
        termoJson: {
          escopo: String(termo.escopo ?? '').trim().slice(0, 800),
          prazo: String(termo.prazo ?? '').trim().slice(0, 120),
          // Valor combinado ENTRE os advogados — texto livre, sem
          // processamento de pagamento pela plataforma.
          valor: String(termo.valor ?? '').trim().slice(0, 200),
          registradoEm: new Date().toISOString(),
        },
      },
    });
    return { ok: true };
  } catch {
    return { ok: false, erro: 'Não foi possível registrar o termo.' };
  }
}

/* ------------------------------------------------------------------ */
/* B3 — execução, relatório, conclusão e avaliação                     */
/* ------------------------------------------------------------------ */

export async function confirmarTermo(diligenciaId: string): Promise<{ ok: boolean; erro?: string }> {
  const ctx = await contexto();
  if (!ctx) return { ok: false, erro: 'Sessão inválida.' };
  try {
    const d = await prisma.diligencia.findUnique({ where: { id: diligenciaId } });
    if (!d || d.correspondenteUserId !== ctx.userId) return { ok: false, erro: 'Diligência não encontrada.' };
    const termo = (d.termoJson as Record<string, unknown> | null) ?? {};
    await prisma.diligencia.update({
      where: { id: diligenciaId },
      data: { termoJson: { ...termo, confirmadoEm: new Date().toISOString() }, status: 'em_execucao' },
    });
    return { ok: true };
  } catch {
    return { ok: false, erro: 'Não foi possível confirmar.' };
  }
}

export async function cancelarDiligencia(diligenciaId: string): Promise<{ ok: boolean; erro?: string }> {
  const ctx = await contexto();
  if (!ctx) return { ok: false, erro: 'Sessão inválida.' };
  try {
    const d = await prisma.diligencia.findUnique({ where: { id: diligenciaId } });
    if (!d || d.solicitanteUserId !== ctx.userId) return { ok: false, erro: 'Diligência não encontrada.' };
    if (d.status === 'concluida' || d.status === 'cancelada') {
      return { ok: false, erro: 'Diligência já encerrada.' };
    }
    await prisma.diligencia.update({ where: { id: diligenciaId }, data: { status: 'cancelada' } });
    return { ok: true };
  } catch {
    return { ok: false, erro: 'Não foi possível cancelar.' };
  }
}

export async function concluirDiligencia(diligenciaId: string): Promise<{ ok: boolean; erro?: string }> {
  const ctx = await contexto();
  if (!ctx) return { ok: false, erro: 'Sessão inválida.' };
  try {
    const d = await prisma.diligencia.findUnique({ where: { id: diligenciaId } });
    if (!d || d.solicitanteUserId !== ctx.userId) return { ok: false, erro: 'Diligência não encontrada.' };
    if (d.status !== 'relatorio_entregue') {
      return { ok: false, erro: 'Conclua depois de receber o relatório.' };
    }
    await prisma.diligencia.update({ where: { id: diligenciaId }, data: { status: 'concluida' } });
    return { ok: true };
  } catch {
    return { ok: false, erro: 'Não foi possível concluir.' };
  }
}

export async function justificarAtraso(
  diligenciaId: string,
  texto: string,
): Promise<{ ok: boolean; erro?: string }> {
  const ctx = await contexto();
  if (!ctx) return { ok: false, erro: 'Sessão inválida.' };
  const t = String(texto ?? '').trim().slice(0, 400);
  if (t.length < 10) return { ok: false, erro: 'Explique o atraso (ao menos 10 caracteres).' };
  try {
    const d = await prisma.diligencia.findUnique({ where: { id: diligenciaId } });
    if (!d || d.correspondenteUserId !== ctx.userId) return { ok: false, erro: 'Diligência não encontrada.' };
    await prisma.diligencia.update({ where: { id: diligenciaId }, data: { justificativaAtraso: t } });
    return { ok: true };
  } catch {
    return { ok: false, erro: 'Não foi possível registrar.' };
  }
}

export async function avaliarDiligencia(
  diligenciaId: string,
  criterios: AvaliacaoCriterios,
): Promise<{ ok: boolean; erro?: string }> {
  const ctx = await contexto();
  if (!ctx) return { ok: false, erro: 'Sessão inválida.' };
  const nota = (v: number) => Math.min(5, Math.max(1, Math.round(Number(v) || 0)));
  try {
    const d = await prisma.diligencia.findUnique({ where: { id: diligenciaId } });
    if (!d || d.status !== 'concluida') return { ok: false, erro: 'Avalie depois de concluída.' };
    const souSolicitante = d.solicitanteUserId === ctx.userId;
    const souCorrespondente = d.correspondenteUserId === ctx.userId;
    if (!souSolicitante && !souCorrespondente) return { ok: false, erro: 'Diligência não encontrada.' };
    const avaliado = souSolicitante ? d.correspondenteUserId! : d.solicitanteUserId;
    await prisma.diligenciaAvaliacao.create({
      data: {
        diligenciaId,
        avaliadorUserId: ctx.userId,
        avaliadoUserId: avaliado,
        criterios: {
          prazo: nota(criterios.prazo),
          relatorio: nota(criterios.relatorio),
          comunicacao: nota(criterios.comunicacao),
        },
      },
    });
    return { ok: true };
  } catch {
    return { ok: false, erro: 'Você já avaliou esta diligência.' };
  }
}

export interface ArquivoDaPasta {
  id: string;
  origem: string;
  nome: string;
  tamanho: number;
  em: string;
}

/** Conteúdo da PASTA — solicitante e correspondente escolhido; nada além. */
export async function arquivosDaDiligencia(
  diligenciaId: string,
): Promise<{ ok: true; arquivos: ArquivoDaPasta[] } | Falha> {
  const ctx = await contexto();
  if (!ctx) return { ok: false, erro: 'Sessão inválida.' };
  try {
    const d = await prisma.diligencia.findUnique({ where: { id: diligenciaId } });
    if (!d || (d.solicitanteUserId !== ctx.userId && d.correspondenteUserId !== ctx.userId)) {
      return { ok: false, erro: 'Pasta indisponível.' };
    }
    const linhas = await prisma.diligenciaArquivo.findMany({
      where: { diligenciaId },
      orderBy: { createdAt: 'asc' },
      select: { id: true, origem: true, nome: true, tamanho: true, createdAt: true },
    });
    return {
      ok: true,
      arquivos: conteudoDaPasta(linhas).map((a) => ({
        id: a.id,
        origem: a.origem,
        nome: a.nome,
        tamanho: a.tamanho,
        em: a.createdAt.toISOString().slice(0, 10),
      })),
    };
  } catch {
    return { ok: false, erro: 'Não foi possível abrir a pasta.' };
  }
}

/** Diligências de um CASO com relatório entregue — para a aba Documentos
 *  puxar os documentos obtidos com o nome padronizado. */
export async function diligenciasDoCaso(
  casoId: string,
): Promise<{ ok: true; diligencias: (DiligenciaResumo & { arquivos: ArquivoDaPasta[] })[] } | Falha> {
  const ctx = await contexto();
  if (!ctx) return { ok: false, erro: 'Sessão inválida.' };
  try {
    const linhas = await prisma.diligencia.findMany({
      where: { casoId: String(casoId ?? '').slice(0, 80), solicitanteUserId: ctx.userId },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
    const saida = [] as (DiligenciaResumo & { arquivos: ArquivoDaPasta[] })[];
    for (const d of linhas) {
      const arquivos = await prisma.diligenciaArquivo.findMany({
        where: { diligenciaId: d.id, origem: 'relatorio' },
        select: { id: true, origem: true, nome: true, tamanho: true, createdAt: true },
      });
      saida.push({
        ...paraResumo(d, ctx.userId),
        arquivos: conteudoDaPasta(arquivos).map((a) => ({
          id: a.id,
          origem: a.origem,
          nome: a.nome,
          tamanho: a.tamanho,
          em: a.createdAt.toISOString().slice(0, 10),
        })),
      });
    }
    return { ok: true, diligencias: saida };
  } catch {
    return { ok: false, erro: 'Não foi possível carregar as diligências do caso.' };
  }
}
