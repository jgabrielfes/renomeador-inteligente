/**
 * WORKER da jurimetria registral — roda na GitHub Action agendada
 * (.github/workflows/jurimetria-coleta.yml), NUNCA em função da Vercel
 * (timeout). Decisão do escritório: Action no lugar de VM/Railway — o
 * agendamento fica versionado com o código, como a varredura do Radar.
 *
 *   npx tsx scripts/jurimetria/worker.ts
 *
 * Segredos esperados no ambiente: DATABASE_URL (conexão direta),
 * GEMINI_API_KEY (opcional — sem ela vale o extrator local, tudo cai na
 * revisão), DATAJUD_API_KEY (opcional — sem ela a fonte Datajud pula).
 *
 * Fluxo por execução:
 *   1. Enfileira `coletar_fonte` para fonte ativa, não bloqueada e vencida
 *      pelo intervalo (config.intervaloDias).
 *   2. Drena a fila com FOR UPDATE SKIP LOCKED (execuções concorrentes não
 *      pisam uma na outra).
 *   3. coletar_fonte: lista + baixa; o BRUTO vive só aqui na memória — o
 *      banco recebe hash, origem e o texto JÁ ANONIMIZADO.
 *   4. processar_documento: extrai (Gemini → fallback local), resolve
 *      cartório/titular, deduplica (pg_trgm) e encaminha (publicado ×
 *      fila de revisão). Métricas diárias + alertas no resumo.
 */

import { createHash } from 'node:crypto';

import { PrismaPg } from '@prisma/adapter-pg';

import { PrismaClient } from '../../lib/generated/prisma/client';
import { anonimizar } from '../../lib/jurimetria/anonimizar';
import { extrairComGemini, geminiDisponivel } from '../../lib/jurimetria/gemini-exigencias';
import { extrairExigenciasLocal } from '../../lib/jurimetria/extrair';
import { resolverCartorio, resolverTitular } from '../../lib/jurimetria/resolver';
import { encaminhar, LIMIAR_DUPLICATA } from '../../lib/jurimetria/encaminhar';
import { VERSAO_EXTRATOR, type ExtracaoDocumento } from '../../lib/jurimetria/tipos';
import { coletorDatajud } from '../../lib/jurimetria/coletores/datajud';
import { coletorCgj } from '../../lib/jurimetria/coletores/cgj';
import { coletorIrib } from '../../lib/jurimetria/coletores/irib';
import { coletorCartorioSite } from '../../lib/jurimetria/coletores/cartorio-site';
import { FonteBloqueadaError, type Coletor, type ConfigFonte } from '../../lib/jurimetria/coletores/tipos';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const COLETORES: Record<string, Coletor> = {
  DUVIDA_1VRP: coletorDatajud,
  DUVIDA_CGJ: coletorCgj,
  IRIB_PUBLICACAO: coletorIrib,
  CARTORIO_SITE: coletorCartorioSite,
};

const MAX_JOBS_POR_EXECUCAO = 60;
const MAX_DOCS_POR_FONTE = 25;

const sha256 = (dados: string | Uint8Array) => createHash('sha256').update(dados).digest('hex');

const resumo = {
  coletados: 0,
  processados: 0,
  exigencias: 0,
  publicadas: 0,
  paraRevisao: 0,
  duplicatas: 0,
  erros: 0,
  alertas: [] as string[],
};

/** PDF nativo → texto (pdfjs-dist, sem OCR). Scan sem camada de texto vai
 *  para a fila com erro honesto — OCR de imagem no worker fica para a fase
 *  seguinte (no navegador do advogado, na Camada B, o tesseract já roda). */
async function textoDePdf(bytes: Uint8Array): Promise<string> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const doc = await pdfjs.getDocument({ data: bytes, useSystemFonts: true }).promise;
  const partes: string[] = [];
  for (let i = 1; i <= Math.min(doc.numPages, 60); i++) {
    const pagina = await doc.getPage(i);
    const conteudo = await pagina.getTextContent();
    partes.push(
      conteudo.items
        .map((item) => ('str' in item ? item.str : ''))
        .join(' '),
    );
  }
  return partes.join('\n').replace(/[ \t]+/g, ' ').trim();
}

async function nomesAPreservar(): Promise<string[]> {
  const titulares = await prisma.titular.findMany({ select: { nome: true } });
  return titulares.map((t) => t.nome);
}

async function metrica(fonteId: string, campo: 'documentos' | 'exigencias' | 'paraRevisao' | 'descartados' | 'erros', n = 1) {
  const dia = new Date(new Date().toISOString().slice(0, 10));
  for (const alvo of [fonteId, 'geral']) {
    await prisma.metricaJurimetria.upsert({
      where: { dia_fonteId: { dia, fonteId: alvo } },
      create: { dia, fonteId: alvo, [campo]: n },
      update: { [campo]: { increment: n } },
    });
  }
}

async function bloquearFonte(fonteId: string, motivo: string) {
  await prisma.fonteJurimetria.update({
    where: { id: fonteId },
    data: { bloqueadaEm: new Date(), motivoBloqueio: motivo.slice(0, 500) },
  });
  resumo.alertas.push(`FONTE BLOQUEADA: ${fonteId} — ${motivo}`);
}

/* ---------------- fila (FOR UPDATE SKIP LOCKED) ---------------- */

async function enfileirarColetas() {
  const fontes = await prisma.fonteJurimetria.findMany({
    where: { ativa: true, bloqueadaEm: null },
  });
  const agora = Date.now();
  for (const f of fontes) {
    const config = (f.config ?? {}) as Record<string, unknown>;
    const intervaloDias = Number(config.intervaloDias ?? 1);
    if (f.ultimaColeta && agora - f.ultimaColeta.getTime() < intervaloDias * 86400000) continue;
    const pendente = await prisma.jobJurimetria.findFirst({
      where: { tipo: 'coletar_fonte', status: { in: ['pendente', 'rodando'] }, payload: { equals: { fonteId: f.id } } },
    });
    if (!pendente)
      await prisma.jobJurimetria.create({ data: { tipo: 'coletar_fonte', payload: { fonteId: f.id } } });
  }
}

async function pegarJob(): Promise<{ id: string; tipo: string; payload: Record<string, unknown> } | null> {
  const linhas = await prisma.$queryRaw<{ id: string; tipo: string; payload: unknown }[]>`
    UPDATE "jurimetria_jobs" SET "status" = 'rodando', "tentativas" = "tentativas" + 1, "atualizadoEm" = now()
    WHERE "id" = (
      SELECT "id" FROM "jurimetria_jobs"
      WHERE "status" = 'pendente' OR ("status" = 'erro' AND "tentativas" < 3)
      ORDER BY "criadoEm"
      FOR UPDATE SKIP LOCKED
      LIMIT 1
    )
    RETURNING "id", "tipo", "payload"`;
  const l = linhas[0];
  return l ? { id: l.id, tipo: l.tipo, payload: (l.payload ?? {}) as Record<string, unknown> } : null;
}

/* ---------------- coleta ---------------- */

async function rodarColeta(fonteId: string) {
  const f = await prisma.fonteJurimetria.findUnique({ where: { id: fonteId } });
  if (!f || !f.ativa || f.bloqueadaEm) return;
  const coletor = COLETORES[f.tipo];
  if (!coletor) throw new Error(`Sem coletor para o tipo ${f.tipo}`);
  const fonte: ConfigFonte = {
    id: f.id,
    tipo: f.tipo,
    nome: f.nome,
    urlBase: f.urlBase,
    config: (f.config ?? {}) as Record<string, unknown>,
  };
  const desde = f.ultimaColeta ?? new Date(Date.now() - 180 * 86400000);
  const preservar = await nomesAPreservar();

  let refs;
  try {
    refs = await coletor.listar(fonte, desde);
  } catch (e) {
    if (e instanceof FonteBloqueadaError) {
      await bloquearFonte(f.id, e.message);
      return;
    }
    throw e;
  }

  for (const ref of refs.slice(0, MAX_DOCS_POR_FONTE)) {
    try {
      const conteudo = await coletor.baixar(fonte, ref);
      // O BRUTO existe só aqui: extrai o texto na memória do runner…
      const textoBruto =
        conteudo.texto ?? (conteudo.bytes ? await textoDePdf(conteudo.bytes) : '');
      const hash = sha256(conteudo.bytes ?? conteudo.texto ?? '');
      const jaTem = await prisma.documentoJurimetria.findUnique({ where: { hashConteudo: hash } });
      if (jaTem) continue; // recoleta sem mudança (mesmo hash) não duplica
      if (!textoBruto.trim()) {
        await prisma.documentoJurimetria.create({
          data: {
            fonteId: f.id,
            urlOrigem: conteudo.urlOrigem,
            hashConteudo: hash,
            mime: conteudo.mime,
            status: 'erro',
            erro: 'sem camada de texto (possível scan — OCR fora do escopo da Fase 1)',
            versaoExtrator: VERSAO_EXTRATOR,
          },
        });
        await metrica(f.id, 'erros');
        resumo.erros++;
        continue;
      }
      // …e o que persiste é SÓ o anonimizado (LGPD por construção).
      const { texto } = anonimizar(textoBruto, preservar);
      const doc = await prisma.documentoJurimetria.create({
        data: {
          fonteId: f.id,
          urlOrigem: conteudo.urlOrigem,
          hashConteudo: hash,
          mime: conteudo.mime,
          textoAnonimizado: texto,
          dataDocumento: conteudo.dataDocumento ? new Date(conteudo.dataDocumento) : null,
          status: 'anonimizado',
          versaoExtrator: VERSAO_EXTRATOR,
        },
      });
      await prisma.jobJurimetria.create({
        data: { tipo: 'processar_documento', payload: { documentoId: doc.id } },
      });
      await metrica(f.id, 'documentos');
      resumo.coletados++;
    } catch (e) {
      if (e instanceof FonteBloqueadaError) {
        await bloquearFonte(f.id, e.message);
        return;
      }
      resumo.erros++;
      await metrica(f.id, 'erros');
      console.error(`  erro em ${ref.url}:`, e instanceof Error ? e.message : e);
    }
  }
  await prisma.fonteJurimetria.update({ where: { id: f.id }, data: { ultimaColeta: new Date() } });
}

/* ---------------- processamento ---------------- */

async function rodarProcessamento(documentoId: string) {
  const doc = await prisma.documentoJurimetria.findUnique({
    where: { id: documentoId },
    include: { fonte: true },
  });
  if (!doc || !doc.textoAnonimizado) return;

  const temas = await prisma.temaRegistral.findMany({ select: { id: true, rotulo: true } });
  const contexto = { tipoFonte: doc.fonte.tipo, temas };

  let extracao: ExtracaoDocumento | null = await extrairComGemini(doc.textoAnonimizado, contexto);
  if (!extracao) extracao = extrairExigenciasLocal(doc.textoAnonimizado, doc.fonte.tipo);

  const cartorios = await prisma.cartorio.findMany({ select: { id: true, nome: true, aliases: true } });
  const titularesRefs = (
    await prisma.titular.findMany({ select: { id: true, cartorioId: true, titularDesde: true } })
  ).map((t) => ({ id: t.id, cartorioId: t.cartorioId, titularDesde: t.titularDesde }));

  const configFonte = (doc.fonte.config ?? {}) as Record<string, unknown>;
  const cartorioDaFonte = (configFonte.cartorioId as string | undefined) ?? null;
  const cartorioId =
    cartorioDaFonte ?? resolverCartorio(extracao.cartorioMencionado, cartorios);
  const dataExigencia = doc.dataDocumento ?? (extracao.dataDocumento ? new Date(extracao.dataDocumento) : new Date(doc.coletadoEm));
  const { titularId, titularPendente } = cartorioId
    ? resolverTitular(titularesRefs, cartorioId, dataExigencia)
    : { titularId: null, titularPendente: true };

  let algumaRevisao = false;
  for (let i = 0; i < extracao.exigencias.length; i++) {
    const ex = extracao.exigencias[i];
    const temaSlug = extracao.temas?.[i] ?? null;
    const temaId = temaSlug && temas.some((t) => t.id === temaSlug) ? temaSlug : null;

    // Dedupe pg_trgm no MESMO cartório+tema (limiar do motor puro).
    let duplicataDe: string | null = null;
    if (cartorioId) {
      const parecidas = await prisma.$queryRaw<{ id: string; sim: number }[]>`
        SELECT "id", similarity("textoNormalizado", ${ex.textoNormalizado}) AS sim
        FROM "jurimetria_exigencias"
        WHERE "cartorioId" = ${cartorioId}
          AND "temaId" IS NOT DISTINCT FROM ${temaId}
          AND "duplicataDe" IS NULL
        ORDER BY sim DESC
        LIMIT 1`;
      if (parecidas[0] && Number(parecidas[0].sim) >= LIMIAR_DUPLICATA) duplicataDe = parecidas[0].id;
    }

    const decisao = encaminhar({
      confianca: extracao.confianca,
      cartorioId,
      titularPendente,
    });

    const criada = await prisma.exigencia.create({
      data: {
        documentoId: doc.id,
        cartorioId,
        titularId,
        titularPendente,
        temaId,
        atoTipo: extracao.atoTipo,
        textoNormalizado: ex.textoNormalizado,
        fundamentacao: ex.fundamentacao,
        resultado: ex.resultado,
        trechoOrigem: ex.trechoOrigem,
        dataExigencia,
        confianca: extracao.confianca,
        duplicataDe,
        publicado: decisao.destino === 'publicado' && !duplicataDe,
      },
    });
    resumo.exigencias++;
    await metrica(doc.fonteId, 'exigencias');
    if (duplicataDe) resumo.duplicatas++;
    if (decisao.destino === 'revisao' || decisao.motivos.includes('auditoria')) {
      algumaRevisao = algumaRevisao || decisao.destino === 'revisao';
      for (const motivo of decisao.motivos) {
        await prisma.revisaoJurimetria.create({ data: { exigenciaId: criada.id, motivo } });
      }
      if (decisao.destino === 'revisao') {
        resumo.paraRevisao++;
        await metrica(doc.fonteId, 'paraRevisao');
      }
    }
    if (decisao.destino === 'publicado' && !duplicataDe) resumo.publicadas++;
  }

  await prisma.documentoJurimetria.update({
    where: { id: doc.id },
    data: {
      status: extracao.exigencias.length === 0 ? 'descartado' : algumaRevisao ? 'revisao' : 'publicado',
    },
  });
  if (extracao.exigencias.length === 0) await metrica(doc.fonteId, 'descartados');
  resumo.processados++;
}

/* ---------------- laço principal ---------------- */

async function principal() {
  console.log(`Jurimetria — worker (${VERSAO_EXTRATOR}); Gemini ${geminiDisponivel() ? 'ATIVO' : 'inativo (fallback local, tudo vai à revisão)'}`);
  await enfileirarColetas();

  for (let i = 0; i < MAX_JOBS_POR_EXECUCAO; i++) {
    const job = await pegarJob();
    if (!job) break;
    try {
      if (job.tipo === 'coletar_fonte') await rodarColeta(String(job.payload.fonteId));
      else if (job.tipo === 'processar_documento')
        await rodarProcessamento(String(job.payload.documentoId));
      await prisma.jobJurimetria.update({ where: { id: job.id }, data: { status: 'feito', erro: null } });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      resumo.erros++;
      await prisma.jobJurimetria.update({ where: { id: job.id }, data: { status: 'erro', erro: msg.slice(0, 500) } });
      console.error(`job ${job.id} (${job.tipo}) falhou:`, msg);
    }
  }

  // Alertas do desenho: fila de revisão acumulada.
  const pendentes = await prisma.revisaoJurimetria.count({ where: { status: 'pendente' } });
  if (pendentes > 200) resumo.alertas.push(`Fila de revisão com ${pendentes} itens pendentes (> 200).`);

  console.log('\nResumo da execução:');
  console.log(JSON.stringify(resumo, null, 2));
  if (resumo.alertas.length > 0) {
    // Log estruturado: a Action destaca no summary; e-mail fica para quando
    // o RESEND_API_KEY do worker for cadastrado (TODO_VALIDACAO).
    console.error(`::warning::${resumo.alertas.join(' | ')}`);
  }
}

principal()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
