// Diligências entre advogados (camada 4, pilar B) — perfil de correspondente,
// diligências abertas e as minhas (como solicitante e como correspondente).
// Rota do site do Sucessorista, só logado.

import type { Metadata } from 'next';

import { LexTopbar } from '@/components/lexcausa/topbar';
import { AvatarSessao } from '@/components/lexcausa/avatar-sessao';
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

  const session = await auth();
  const master = isMaster(session);

  const estado = await estadoCorrespondente();
  const minhas = await minhasDiligencias();
  let abertas: DiligenciaResumo[] = [];
  // MASTER vê TODAS as abertas mesmo sem perfil de correspondente
  // (operação da plataforma) — a action já dispensa selo/perfil/comarca.
  if (estado.ok && ((estado.perfil?.ativo === true && estado.selo === true) || master)) {
    const r = await diligenciasAbertas();
    if (r.ok) abertas = r.abertas;
  }

  return (
    <>
      <LexTopbar menu={<AvatarSessao />} ehMaster={master} radarAtivo={radarAtivo()} />
      <DiligenciasClient
        estado={estado.ok ? estado : null}
        ehMaster={master}
        solicitadas={minhas.ok ? minhas.solicitadas : []}
        aceitas={minhas.ok ? minhas.aceitas : []}
        abertas={abertas}
      />
    </>
  );
}
