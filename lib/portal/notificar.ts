/**
 * Notificações automáticas do Painel do Cliente — SÓ SERVIDOR. Decide QUEM
 * recebe cada aviso pelo par (e-mail salvo, preferência) do convite:
 *
 *   'tudo'  → fase, quinhão liberado, conferência dos documentos, pendência;
 *   'fases' → só mudança de fase;
 *   'nada'  → nenhum e-mail.
 *
 * O e-mail vem do que o herdeiro salvou no portal (`emailNotificacao`) ou,
 * na falta, do e-mail da qualificação. Convite revogado nunca recebe. Cada
 * envio vira evento NOTIFICACAO no registro de atendimento. Tudo
 * melhor-esforço e atrás de emailHabilitado() — sem RESEND_API_KEY nada
 * daqui roda.
 */

import { prisma } from '@/lib/prisma';
import type { ConviteHerdeiro } from './store';
import { emailHabilitado, enviarEmailPortal } from './email';
import { registrarEventoPortal } from './eventos-server';

type Preferencia = 'tudo' | 'fases' | 'nada';

function destino(c: ConviteHerdeiro): { para: string; pref: Preferencia } | null {
  if (c.revogadoEm) return null;
  const para = c.emailNotificacao || c.qualificacao?.email || '';
  if (!/.+@.+\..+/.test(para)) return null;
  const pref = c.notificacoes ?? 'tudo';
  if (pref === 'nada') return null;
  return { para, pref };
}

const urlDoPortal = (origin: string, token: string) =>
  origin ? `${origin}/portal/${token}` : undefined;

async function convitesDoCaso(casoId: string): Promise<ConviteHerdeiro[]> {
  try {
    const linhas = await prisma.portalConvite.findMany({ where: { casoId } });
    return linhas.map((l) => l.dados as unknown as ConviteHerdeiro);
  } catch {
    return [];
  }
}

/** Fase mudou (republicação): avisa 'tudo' E 'fases' — o advogado marca uma
 *  vez e a família inteira fica sabendo sem que ele escreva nada. */
export async function notificarMudancaDeFase(
  casoId: string,
  nomeFalecido: string,
  faseTitulo: string,
  origin: string,
): Promise<void> {
  if (!emailHabilitado()) return;
  for (const c of await convitesDoCaso(casoId)) {
    const d = destino(c);
    if (!d) continue;
    const ok = await enviarEmailPortal({
      para: d.para,
      assunto: `Inventário de ${nomeFalecido}: nova fase — ${faseTitulo}`,
      titulo: 'O inventário avançou',
      paragrafos: [
        `Olá, ${c.nomeHerdeiro}.`,
        `O inventário de ${nomeFalecido} entrou na fase "${faseTitulo}".`,
        'Abra o seu portal para ver o que isso significa e se falta algo de você.',
      ],
      urlPortal: urlDoPortal(origin, c.token),
    });
    if (ok) {
      void registrarEventoPortal(
        casoId,
        'NOTIFICACAO',
        { herdeiro: c.nomeHerdeiro, fase: faseTitulo },
        c.token,
      );
    }
  }
}

/** Quinhão liberado para consulta: só quem pediu 'tudo'. */
export async function notificarQuinhaoLiberado(
  casoId: string,
  nomeFalecido: string,
  origin: string,
): Promise<void> {
  if (!emailHabilitado()) return;
  for (const c of await convitesDoCaso(casoId)) {
    const d = destino(c);
    if (!d || d.pref !== 'tudo') continue;
    const ok = await enviarEmailPortal({
      para: d.para,
      assunto: `Inventário de ${nomeFalecido}: seu quinhão está disponível para consulta`,
      titulo: 'Seu quinhão foi liberado',
      paragrafos: [
        `Olá, ${c.nomeHerdeiro}.`,
        'O advogado liberou a consulta ao seu quinhão no portal do inventário. Os valores são estimativas e podem mudar até a partilha final.',
      ],
      urlPortal: urlDoPortal(origin, c.token),
    });
    if (ok) {
      void registrarEventoPortal(casoId, 'NOTIFICACAO', { herdeiro: c.nomeHerdeiro }, c.token);
    }
  }
}

/**
 * Votação formal do espólio — as DUAS etapas da deliberação avisam a família
 * inteira ('tudo' E 'fases', como a mudança de fase: é marco do caso):
 * a ABERTURA chama para votar; o ENCERRAMENTO comunica o resultado apurado.
 */
export async function notificarVotacao(
  casoId: string,
  nomeFalecido: string,
  pergunta: string,
  etapa: 'aberta' | 'encerrada',
  resultado: string | undefined,
  origin: string,
): Promise<void> {
  if (!emailHabilitado()) return;
  for (const c of await convitesDoCaso(casoId)) {
    const d = destino(c);
    if (!d) continue;
    const ok = await enviarEmailPortal({
      para: d.para,
      assunto:
        etapa === 'aberta'
          ? `Inventário de ${nomeFalecido}: nova votação da família`
          : `Inventário de ${nomeFalecido}: votação encerrada`,
      titulo: etapa === 'aberta' ? 'A família foi chamada a decidir' : 'A votação foi encerrada',
      paragrafos:
        etapa === 'aberta'
          ? [
              `Olá, ${c.nomeHerdeiro}.`,
              `Uma nova votação foi aberta no inventário de ${nomeFalecido}: "${pergunta}".`,
              'Abra o seu portal para ler as opções e registrar o seu voto — você pode mudá-lo enquanto a votação estiver aberta.',
            ]
          : [
              `Olá, ${c.nomeHerdeiro}.`,
              `A votação "${pergunta}" do inventário de ${nomeFalecido} foi encerrada.`,
              resultado
                ? `Resultado apurado: ${resultado}.`
                : 'O resultado apurado está disponível no seu portal.',
              'A deliberação da família orienta o trabalho do escritório; o ato formal continua sendo a escritura ou a decisão judicial.',
            ],
      urlPortal: urlDoPortal(origin, c.token),
    });
    if (ok) {
      void registrarEventoPortal(
        casoId,
        'NOTIFICACAO',
        { herdeiro: c.nomeHerdeiro, votacao: pergunta.slice(0, 160) },
        c.token,
      );
    }
  }
}

/**
 * RESUMO (digest) do caso enviado pelo advogado com um clique: compila os
 * marcos do caso inteiro desde o último resumo (só eventos SEM token —
 * conteúdo idêntico para todos) e manda a 'tudo' e 'fases'.
 */
export async function notificarDigest(
  casoId: string,
  nomeFalecido: string,
  itens: { data: string; texto: string }[],
  origin: string,
): Promise<number> {
  if (!emailHabilitado() || itens.length === 0) return 0;
  let enviados = 0;
  for (const c of await convitesDoCaso(casoId)) {
    const d = destino(c);
    if (!d) continue;
    const ok = await enviarEmailPortal({
      para: d.para,
      assunto: `Inventário de ${nomeFalecido}: resumo do que aconteceu`,
      titulo: 'Resumo do período',
      paragrafos: [
        `Olá, ${c.nomeHerdeiro}.`,
        `O que aconteceu no inventário de ${nomeFalecido} desde o último resumo:`,
        ...itens.map((i) => `${i.data} — ${i.texto}`),
        'Os detalhes estão no seu portal.',
      ],
      urlPortal: urlDoPortal(origin, c.token),
    });
    if (ok) {
      enviados += 1;
      void registrarEventoPortal(casoId, 'NOTIFICACAO', { herdeiro: c.nomeHerdeiro }, c.token);
    }
  }
  return enviados;
}

/** Documento aprovado/devolvido OU nova pendência — aviso a UM herdeiro. */
export async function notificarHerdeiro(
  convite: ConviteHerdeiro,
  aviso:
    | { tipo: 'DOC_ACEITO'; documento: string }
    | { tipo: 'DOC_RECUSADO'; documento: string; motivo?: string }
    | { tipo: 'PENDENCIA'; documento: string },
  origin: string,
): Promise<void> {
  if (!emailHabilitado()) return;
  const d = destino(convite);
  if (!d || d.pref !== 'tudo') return;
  const textos =
    aviso.tipo === 'DOC_ACEITO'
      ? {
          assunto: `Documento aprovado: ${aviso.documento}`,
          titulo: 'Documento aprovado',
          paragrafos: [
            `Olá, ${convite.nomeHerdeiro}.`,
            `O documento "${aviso.documento}" que você enviou foi conferido e aprovado. Obrigado!`,
          ],
        }
      : aviso.tipo === 'DOC_RECUSADO'
        ? {
            assunto: `Reenvio necessário: ${aviso.documento}`,
            titulo: 'Um documento precisa ser reenviado',
            paragrafos: [
              `Olá, ${convite.nomeHerdeiro}.`,
              `O documento "${aviso.documento}" precisa ser reenviado${aviso.motivo ? ` — motivo: ${aviso.motivo}` : ''}.`,
              'Abra o seu portal para enviar de novo em segundos.',
            ],
          }
        : {
            assunto: `Novo documento solicitado: ${aviso.documento}`,
            titulo: 'Precisamos de um documento seu',
            paragrafos: [
              `Olá, ${convite.nomeHerdeiro}.`,
              `O advogado pediu a você o documento "${aviso.documento}". Pelo portal, o envio leva menos de um minuto — pode ser foto do celular.`,
            ],
          };
  const ok = await enviarEmailPortal({
    para: d.para,
    ...textos,
    urlPortal: urlDoPortal(origin, convite.token),
  });
  if (ok) {
    void registrarEventoPortal(
      convite.casoId,
      'NOTIFICACAO',
      { herdeiro: convite.nomeHerdeiro, documento: aviso.documento },
      convite.token,
    );
  }
}

/**
 * "Perdi o link": reenvia o(s) link(s) do portal para um e-mail que conste
 * de algum convite (salvo no portal ou na qualificação). NUNCA confirma ao
 * chamador se o e-mail existe — resposta idêntica nos dois casos.
 */
export async function reenviarLinksPorEmail(email: string, origin: string): Promise<void> {
  if (!emailHabilitado()) return;
  const alvo = email.trim().toLowerCase();
  if (!/.+@.+\..+/.test(alvo)) return;
  try {
    // Convites vivem como Json — o filtro é em memória (volume pequeno; a
    // rota que chama aqui é limitada por resposta neutra e uso pontual).
    const linhas = await prisma.portalConvite.findMany({
      orderBy: { updatedAt: 'desc' },
      take: 2000,
      select: { dados: true },
    });
    const meus = linhas
      .map((l) => l.dados as unknown as ConviteHerdeiro)
      .filter((c) => !c.revogadoEm)
      .filter(
        (c) =>
          (c.emailNotificacao ?? '').toLowerCase() === alvo ||
          (c.qualificacao?.email ?? '').toLowerCase() === alvo,
      )
      .slice(0, 5);
    for (const c of meus) {
      const ok = await enviarEmailPortal({
        para: alvo,
        assunto: `Seu link de acompanhamento — inventário de ${c.nomeFalecido || 'família'}`,
        titulo: 'Aqui está o seu link',
        paragrafos: [
          `Olá, ${c.nomeHerdeiro}.`,
          `Este é o seu acesso ao acompanhamento do inventário de ${c.nomeFalecido || 'sua família'}. Guarde este e-mail — o link é pessoal.`,
        ],
        urlPortal: urlDoPortal(origin, c.token),
      });
      if (ok) {
        void registrarEventoPortal(c.casoId, 'NOTIFICACAO', { herdeiro: c.nomeHerdeiro }, c.token);
      }
    }
  } catch {
    // melhor-esforço
  }
}
