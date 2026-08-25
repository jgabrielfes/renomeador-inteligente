/**
 * Varredura do AVISO HONESTO de 72h — SÓ SERVIDOR.
 *
 * Famílias com solicitação publicada há mais de 72h e NENHUMA resposta
 * recebem um e-mail que diz isso com todas as letras: ninguém respondeu
 * ainda, o resultado continua valendo com qualquer advogado(a) de confiança
 * e dá para retirar a solicitação a qualquer momento. O carimbo
 * `aviso72hEm` garante UM aviso por família.
 *
 * O motor vive aqui porque tem DOIS chamadores: o botão do /admin/radar
 * (varredura manual, sempre disponível) e a rota do cron
 * (`/api/radar/varredura`), que roda sozinha todo dia. Melhor-esforço: sem
 * `RESEND_API_KEY` nada é enviado e a contagem volta zerada.
 */

import { prisma } from '@/lib/prisma';
import { enviarEmailPortal } from '@/lib/portal/email';

export const HORAS_AVISO = 72;

/** Teto por execução — a varredura roda todo dia; lote grande não acumula. */
const LOTE = 50;

export async function varrerAviso72h(
  origin: string,
): Promise<{ ok: boolean; avisados?: number; erro?: string }> {
  try {
    const limite = new Date(Date.now() - HORAS_AVISO * 3_600_000);
    const pendentes = await prisma.familiaIntake.findMany({
      where: {
        status: 'publicado',
        publicadoEm: { lt: limite },
        aviso72hEm: null,
        // Basta o e-mail informado: a confirmação por link deixou de existir
        // (o aceite na tela publica), e `emailConfirmadoEm` só sobrevive nos
        // registros da era do link.
        email: { not: null },
      },
      take: LOTE,
    });
    let avisados = 0;
    for (const intake of pendentes) {
      const respostas = await prisma.radarResposta.count({ where: { intakeId: intake.id } });
      if (respostas > 0) continue; // já tem resposta — nada a avisar
      const enviado = await enviarEmailPortal({
        para: intake.email!,
        assunto: 'Sua solicitação segue publicada — ainda sem respostas',
        titulo: 'Sendo honestos com você',
        paragrafos: [
          `Olá${intake.nome ? `, ${intake.nome.split(/\s+/)[0]}` : ''}. Já se passaram ${HORAS_AVISO} horas e nenhum(a) advogado(a) respondeu à sua solicitação ainda.`,
          'Ela continua publicada (o caso fica visível por 90 dias) e avisaremos assim que chegar uma resposta. Enquanto isso, o seu resultado — estimativas, prazo e lista de documentos — funciona igual com um(a) advogado(a) da sua confiança, de onde você quiser.',
          'Se preferir, você pode retirar a solicitação a qualquer momento pelo link abaixo — isso apaga tudo do nosso servidor.',
        ],
        urlPortal: `${origin}/familias/minha-solicitacao/${intake.tokenGestao}`,
        rotuloBotao: 'Ver minha solicitação',
        rodape: 'Esta plataforma não intermedeia honorários nem indica advogados.',
      });
      if (enviado) {
        await prisma.familiaIntake.update({
          where: { id: intake.id },
          data: { aviso72hEm: new Date() },
        });
        avisados++;
      }
    }
    return { ok: true, avisados };
  } catch {
    return { ok: false, erro: 'Não foi possível executar a varredura.' };
  }
}
