'use client';

/**
 * HUB da LexCausa — a tela de entrada de quem loga: a marca, a descrição da
 * ferramenta e o botão "Entrar na ferramenta", que abre Meus Casos (`/s`).
 *
 * A LexCausa voltou a ser UMA ferramenta (a prática sucessória); Radar,
 * Diligências e Jurimetria estão em standby (lib/standby.ts). Por isso o hub
 * deixou de ser uma vitrine de produtos e virou a porta única da plataforma —
 * quem escolheu "abrir direto" em /config (localStorage `lexcausa-produto-
 * padrao`) pula esta tela e cai em /s; o `?hub=1` (clique na marca) é a
 * escotilha que nunca redireciona.
 */

import { useEffect, type ReactNode } from 'react';
import Link from 'next/link';

import '@/app/lexcausa.css';

import { LexTopbar } from '@/components/lexcausa/topbar';
import { useProgressRouter } from '@/components/navigation-progress';

const PREF_KEY = 'lexcausa-produto-padrao';

export function HubLexCausa({
  menu,
  ehMaster,
}: {
  menu: ReactNode;
  ehMaster: boolean;
}) {
  const router = useProgressRouter();

  // "Abrir direto" (editada em /config) lida em efeito DIFERIDO (convenção):
  // o HTML do servidor e o primeiro render coincidem na hidratação. Com uma
  // ferramenta só, qualquer preferência salva leva a /s.
  useEffect(() => {
    const t = setTimeout(() => {
      let guardada = '';
      try {
        guardada = localStorage.getItem(PREF_KEY) ?? '';
      } catch {
        /* modo privado/permissão negada: o hub simplesmente aparece */
      }
      if (guardada === 'sucessorista' && !new URLSearchParams(window.location.search).has('hub')) {
        router.replace('/s');
      }
    }, 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="lexcausa" style={{ minHeight: '100vh' }}>
      <LexTopbar menu={menu} ehMaster={ehMaster} radarAtivo={false} />

      <main className="lc-miolo">
        <section className="lc-hero" style={{ paddingTop: 'var(--e-6)' }}>
          <span className="lc-eyebrow">LexCausa</span>
          <h1>A prática sucessória, organizada</h1>
          <p className="lc-sub">
            A folha de trabalho do inventário inteira, num lugar só: composição
            familiar e qualificação das partes, acervo com os valores que a lei
            pede, quinhões com fundamento legal, provisão de custos e ITCMD,
            minutas do balcão e o portal da família — do primeiro atendimento ao
            registro.
          </p>
        </section>

        <div className="lc-cartoes">
          <section className="lc-cartao produto-sucessorista">
            <h3>Meus casos</h3>
            <p style={{ margin: 0 }}>
              Continue de onde parou — seus casos vivem na sua pasta ou na sua
              nuvem, e tudo se salva sozinho. Cálculo de apoio: a revisão do
              advogado responsável é obrigatória.
            </p>
            <div className="lc-acoes">
              <Link className="lc-acao" href="/s">
                Entrar na ferramenta
              </Link>
            </div>
          </section>

          <section className="lc-cartao desabilitado">
            <span className="lc-eyebrow">Em breve</span>
            <h3>Novos módulos LexCausa</h3>
            <p style={{ margin: 0 }}>
              Novas ferramentas da prática sucessória entram aqui quando
              estiverem prontas de verdade.
            </p>
          </section>
        </div>
      </main>
    </div>
  );
}
