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
import { cartorioDaMencao, resolverCartorio, resolverTitular } from '../../lib/jurimetria/resolver';
import { detectarTemas, mencoesDeCartorio } from '../../lib/jurimetria/temas-local';
import { encaminhar, LIMIAR_DUPLICATA } from '../../lib/jurimetria/encaminhar';
import { VERSAO_EXTRATOR, type ExtracaoDocumento } from '../../lib/jurimetria/tipos';
import { coletorCjpg } from '../../lib/jurimetria/coletores/cjpg';
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
  cjpg: coletorCjpg,
  DUVIDA_CGJ: coletorCgj,
  IRIB_PUBLICACAO: coletorIrib,
  CARTORIO_SITE: coletorCartorioSite,
};

const MAX_JOBS_POR_EXECUCAO = 400;
const MAX_DOCS_POR_FONTE = 120;

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
    // Fonte sem coletor (ex.: contribuições de usuários — os documentos
    // chegam pela server action, não por coleta) não entra na fila.
    const chave = typeof config.coletor === 'string' ? config.coletor : f.tipo;
    if (!COLETORES[chave]) continue;
    const intervaloDias = Number(config.intervaloDias ?? 1);
    // FORCAR_COLETA (disparo manual da Action) ignora o intervalo — quem
    // clica quer coletar agora; o agendamento diário segue respeitando.
    if (
      !process.env.FORCAR_COLETA &&
      f.ultimaColeta &&
      agora - f.ultimaColeta.getTime() < intervaloDias * 86400000
    )
      continue;
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
  const fonte: ConfigFonte = {
    id: f.id,
    tipo: f.tipo,
    nome: f.nome,
    urlBase: f.urlBase,
    config: (f.config ?? {}) as Record<string, unknown>,
  };
  // `config.coletor` escolhe o coletor quando duas fontes compartilham o
  // tipo (Datajud e CJPG são ambas DUVIDA_1VRP).
  const chave = typeof fonte.config.coletor === 'string' ? fonte.config.coletor : f.tipo;
  const coletor = COLETORES[chave];
  if (!coletor) throw new Error(`Sem coletor para ${chave}`);
  const desde = f.ultimaColeta ?? new Date(Date.now() - 180 * 86400000);
  const preservar = await nomesAPreservar();

  // Referências já no banco — o coletor que pagina (Datajud) usa para cavar
  // além do que já veio (backfill do histórico antigo).
  const conhecidas = new Set(
    (
      await prisma.documentoJurimetria.findMany({
        where: { fonteId: f.id, urlOrigem: { not: null } },
        select: { urlOrigem: true },
      })
    ).map((d) => d.urlOrigem as string),
  );

  let refs;
  try {
    refs = await coletor.listar(fonte, desde, (url) => conhecidas.has(url));
  } catch (e) {
    if (e instanceof FonteBloqueadaError) {
      await bloquearFonte(f.id, e.message);
      return;
    }
    throw e;
  }
  console.log(
    `${f.id}: ${refs.length} referência(s) desde ${desde.toISOString().slice(0, 10)}`,
  );

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
  // Contribuição de usuário carrega o cartório detectado no navegador em
  // urlOrigem ("usuario:<cartorioId>") — validado contra o catálogo.
  const cartorioDaContribuicao =
    doc.urlOrigem?.startsWith('usuario:') &&
    cartorios.some((c) => c.id === doc.urlOrigem!.slice('usuario:'.length))
      ? doc.urlOrigem.slice('usuario:'.length)
      : null;
  let cartorioId =
    cartorioDaFonte ??
    cartorioDaContribuicao ??
    resolverCartorio(extracao.cartorioMencionado, cartorios);
  // Serventia nomeada que não existe no catálogo é CADASTRADA na hora —
  // toda decisão cai por cartório sem depender de semente manual.
  if (!cartorioId) {
    const novo = cartorioDaMencao(extracao.cartorioMencionado);
    if (novo) {
      await prisma.cartorio.upsert({
        where: { id: novo.id },
        update: {},
        create: {
          id: novo.id,
          nome: novo.nome,
          cidade: novo.cidade,
          uf: 'SP',
          aliases: [String(extracao.cartorioMencionado ?? '').trim()].filter(Boolean),
        },
      });
      cartorioId = novo.id;
    }
  }
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
    // PUBLICAÇÃO AUTOMÁTICA: só possível dado pessoal ainda gera revisão
    // (trava LGPD); os demais motivos ficam anotados na própria decisão.
    if (decisao.destino === 'revisao') {
      algumaRevisao = true;
      for (const motivo of decisao.motivos) {
        await prisma.revisaoJurimetria.create({ data: { exigenciaId: criada.id, motivo } });
      }
      resumo.paraRevisao++;
      await metrica(doc.fonteId, 'paraRevisao');
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

/* ---------------- reclassificação local (rede de segurança) ---------------- */

/**
 * Exigência publicada SEM tema é invisível na consulta tema-primeiro. Quando
 * a extração não conseguiu classificar, o detector local (os mesmos regex do
 * navegador) tenta pelo texto normalizado + trecho de origem — melhor um tema
 * aproximado e visível do que registro publicado que ninguém encontra.
 */
async function reclassificarSemTema() {
  const catalogo = new Set((await prisma.temaRegistral.findMany({ select: { id: true } })).map((t) => t.id));
  const semTema = await prisma.exigencia.findMany({
    where: { temaId: null, duplicataDe: null },
    select: {
      id: true,
      textoNormalizado: true,
      trechoOrigem: true,
      // O documento inteiro entra na detecção — é onde vivem os assuntos
      // da tabela CNJ dos processos do Datajud.
      documento: { select: { textoAnonimizado: true } },
    },
    take: 500,
  });
  let atribuidas = 0;
  for (const e of semTema) {
    const base = `${e.textoNormalizado}\n${e.trechoOrigem ?? ''}\n${e.documento.textoAnonimizado ?? ''}`;
    // Garantia dura: NADA fica sem tema — sem casamento nos regex, o
    // registro cai em "outros" (visível na lista) em vez do limbo.
    const id =
      detectarTemas(base).find((t) => catalogo.has(t)) ?? (catalogo.has('outros') ? 'outros' : null);
    if (!id) continue;
    await prisma.exigencia.update({ where: { id: e.id }, data: { temaId: id } });
    atribuidas++;
  }
  if (semTema.length > 0)
    console.log(`reclassificação local: ${atribuidas} de ${semTema.length} exigência(s) sem tema ganharam tema`);
}

/**
 * Cartório retroativo: exigência sem cartório revisita as menções de
 * serventia do PRÓPRIO documento — resolve contra o catálogo e, quando a
 * menção nomeia serventia nova, cadastra (cartorioDaMencao) e atribui.
 */
async function reatribuirCartorios() {
  const cartorios = await prisma.cartorio.findMany({ select: { id: true, nome: true, aliases: true } });
  const sem = await prisma.exigencia.findMany({
    where: { cartorioId: null, duplicataDe: null },
    select: { id: true, documento: { select: { textoAnonimizado: true } } },
    take: 300,
  });
  let atribuidos = 0;
  for (const e of sem) {
    let id: string | null = null;
    for (const mencao of mencoesDeCartorio(e.documento.textoAnonimizado ?? '')) {
      id = resolverCartorio(mencao, cartorios);
      if (!id) {
        const novo = cartorioDaMencao(mencao);
        if (novo) {
          await prisma.cartorio.upsert({
            where: { id: novo.id },
            update: {},
            create: { id: novo.id, nome: novo.nome, cidade: novo.cidade, uf: 'SP', aliases: [mencao] },
          });
          cartorios.push({ id: novo.id, nome: novo.nome, aliases: [mencao] });
          id = novo.id;
        }
      }
      if (id) break;
    }
    if (!id) continue;
    await prisma.exigencia.update({ where: { id: e.id }, data: { cartorioId: id } });
    atribuidos++;
  }
  if (sem.length > 0)
    console.log(`reatribuição de cartório: ${atribuidos} de ${sem.length} exigência(s) sem cartório ganharam serventia`);
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

  await reatribuirCartorios();
  await reclassificarSemTema();

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
