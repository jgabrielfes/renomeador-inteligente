// Radar de famílias — a tela do(a) ADVOGADO(A): habilitação (OAB verificada
// manualmente + quiz deontológico + assinatura mensal por UF) e a lista de
// casos ANÔNIMOS publicados pelas famílias, em ordem única por data. A rota
// só existe no site do Sucessorista e com o Radar ligado por env.

import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { requirePlataforma } from '@/lib/app';
import { requireSession } from '@/lib/auth';
import { radarAtivo } from '@/lib/radar/config';
import { estadoRadarAdvogado, listarCasosRadar, type CasoRadar } from './radar-actions';
import { RadarClient } from './radar-client';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Radar de famílias — O Sucessorista',
  robots: { index: false },
};

export default async function RadarPage() {
  await requirePlataforma('SUCESSORISTA');
  if (!radarAtivo()) notFound();
  await requireSession('/radar');

  const estado = await estadoRadarAdvogado();
  let casos: CasoRadar[] = [];
  if (estado?.habilitado) {
    const r = await listarCasosRadar();
    if (r.ok) casos = r.casos;
  }
  return <RadarClient estado={estado} casos={casos} />;
}
