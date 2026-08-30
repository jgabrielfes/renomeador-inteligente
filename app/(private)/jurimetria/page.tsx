// Jurimetria Registral — a CONSULTA (produto LexCausa, só no site do
// Sucessorista). A tela é TEMA-PRIMEIRO: o usuário chega com um problema,
// abre o tema na lista (A–Z, itens recolhidos; filtros na query string,
// como manda a convenção) e cruza com o Registro de Imóveis que quiser —
// o resumo traz os percentuais das dúvidas julgadas. Abaixo ficam o
// arraste de documentos (leitura no navegador; ao servidor vai só
// cartório+ato+temas) e o depósito de notas devolutivas.
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

  // Filtros validados contra a LISTA FECHADA do catálogo (convenção /admin);
  // "sem-tema" é o pseudo-tema da linha "Ainda sem tema" da lista.
  const cartorioAtivo = cartorios.some((c) => c.id === cartorio) ? cartorio! : null;
  const temaAtivo =
    tema === 'sem-tema' ? 'sem-tema' : temas.some((t) => t.id === tema) ? tema! : null;

  // O histórico só é consultado com um tema ABERTO — a lista recolhida
  // vive das contagens do catálogo.
  const historico = temaAtivo
    ? await consultarJurimetria(
        temaAtivo === 'sem-tema'
          ? { cartorioId: cartorioAtivo, semTema: true }
          : { cartorioId: cartorioAtivo, temas: [temaAtivo] },
      )
    : null;

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
        totalPublicado={catalogo.ok ? catalogo.totalPublicado : 0}
        semTemaN={catalogo.ok ? catalogo.semTema : 0}
        cartorioAtivo={cartorioAtivo}
        temaAtivo={temaAtivo}
        historico={historico && historico.ok ? historico : null}
      />
    </div>
  );
}
