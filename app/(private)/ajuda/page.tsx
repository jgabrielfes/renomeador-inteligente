// HUB DE AJUDA da LexCausa — "Ajuda e Tutoriais": busca no manual, áreas na
// lateral e a TRILHA DE PARTIDA com progresso por artigo (localStorage). Os
// "Como funciona" por produto (/ajuda/sucessorista, /ajuda/radar) continuam
// como leitura longa; aqui é o índice vivo.

import type { Metadata } from 'next';

import '@/app/lexcausa.css';

import { AvatarSessao } from '@/components/lexcausa/avatar-sessao';
import { LexTopbar } from '@/components/lexcausa/topbar';
import { requirePlataforma } from '@/lib/app';
import { auth, isMaster, requireSession } from '@/lib/auth';
import { radarAtivo } from '@/lib/radar/config';

import { AjudaHub } from './ajuda-hub-client';

export const metadata: Metadata = {
  title: 'Ajuda e Tutoriais — LexCausa',
  robots: { index: false },
};

export default async function AjudaHubPage() {
  await requirePlataforma('SUCESSORISTA');
  await requireSession('/ajuda');
  const session = await auth();
  return (
    <>
      <LexTopbar menu={<AvatarSessao />} ehMaster={isMaster(session)} radarAtivo={radarAtivo()} />
      <div className="lexcausa" style={{ minHeight: '100vh' }}>
        <main className="lc-miolo">
          <section className="lc-hero" style={{ paddingTop: 'var(--e-6)' }}>
            <span className="lc-eyebrow">Hub de ajuda</span>
            <h1>Ajuda e Tutoriais</h1>
            <p className="lc-sub">
              Manual de uso da LexCausa — trilha de partida, artigos por área e os
              guias completos de cada produto.
            </p>
          </section>
          <AjudaHub />
        </main>
      </div>
    </>
  );
}
