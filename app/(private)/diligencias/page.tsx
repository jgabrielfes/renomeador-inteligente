// Diligências entre advogados (camada 4, pilar B) — perfil de correspondente,
// diligências abertas e as minhas (como solicitante e como correspondente).
// Rota do site do Sucessorista, só logado.

import type { Metadata } from 'next';

import { LexTopbar } from '@/components/lexcausa/topbar';
import { UserMenu } from '@/components/user-menu';
import { requirePlataforma } from '@/lib/app';
import { auth, isMaster, requireSession } from '@/lib/auth';
import { radarAtivo } from '@/lib/radar/config';
import {
  diligenciasAbertas,
  estadoCorrespondente,
  minhasDiligencias,
  type DiligenciaResumo,
} from './diligencias-actions';
import { DiligenciasClient } from './diligencias-client';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Diligências — O Sucessorista',
  robots: { index: false },
};

export default async function DiligenciasPage() {
  await requirePlataforma('SUCESSORISTA');
  await requireSession('/diligencias');

  const estado = await estadoCorrespondente();
  const minhas = await minhasDiligencias();
  let abertas: DiligenciaResumo[] = [];
  if (estado.ok && (estado.perfil?.ativo || false) && estado.selo) {
    const r = await diligenciasAbertas();
    if (r.ok) abertas = r.abertas;
  }

  const session = await auth();
  return (
    <>
      <LexTopbar menu={<UserMenu />} ehMaster={isMaster(session)} radarAtivo={radarAtivo()} />
      <DiligenciasClient
        estado={estado.ok ? estado : null}
        solicitadas={minhas.ok ? minhas.solicitadas : []}
        aceitas={minhas.ok ? minhas.aceitas : []}
        abertas={abertas}
      />
    </>
  );
}
