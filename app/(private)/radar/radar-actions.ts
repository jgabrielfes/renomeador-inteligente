'use server';

/**
 * Radar de herdeiros — actions do LADO DO(A) ADVOGADO(A) (camada 3, etapa 5).
 *
 * Regras duras (ética OAB, Provimento 205/2021):
 *  - verificação da OAB é MANUAL (fila no /admin) e a assinatura é MENSAL,
 *    marcada à mão por UF — nunca comissão por caso;
 *  - a lista não tem ranking: ordenação ÚNICA por data de publicação;
 *  - a resposta NÃO tem campo de honorários (tratados fora da plataforma);
 *  - o(a) advogado(a) vê o caso ANÔNIMO; o contato da família só é liberado
 *    quando ELA abre a conversa ("Quero conversar", um por vez).
 * MASTER navega sem verificação/assinatura (operação da plataforma), mas a
 * conversa 1:1 é SÓ de quem a família escolheu — sem bypass.
 */

import { headers } from 'next/headers';

import { auth, isMaster } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { EH_SUCESSORISTA } from '@/lib/app';
import { radarAtivo } from '@/lib/radar/config';
import { anonimizarIntake, type CasoAnonimo } from '@/lib/radar/anonimizar';
import { corrigirQuiz, type CorrecaoQuiz } from '@/lib/radar/quiz';
import { sanitizarRespostas } from '@/lib/familias/sanitizar';
import { UFS } from '@/lib/familias/tipos';
import { enviarEmailPortal } from '@/lib/portal/email';

/** Conversa aberta há mais de 30 dias sem contratação volta ao Radar. */
const DIAS_REABRIR_CONVERSA = 30;
/** Teto de respostas por caso — a família não é leiloada. */
const MAX_RESPOSTAS_POR_CASO = 5;

type Falha = { ok: false; erro: string };

async function contexto(): Promise<{ userId: string; master: boolean } | null> {
  if (!EH_SUCESSORISTA || !radarAtivo()) return null;
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return null;
  return { userId, master: isMaster(session) };
}

/** Reabre no banco as conversas paradas há mais de 30 dias (varredura barata,
 *  feita na leitura — o histórico de mensagens permanece). */
async function reabrirConversasParadas(): Promise<void> {
  const limite = new Date(Date.now() - DIAS_REABRIR_CONVERSA * 86_400_000);
  await prisma.familiaIntake.updateMany({
    where: { status: 'em_conversa', contratadoEm: null, conversaAbertaEm: { lt: limite } },
    data: { status: 'publicado', conversaAdvogadoUserId: null, conversaAbertaEm: null },
  });
}

export interface EstadoAdvogado {
  master: boolean;
  perfil: {
    oab: string;
    oabUf: string;
    situacao: string;
    motivoRecusa: string | null;
    quizOk: boolean;
    aceitaPequenoValor: boolean;
  } | null;
  ufsAssinadas: string[];
  /** Pode ver e responder a lista (aprovado + quiz + alguma UF; master sempre). */
  habilitado: boolean;
}

export async function estadoRadarAdvogado(): Promise<EstadoAdvogado | null> {
  const ctx = await contexto();
  if (!ctx) return null;
  try {
    const [perfil, assinaturas] = await Promise.all([
      prisma.advogadoPerfil.findUnique({ where: { userId: ctx.userId } }),
      prisma.radarAssinatura.findMany({ where: { userId: ctx.userId } }),
    ]);
    const ufsAssinadas = assinaturas.map((a) => a.uf);
    const habilitado =
      ctx.master ||
      (perfil !== null &&
        perfil.situacao === 'aprovado' &&
        perfil.quizAprovadoEm !== null &&
        ufsAssinadas.length > 0);
    return {
      master: ctx.master,
      perfil: perfil
        ? {
            oab: perfil.oab,
            oabUf: perfil.oabUf,
            situacao: perfil.situacao,
            motivoRecusa: perfil.motivoRecusa,
            quizOk: perfil.quizAprovadoEm !== null,
            aceitaPequenoValor: perfil.aceitaPequenoValor,
          }
        : null,
      ufsAssinadas,
      habilitado,
    };
  } catch {
    return null;
  }
}

export async function salvarPerfilOab(
  oab: string,
  uf: string,
): Promise<{ ok: boolean; erro?: string }> {
  const ctx = await contexto();
  if (!ctx) return { ok: false, erro: 'Sessão inválida.' };
  const numero = oab.trim().toUpperCase().slice(0, 20);
  const ufNorm = uf.trim().toUpperCase();
  if (!/^[0-9.\-A-Z/]{2,20}$/.test(numero)) {
    return { ok: false, erro: 'Informe o número de inscrição na OAB.' };
  }
  if (!(UFS as readonly string[]).includes(ufNorm)) {
    return { ok: false, erro: 'Escolha a seccional (UF) da inscrição.' };
  }
  try {
    const atual = await prisma.advogadoPerfil.findUnique({ where: { userId: ctx.userId } });
    if (atual && atual.situacao === 'aprovado') {
      return { ok: false, erro: 'Inscrição já verificada — para alterar, fale com a administração.' };
    }
    if (atual && atual.situacao === 'suspenso') {
      return { ok: false, erro: 'Perfil suspenso — fale com a administração.' };
    }
    await prisma.advogadoPerfil.upsert({
      where: { userId: ctx.userId },
      update: { oab: numero, oabUf: ufNorm, situacao: 'pendente', motivoRecusa: null },
      create: { userId: ctx.userId, oab: numero, oabUf: ufNorm },
    });
    return { ok: true };
  } catch {
    return { ok: false, erro: 'Não foi possível salvar — tente de novo.' };
  }
}

export async function responderQuizRadar(
  respostas: Record<string, number>,
): Promise<{ ok: boolean; erro?: string; correcao?: CorrecaoQuiz }> {
  const ctx = await contexto();
  if (!ctx) return { ok: false, erro: 'Sessão inválida.' };
  const correcao = corrigirQuiz(respostas);
  try {
    if (correcao.aprovado) {
      await prisma.advogadoPerfil.update({
        where: { userId: ctx.userId },
        data: { quizAprovadoEm: new Date() },
      });
    }
    return { ok: true, correcao };
  } catch {
    return { ok: false, erro: 'Cadastre a inscrição na OAB antes do questionário.' };
  }
}

export async function salvarPreferenciasRadar(prefs: {
  aceitaPequenoValor: boolean;
}): Promise<{ ok: boolean; erro?: string }> {
  const ctx = await contexto();
  if (!ctx) return { ok: false, erro: 'Sessão inválida.' };
  try {
    await prisma.advogadoPerfil.update({
      where: { userId: ctx.userId },
      data: { aceitaPequenoValor: prefs.aceitaPequenoValor === true },
    });
    return { ok: true };
  } catch {
    return { ok: false, erro: 'Não foi possível salvar a preferência.' };
  }
}

export interface CasoRadar {
  caso: CasoAnonimo;
  /** Quantas respostas o caso já tem (teto 5) — número, nunca quem. */
  respostas: number;
  minhaResposta: boolean;
  conversaComigo: boolean;
  status: string;
}

export async function listarCasosRadar(): Promise<{ ok: true; casos: CasoRadar[] } | Falha> {
  const ctx = await contexto();
  if (!ctx) return { ok: false, erro: 'Sessão inválida.' };
  try {
    const estado = await estadoRadarAdvogado();
    if (!estado?.habilitado) return { ok: false, erro: 'Perfil ainda não habilitado no Radar.' };

    await reabrirConversasParadas();

    const agora = new Date();
    const linhas = await prisma.familiaIntake.findMany({
      where: {
        status: { in: ['publicado', 'em_conversa'] },
        publicadoEm: { not: null },
        expiraEm: { gt: agora },
        ...(ctx.master ? {} : { uf: { in: estado.ufsAssinadas } }),
      },
      orderBy: { publicadoEm: 'desc' }, // ordenação ÚNICA, por data — sem ranking
      take: 100,
    });
    const ids = linhas.map((l) => l.id);
    const contagens = await prisma.radarResposta.groupBy({
      by: ['intakeId'],
      where: { intakeId: { in: ids } },
      _count: { _all: true },
    });
    const minhas = await prisma.radarResposta.findMany({
      where: { intakeId: { in: ids }, advogadoUserId: ctx.userId },
      select: { intakeId: true },
    });
    const minhasSet = new Set(minhas.map((m) => m.intakeId));
    const porId = new Map(contagens.map((c) => [c.intakeId, c._count._all]));

    const casos: CasoRadar[] = [];
    for (const l of linhas) {
      // Conversa aberta: o caso só continua visível para o(a) escolhido(a).
      if (l.status === 'em_conversa' && l.conversaAdvogadoUserId !== ctx.userId) continue;
      // Pequeno valor é opt-in do(a) advogado(a) (etapa 6).
      if (l.pequenoValor && !ctx.master && !estado.perfil?.aceitaPequenoValor) continue;
      const r = sanitizarRespostas(l.respostas);
      if (!r || !l.publicadoEm) continue;
      casos.push({
        caso: anonimizarIntake({
          id: l.id,
          respostas: r,
          pequenoValor: l.pequenoValor,
          publicadoEm: l.publicadoEm.toISOString(),
        }),
        respostas: porId.get(l.id) ?? 0,
        minhaResposta: minhasSet.has(l.id),
        conversaComigo: l.status === 'em_conversa' && l.conversaAdvogadoUserId === ctx.userId,
        status: l.status,
      });
    }
    return { ok: true, casos };
  } catch {
    return { ok: false, erro: 'Não foi possível carregar o Radar.' };
  }
}

export interface RespostaMinha {
  intakeId: string;
  respondidaEm: string;
  /** Recorte anônimo do caso — null quando o intake já saiu do ar. */
  cidade: string | null;
  uf: string | null;
  via: string | null;
  /** Estágio DERIVADO do acompanhamento — nunca decide nada, só informa. */
  situacao: 'aguardando' | 'conversa' | 'contratado' | 'encerrado';
  /** Código do handoff quando a família CONTRATOU este(a) advogado(a) e o
   *  caso ainda não foi importado — habilita "Converter em inventário". */
  codigoHandoff: string | null;
  handoffImportado: boolean;
}

/**
 * Acompanhamento das MINHAS respostas (o funil pessoal do prospecção):
 * aguardando a família → em conversa comigo → contratado (com o código do
 * handoff) → encerrado (retirado, expirado ou seguiu com outro caminho —
 * rótulo NEUTRO de propósito: a escolha da família não circula). Só dados
 * que já eram meus ou anônimos; nada de ranking, valor ou identidade.
 */
export async function minhasRespostasRadar(): Promise<
  { ok: true; respostas: RespostaMinha[] } | Falha
> {
  const ctx = await contexto();
  if (!ctx) return { ok: false, erro: 'Sessão inválida.' };
  try {
    const minhas = await prisma.radarResposta.findMany({
      where: { advogadoUserId: ctx.userId },
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: { intakeId: true, createdAt: true },
    });
    const ids = minhas.map((m) => m.intakeId);
    const [intakes, handoffs] = await Promise.all([
      prisma.familiaIntake.findMany({ where: { id: { in: ids } } }),
      prisma.intakeHandoff.findMany({
        where: { intakeId: { in: ids }, advogadoUserId: ctx.userId },
        orderBy: { createdAt: 'desc' },
      }),
    ]);
    const intakePor = new Map(intakes.map((i) => [i.id, i]));
    const handoffPor = new Map<string, (typeof handoffs)[number]>();
    for (const h of handoffs) if (!handoffPor.has(h.intakeId)) handoffPor.set(h.intakeId, h);

    const saida: RespostaMinha[] = minhas.map((m) => {
      const intake = intakePor.get(m.intakeId);
      const handoff = handoffPor.get(m.intakeId);
      let situacao: RespostaMinha['situacao'] = 'encerrado';
      if (intake) {
        if (intake.status === 'contratado' && intake.conversaAdvogadoUserId === ctx.userId) {
          situacao = 'contratado';
        } else if (intake.status === 'em_conversa' && intake.conversaAdvogadoUserId === ctx.userId) {
          situacao = 'conversa';
        } else if (intake.status === 'publicado') {
          situacao = 'aguardando';
        }
      }
      // Recorte anônimo (o mesmo da lista) — melhor-esforço.
      let cidade: string | null = null;
      let uf: string | null = null;
      let via: string | null = null;
      if (intake && intake.publicadoEm) {
        const r = sanitizarRespostas(intake.respostas);
        if (r) {
          const anon = anonimizarIntake({
            id: intake.id,
            respostas: r,
            pequenoValor: intake.pequenoValor,
            publicadoEm: intake.publicadoEm.toISOString(),
          });
          cidade = anon.cidade;
          uf = anon.uf;
          via = anon.via;
        }
      }
      return {
        intakeId: m.intakeId,
        respondidaEm: m.createdAt.toISOString(),
        cidade,
        uf,
        via,
        situacao,
        codigoHandoff:
          situacao === 'contratado' && handoff && !handoff.importadoEm ? handoff.codigo : null,
        handoffImportado: Boolean(handoff?.importadoEm),
      };
    });
    return { ok: true, respostas: saida };
  } catch {
    return { ok: false, erro: 'Não foi possível carregar as suas respostas.' };
  }
}

export async function responderCasoRadar(
  intakeId: string,
  apresentacao: string,
  conducao: string,
): Promise<{ ok: boolean; erro?: string }> {
  const ctx = await contexto();
  if (!ctx) return { ok: false, erro: 'Sessão inválida.' };
  const ap = apresentacao.trim().slice(0, 600);
  const co = conducao.trim().slice(0, 800);
  if (ap.length < 30) return { ok: false, erro: 'Apresente-se em ao menos 30 caracteres.' };
  if (co.length < 30) return { ok: false, erro: 'Descreva a condução em ao menos 30 caracteres.' };
  try {
    const estado = await estadoRadarAdvogado();
    if (!estado?.habilitado) return { ok: false, erro: 'Perfil ainda não habilitado no Radar.' };

    const intake = await prisma.familiaIntake.findUnique({ where: { id: intakeId } });
    if (!intake || intake.status !== 'publicado' || intake.expiraEm < new Date()) {
      return { ok: false, erro: 'Este caso não está mais aberto a respostas.' };
    }
    const quantas = await prisma.radarResposta.count({ where: { intakeId } });
    if (quantas >= MAX_RESPOSTAS_POR_CASO) {
      return { ok: false, erro: `Este caso já recebeu ${MAX_RESPOSTAS_POR_CASO} respostas — o teto que protege a família.` };
    }
    const jaRespondi = await prisma.radarResposta.findUnique({
      where: { intakeId_advogadoUserId: { intakeId, advogadoUserId: ctx.userId } },
    });
    if (jaRespondi) return { ok: false, erro: 'Você já respondeu a este caso.' };

    await prisma.radarResposta.create({
      data: { intakeId, advogadoUserId: ctx.userId, apresentacao: ap, conducao: co },
    });

    // Aviso à família (melhor-esforço): a resposta espera no link dela.
    if (intake.email && intake.emailConfirmadoEm) {
      const h = await headers();
      const origin = `${h.get('x-forwarded-proto') ?? 'https'}://${h.get('host') ?? ''}`;
      void enviarEmailPortal({
        para: intake.email,
        assunto: 'Um(a) advogado(a) respondeu à sua solicitação',
        titulo: 'Chegou uma resposta',
        paragrafos: [
          'Um(a) advogado(a) apresentou-se para o seu caso no Radar. Abra a sua solicitação para ler com calma — a escolha é sempre sua, e só é preciso responder se quiser conversar.',
        ],
        urlPortal: `${origin}/familias/minha-solicitacao/${intake.tokenGestao}`,
        rotuloBotao: 'Ver as respostas',
        rodape:
          'Esta plataforma não intermedeia honorários nem indica advogados. Você pode retirar sua solicitação a qualquer momento.',
      });
    }
    return { ok: true };
  } catch {
    return { ok: false, erro: 'Não foi possível enviar a resposta — tente de novo.' };
  }
}

export interface ConversaRadar {
  status: string;
  familia: { nome: string; email: string };
  mensagens: { autor: string; texto: string; em: string }[];
}

/** Conversa 1:1 — SÓ o(a) advogado(a) escolhido(a) pela família (sem bypass). */
export async function conversaRadar(intakeId: string): Promise<{ ok: true; conversa: ConversaRadar } | Falha> {
  const ctx = await contexto();
  if (!ctx) return { ok: false, erro: 'Sessão inválida.' };
  try {
    const intake = await prisma.familiaIntake.findUnique({ where: { id: intakeId } });
    if (!intake || intake.conversaAdvogadoUserId !== ctx.userId) {
      return { ok: false, erro: 'Conversa indisponível.' };
    }
    const mensagens = await prisma.radarMensagem.findMany({
      where: { intakeId, advogadoUserId: ctx.userId },
      orderBy: { createdAt: 'asc' },
      take: 500,
    });
    return {
      ok: true,
      conversa: {
        status: intake.status,
        familia: { nome: intake.nome ?? '', email: intake.email ?? '' },
        mensagens: mensagens.map((m) => ({
          autor: m.autor,
          texto: m.texto,
          em: m.createdAt.toISOString(),
        })),
      },
    };
  } catch {
    return { ok: false, erro: 'Não foi possível abrir a conversa.' };
  }
}

export async function enviarMensagemRadar(
  intakeId: string,
  texto: string,
): Promise<{ ok: boolean; erro?: string }> {
  const ctx = await contexto();
  if (!ctx) return { ok: false, erro: 'Sessão inválida.' };
  const t = texto.trim().slice(0, 2000);
  if (!t) return { ok: false, erro: 'Escreva a mensagem.' };
  try {
    const intake = await prisma.familiaIntake.findUnique({ where: { id: intakeId } });
    if (
      !intake ||
      intake.conversaAdvogadoUserId !== ctx.userId ||
      (intake.status !== 'em_conversa' && intake.status !== 'contratado')
    ) {
      return { ok: false, erro: 'Conversa indisponível.' };
    }
    await prisma.radarMensagem.create({
      data: { intakeId, advogadoUserId: ctx.userId, autor: 'advogado', texto: t },
    });
    return { ok: true };
  } catch {
    return { ok: false, erro: 'Não foi possível enviar — tente de novo.' };
  }
}
