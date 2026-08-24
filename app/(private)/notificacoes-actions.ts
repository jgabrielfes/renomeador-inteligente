'use server';

/**
 * CENTRAL DE NOTIFICAÇÕES da LexCausa — o sino do shell (topbar).
 *
 * Junta num lugar só o que está AGUARDANDO o(a) usuário(a) nos produtos,
 * derivado do banco a cada abertura (sem tabela de notificações — os
 * estados já existem): Radar (casos novos, conversas abertas) e a rede de
 * Diligências (ofertas aguardando escolha, termos a confirmar, relatórios a
 * concluir). Os avisos que dependem de dado LOCAL do caso (prazo do art.
 * 611, chegadas do cofre) continuam onde o dado vive: no painel Meus casos
 * e no sino do painel do caso — dado de caso não trafega para o servidor.
 */

import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { EH_SUCESSORISTA } from '@/lib/app';
import { radarAtivo } from '@/lib/radar/config';

export interface NotificacaoLexCausa {
  produto: 'Radar Sucessório' | 'Diligências';
  texto: string;
  href: string;
}

export async function notificacoesLexCausa(): Promise<NotificacaoLexCausa[]> {
  if (!EH_SUCESSORISTA) return [];
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return [];
  const itens: NotificacaoLexCausa[] = [];
  try {
    // Radar — casos novos desde a última visita + conversas abertas comigo.
    if (radarAtivo()) {
      const { casosNovosRadar } = await import('./radar/radar-actions');
      const novos = await casosNovosRadar();
      if (novos > 0) {
        itens.push({
          produto: 'Radar Sucessório',
          texto: `${novos} caso(s) novo(s) na sua região desde a sua última visita.`,
          href: '/radar',
        });
      }
      const conversas = await prisma.familiaIntake.count({
        where: { conversaAdvogadoUserId: userId, status: 'em_conversa' },
      });
      if (conversas > 0) {
        itens.push({
          produto: 'Radar Sucessório',
          texto: `${conversas} conversa(s) aberta(s) com família aguardando você.`,
          href: '/radar',
        });
      }
    }

    // Diligências — estados acionáveis dos DOIS lados.
    const [minhasAbertas, relatorios, termosAConfirmar] = await Promise.all([
      prisma.diligencia.findMany({
        where: { solicitanteUserId: userId, status: 'aberta' },
        select: { id: true },
      }),
      prisma.diligencia.count({
        where: { solicitanteUserId: userId, status: 'relatorio_entregue' },
      }),
      prisma.diligencia.count({
        where: { correspondenteUserId: userId, status: 'aceita' },
      }),
    ]);
    if (minhasAbertas.length > 0) {
      const comOferta = await prisma.diligenciaOferta.groupBy({
        by: ['diligenciaId'],
        where: { diligenciaId: { in: minhasAbertas.map((d) => d.id) } },
      });
      if (comOferta.length > 0) {
        itens.push({
          produto: 'Diligências',
          texto: `${comOferta.length} diligência(s) com respostas aguardando a sua escolha.`,
          href: '/diligencias',
        });
      }
    }
    if (relatorios > 0) {
      itens.push({
        produto: 'Diligências',
        texto: `${relatorios} relatório(s) entregue(s) — conclua e avalie.`,
        href: '/diligencias',
      });
    }
    if (termosAConfirmar > 0) {
      itens.push({
        produto: 'Diligências',
        texto: `${termosAConfirmar} termo(s) de referência aguardando a sua confirmação.`,
        href: '/diligencias',
      });
    }
  } catch {
    // melhor-esforço: sino vazio nunca quebra a página
  }
  return itens;
}
