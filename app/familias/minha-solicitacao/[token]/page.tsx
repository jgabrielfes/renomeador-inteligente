// "Minha solicitação" — o painel do herdeiro no Radar (token = credencial):
// status honesto, o resumo ANÔNIMO que os advogados veem (transparência) e o
// botão de retirar, que apaga tudo do servidor.

import type { Metadata } from 'next';

import { requirePlataforma } from '@/lib/app';
import { prisma } from '@/lib/prisma';
import { sanitizarRespostas } from '@/lib/familias/sanitizar';
import { anonimizarIntake, type CasoAnonimo } from '@/lib/radar/anonimizar';
import { MinhaSolicitacaoClient } from './minha-solicitacao-client';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Minha solicitação — O Sucessorista',
  robots: { index: false },
};

const HORAS_AVISO = 72;

const horasDesde = (d: Date): number => Math.floor((Date.now() - d.getTime()) / 3_600_000);

export default async function MinhaSolicitacaoPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  await requirePlataforma('SUCESSORISTA');
  const { token } = await params;

  let dados: {
    status: string;
    publicadoEm: string | null;
    horasSemResposta: number | null;
    casoAnonimo: CasoAnonimo | null;
    urlResultado: string;
  } | null = null;
  try {
    const intake = await prisma.familiaIntake.findUnique({
      where: { tokenGestao: token.slice(0, 120) },
    });
    if (intake && intake.status !== 'retirado' && intake.expiraEm > new Date()) {
      const respostas = sanitizarRespostas(intake.respostas);
      const publicado = intake.publicadoEm !== null && intake.status !== 'resultado';
      dados = {
        status: intake.status,
        publicadoEm: intake.publicadoEm?.toISOString() ?? null,
        horasSemResposta:
          publicado && intake.publicadoEm ? horasDesde(intake.publicadoEm) : null,
        casoAnonimo:
          publicado && respostas && intake.publicadoEm
            ? anonimizarIntake({
                id: intake.id,
                respostas,
                pequenoValor: intake.pequenoValor,
                publicadoEm: intake.publicadoEm.toISOString(),
              })
            : null,
        urlResultado: `/familias/resultado/${intake.tokenGestao}`,
      };
    }
  } catch {
    dados = null;
  }

  return (
    <MinhaSolicitacaoClient token={token} dados={dados} horasAviso={HORAS_AVISO} />
  );
}
