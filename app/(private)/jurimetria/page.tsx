// Jurimetria Registral — a CONSULTA (produto LexCausa, só no site do
// Sucessorista). Dois modos na mesma tela: arrastar o título (leitura no
// navegador; ao servidor vai só cartório+ato+temas) e navegar por
// cartório × tema (filtros na query string, como manda a convenção).
// Tudo que aparece é HISTÓRICO publicado e revisado — nunca previsão.

import type { Metadata } from 'next';

import { AvatarSessao } from '@/components/lexcausa/avatar-sessao';
import { LexTopbar } from '@/components/lexcausa/topbar';
import { requirePlataforma } from '@/lib/app';
import { auth, isMaster, requireSession } from '@/lib/auth';
import { radarAtivo } from '@/lib/radar/config';

import { catalogoJurimetria, consultarJurimetria } from './actions';
import { JurimetriaClient } from './jurimetria-client';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Jurimetria Registral — LexCausa',
  robots: { index: false },
};

export default async function JurimetriaPage({
  searchParams,
}: {
  searchParams: Promise<{ cartorio?: string; tema?: string }>;
}) {
  await requirePlataforma('SUCESSORISTA');
  await requireSession('/jurimetria');
  const session = await auth();

  const [{ cartorio, tema }, catalogo] = await Promise.all([
    searchParams,
    catalogoJurimetria(),
  ]);
  const cartorios = catalogo.ok ? catalogo.cartorios : [];
  const temas = catalogo.ok ? catalogo.temas : [];

  // Filtros validados contra a LISTA FECHADA do catálogo (convenção /admin).
  const cartorioAtivo = cartorios.some((c) => c.id === cartorio) ? cartorio! : null;
  const temaAtivo = temas.some((t) => t.id === tema) ? tema! : null;

  const historico = await consultarJurimetria({
    cartorioId: cartorioAtivo,
    temas: temaAtivo ? [temaAtivo] : [],
  });

  return (
    <div className="lexcausa" style={{ minHeight: '100vh' }}>
      <LexTopbar
        menu={<AvatarSessao />}
        ehMaster={isMaster(session)}
        radarAtivo={radarAtivo()}
        sub="Jurimetria Registral · by LexCausa"
      />
      <JurimetriaClient
        cartorios={cartorios}
        temas={temas}
        cartorioAtivo={cartorioAtivo}
        temaAtivo={temaAtivo}
        historico={historico.ok ? historico : null}
      />
    </div>
  );
}
