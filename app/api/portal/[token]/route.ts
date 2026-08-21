import {
  CAMPOS_QUALIFICACAO_HERDEIRO,
  type QualificacaoHerdeiro,
} from '@/lib/portal/store';
// Store PERSISTENTE (Postgres): o convite não expira e os envios sobrevivem
// aos cold starts — a memória era o que fazia o link "morrer".
import { store } from '@/lib/portal/store-prisma';
import { registrarPortal } from '@/app/(private)/sucessorista/actions';
import { foraDaPlataforma } from '@/lib/app';
import { prisma } from '@/lib/prisma';
import {
  textoLeigoDoEvento,
  TIPOS_VISIVEIS_AO_HERDEIRO,
  type DetalheEventoPortal,
} from '@/lib/portal/eventos';
import { registrarEventoPortal } from '@/lib/portal/eventos-server';
import { emailHabilitado } from '@/lib/portal/email';
import { notificarHerdeiro } from '@/lib/portal/notificar';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ token: string }> };

export async function GET(req: Request, ctx: Ctx) {
  // Rota do Sucessorista: no deploy do Renomeador ela não existe.
  const fora = foraDaPlataforma('SUCESSORISTA');
  if (fora) return fora;

  const { token } = await ctx.params;
  const convite = await store.obter(token);
  if (!convite) return Response.json({ erro: 'Convite não encontrado' }, { status: 404 });
  if (convite.revogadoEm) {
    return Response.json({ erro: 'Este convite foi encerrado pelo advogado.' }, { status: 410 });
  }

  // Carimbo de acesso SÓ na visita do herdeiro (a página manda ?visita=1) —
  // a revalidação de fundo do advogado não conta como acesso da família.
  const visita = new URL(req.url).searchParams.get('visita') === '1';
  if (visita) {
    const agora = new Date().toISOString();
    const primeiraVez = !convite.primeiroAcessoEm;
    convite.primeiroAcessoEm = convite.primeiroAcessoEm ?? agora;
    convite.ultimoAcessoEm = agora;
    await store.marcarAcesso(token, convite.primeiroAcessoEm, agora);
    // Registro de atendimento: só o PRIMEIRO acesso vira evento (o último
    // acesso vive no convite; um evento por visita inundaria o relatório).
    if (primeiraVez) {
      void registrarEventoPortal(
        convite.casoId,
        'ACESSO',
        { herdeiro: convite.nomeHerdeiro },
        token,
      );
    }
  }

  // Painel do Cliente publicado para o caso: devolve SÓ o recorte deste
  // token (o snapshot já nasce segmentado por convite no navegador do
  // advogado — a rota não recorta nada além de escolher a chave). Só na
  // visita do herdeiro: a revalidação do advogado não precisa do painel e
  // não deve carregá-lo para dentro do snapshot do caso.
  let painel: unknown = null;
  if (visita) {
    try {
      const linha = await prisma.portalPainel.findUnique({
        where: { casoId: convite.casoId },
        select: { snapshot: true },
      });
      const recorte = (linha?.snapshot as Record<string, unknown> | undefined)?.[token] ?? null;
      if (recorte && typeof recorte === 'object') {
        // "Atualizações do caso" AO VIVO: eventos do caso inteiro (fase) +
        // os DESTE token — nunca os dos outros herdeiros. Texto leigo; o que
        // não tem tradução para o herdeiro fica de fora.
        const eventos = await prisma.portalEvento.findMany({
          where: {
            casoId: convite.casoId,
            tipo: { in: TIPOS_VISIVEIS_AO_HERDEIRO },
            OR: [{ token: null }, { token }],
          },
          orderBy: { createdAt: 'desc' },
          take: 12,
          select: { tipo: true, detalhe: true, createdAt: true },
        });
        const historico = eventos
          .map((e) => ({
            data: e.createdAt.toISOString().slice(0, 10),
            texto: textoLeigoDoEvento(e.tipo, (e.detalhe as DetalheEventoPortal | null) ?? null),
          }))
          .filter((e): e is { data: string; texto: string } => e.texto !== null);
        painel = { ...recorte, historico };
      } else {
        painel = recorte;
      }
    } catch {
      painel = null;
    }
  }

  // `emailAtivo` diz à página se a seção "avisos por e-mail" existe neste
  // deploy (env-gated) — o cliente não conhece as envs do servidor.
  return Response.json(visita ? { ...convite, painel, emailAtivo: emailHabilitado() } : convite);
}

/**
 * Marca um documento como enviado / aprovado / rejeitado.
 * Envio de ARQUIVO real: plugar Vercel Blob aqui — receber multipart,
 * gravar o blob e salvar a URL em nomeArquivo.
 */
export async function PATCH(req: Request, ctx: Ctx) {
  // Rota do Sucessorista: no deploy do Renomeador ela não existe.
  const fora = foraDaPlataforma('SUCESSORISTA');
  if (fora) return fora;

  const { token } = await ctx.params;
  {
    // Convite revogado: nada mais entra por este token.
    const atual = await store.obter(token);
    if (atual?.revogadoEm) {
      return Response.json({ erro: 'Este convite foi encerrado pelo advogado.' }, { status: 410 });
    }
  }
  let body: {
    docId?: string;
    status?: string;
    nomeArquivo?: string;
    tipoDetectado?: string;
    observacaoAdvogado?: string;
    emitidaEm?: string;
    qualificacao?: Record<string, unknown>;
    confirmarEnvio?: boolean;
    novoPedido?: { id?: string; titulo?: string; descricao?: string };
    preferencias?: { email?: string; notificacoes?: string };
  };
  try {
    body = await req.json();
  } catch {
    return Response.json({ erro: 'JSON inválido' }, { status: 400 });
  }

  // Botão "Salvar" do herdeiro: registra a confirmação de que o envio chegou
  // à folha — devolve o convite com o carimbo para a página confirmar.
  if (body?.confirmarEnvio === true) {
    const atualizado = await store.confirmarEnvio(token);
    if (!atualizado) return Response.json({ erro: 'Convite não encontrado' }, { status: 404 });
    void registrarEventoPortal(
      atualizado.casoId,
      'CONFIRMACAO',
      { herdeiro: atualizado.nomeHerdeiro },
      token,
    );
    void registrarPortal({
      casoId: atualizado.casoId,
      etapa: 'CONFIRMACAO',
      quantidade: atualizado.documentos.filter((d) => d.status !== 'PENDENTE').length,
      comUsuario: false,
    });
    return Response.json(atualizado);
  }

  // Formulário do herdeiro: só os campos conhecidos entram, sempre como texto.
  if (body?.qualificacao && typeof body.qualificacao === 'object') {
    const qualificacao: QualificacaoHerdeiro = {};
    for (const campo of CAMPOS_QUALIFICACAO_HERDEIRO) {
      const v = body.qualificacao[campo];
      if (typeof v === 'string') qualificacao[campo] = v.slice(0, 300);
    }
    const atualizado = await store.salvarQualificacao(token, qualificacao);
    if (!atualizado) return Response.json({ erro: 'Convite não encontrado' }, { status: 404 });
    void registrarEventoPortal(
      atualizado.casoId,
      'DADOS_RECEBIDOS',
      { herdeiro: atualizado.nomeHerdeiro },
      token,
    );
    // Telemetria: o herdeiro respondeu a ficha. Só a CONTAGEM de campos —
    // os valores são CPF/RG/endereço e nunca entram. Evento sem usuário: o
    // herdeiro convidado não tem login (o casoId amarra ao caso).
    void registrarPortal({
      casoId: atualizado.casoId,
      etapa: 'QUALIFICACAO',
      quantidade: Object.keys(qualificacao).length,
      comUsuario: false,
    });
    return Response.json(atualizado);
  }

  // Avisos por e-mail: o herdeiro salva endereço e preferência no portal.
  if (body?.preferencias && typeof body.preferencias === 'object') {
    const email = String(body.preferencias.email ?? '').trim().slice(0, 200);
    if (email !== '' && !/.+@.+\..+/.test(email)) {
      return Response.json({ erro: 'E-mail inválido.' }, { status: 422 });
    }
    const pref = String(body.preferencias.notificacoes ?? '');
    const atualizado = await store.salvarPreferencias(token, {
      emailNotificacao: email,
      ...(pref === 'tudo' || pref === 'fases' || pref === 'nada'
        ? { notificacoes: pref }
        : {}),
    });
    if (!atualizado) return Response.json({ erro: 'Convite não encontrado' }, { status: 404 });
    return Response.json(atualizado);
  }

  // Painel do Cliente: pendência atribuída pelo advogado DEPOIS do convite
  // (coluna "Responsável" da aba Documentos) — id repetido não duplica.
  if (body?.novoPedido && typeof body.novoPedido === 'object') {
    const id = String(body.novoPedido.id ?? '').slice(0, 80);
    const titulo = String(body.novoPedido.titulo ?? '').slice(0, 160);
    if (!id || !titulo) {
      return Response.json({ erro: 'Pedido sem id ou título.' }, { status: 422 });
    }
    const atualizado = await store.adicionarPedido(token, {
      id,
      titulo,
      descricao: String(body.novoPedido.descricao ?? '').slice(0, 400),
    });
    if (!atualizado) return Response.json({ erro: 'Convite não encontrado' }, { status: 404 });
    void registrarEventoPortal(
      atualizado.casoId,
      'PENDENCIA',
      { herdeiro: atualizado.nomeHerdeiro, documento: titulo },
      token,
    );
    void notificarHerdeiro(
      atualizado,
      { tipo: 'PENDENCIA', documento: titulo },
      new URL(req.url).origin,
    );
    return Response.json(atualizado);
  }

  if (!body?.docId) return Response.json({ erro: 'docId é obrigatório' }, { status: 422 });

  const patch: Record<string, string> = {};
  if (body.status && ['PENDENTE', 'ENVIADO', 'APROVADO', 'REJEITADO'].includes(body.status)) {
    patch.status = body.status;
    if (body.status === 'ENVIADO') patch.enviadoEm = new Date().toISOString();
  }
  if (body.nomeArquivo) patch.nomeArquivo = body.nomeArquivo.slice(0, 200);
  if (body.tipoDetectado) patch.tipoDetectado = body.tipoDetectado.slice(0, 80);
  if (body.observacaoAdvogado !== undefined) patch.observacaoAdvogado = String(body.observacaoAdvogado);
  // Data de emissão lida do documento (validade de certidão) — só ISO curta.
  if (typeof body.emitidaEm === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.emitidaEm)) {
    patch.emitidaEm = body.emitidaEm;
  }

  const atualizado = await store.atualizarDocumento(token, body.docId, patch);
  if (!atualizado) return Response.json({ erro: 'Convite ou documento não encontrado' }, { status: 404 });
  // Registro de atendimento: recebido/aprovado/devolvido, com o título do
  // pedido e — na recusa — o motivo que o herdeiro leu.
  if (patch.status) {
    const pedido = atualizado.documentos.find((d) => d.id === body.docId);
    const tipoEvento =
      patch.status === 'ENVIADO'
        ? ('DOC_RECEBIDO' as const)
        : patch.status === 'APROVADO'
          ? ('DOC_ACEITO' as const)
          : patch.status === 'REJEITADO'
            ? ('DOC_RECUSADO' as const)
            : null;
    if (tipoEvento) {
      void registrarEventoPortal(
        atualizado.casoId,
        tipoEvento,
        {
          herdeiro: atualizado.nomeHerdeiro,
          documento: pedido?.titulo,
          ...(tipoEvento === 'DOC_RECUSADO' && patch.observacaoAdvogado
            ? { motivo: patch.observacaoAdvogado.slice(0, 300) }
            : {}),
        },
        token,
      );
      // Conferência do advogado avisa o herdeiro na hora (preferência 'tudo').
      if (tipoEvento === 'DOC_ACEITO' || tipoEvento === 'DOC_RECUSADO') {
        void notificarHerdeiro(
          atualizado,
          tipoEvento === 'DOC_ACEITO'
            ? { tipo: 'DOC_ACEITO', documento: pedido?.titulo ?? 'documento' }
            : {
                tipo: 'DOC_RECUSADO',
                documento: pedido?.titulo ?? 'documento',
                motivo: patch.observacaoAdvogado?.slice(0, 300),
              },
          new URL(req.url).origin,
        );
      }
    }
  }
  if (patch.status === 'ENVIADO') {
    // Documento anexado pelo herdeiro: a TAG do tipo detectado é segura; o
    // nome do arquivo, não — ele fica de fora.
    void registrarPortal({
      casoId: atualizado.casoId,
      etapa: 'DOCUMENTO',
      quantidade: atualizado.documentos.filter((d) => d.status !== 'PENDENTE').length,
      tipoDetectado: patch.tipoDetectado ?? null,
      comUsuario: false,
    });
  }
  return Response.json(atualizado);
}
