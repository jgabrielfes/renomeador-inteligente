// Radar de famílias — a tela do(a) ADVOGADO(A): habilitação (OAB verificada
// manualmente + quiz deontológico + assinatura mensal por UF) e a lista de
// casos ANÔNIMOS publicados pelas famílias, em ordem única por data. A rota
// só existe no site do Sucessorista e com o Radar ligado por env.

import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { LexTopbar } from '@/components/lexcausa/topbar';
import { UserMenu } from '@/components/user-menu';
import { requirePlataforma } from '@/lib/app';
import { auth, isMaster, requireSession } from '@/lib/auth';
import { radarAtivo } from '@/lib/radar/config';
import {
  estadoRadarAdvogado,
  listarCasosRadar,
  minhasRespostasRadar,
  type CasoRadar,
  type RespostaMinha,
} from './radar-actions';
import { RadarClient } from './radar-client';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Radar Sucessório — LexCausa',
  robots: { index: false },
};

export default async function RadarPage() {
  await requirePlataforma('SUCESSORISTA');
  if (!radarAtivo()) notFound();
  await requireSession('/radar');

  const estado = await estadoRadarAdvogado();
  let casos: CasoRadar[] = [];
  let minhas: RespostaMinha[] = [];
  if (estado?.habilitado) {
    const [r, m] = await Promise.all([listarCasosRadar(), minhasRespostasRadar()]);
    if (r.ok) casos = r.casos;
    if (m.ok) minhas = m.respostas;
  }
  const session = await auth();
  return (
    <>
      <LexTopbar
        menu={<UserMenu />}
        ehMaster={isMaster(session)}
        radarAtivo
        sub="Radar Sucessório · by LexCausa"
      />
      <RadarClient estado={estado} casos={casos} minhasRespostas={minhas} />
    </>
  );
}
