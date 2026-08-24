'use client';

/**
 * HUB da LexCausa — a primeira tela de quem entra logado no site: os cards
 * dos produtos que a conta pode usar. A PREFERÊNCIA "abrir direto" fica no
 * localStorage (`lexcausa-produto-padrao`): quem vive num produto só cai
 * nele sem passar por aqui — e o `?hub=1` (o clique na marca) é a escotilha
 * de volta, que nunca redireciona.
 */

import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';

import '@/app/lexcausa.css';

import { PRODUTOS_LEXCAUSA, TEXTO_LEGAL_RADAR } from '@/components/lexcausa/produtos';
import { LexTopbar } from '@/components/lexcausa/topbar';
import { useProgressRouter } from '@/components/navigation-progress';

const PREF_KEY = 'lexcausa-produto-padrao';

export function HubLexCausa({
  menu,
  perfil,
  ehMaster,
  radarAtivo,
  radarNovos = 0,
}: {
  menu: ReactNode;
  perfil: 'ADVOGADO' | 'ESCREVENTE' | null;
  ehMaster: boolean;
  radarAtivo: boolean;
  /** Casos novos no Radar desde a última visita — o aviso é AQUI, na
   *  plataforma (e-mail de caso novo não existe por decisão do escritório). */
  radarNovos?: number;
}) {
  const router = useProgressRouter();
  const [pref, setPref] = useState<string>('');

  // O Radar é ferramenta de advogado(a); escrevente vê só O Sucessorista.
  // Perfil ainda não escolhido (primeiro acesso) vê os dois — a escolha
  // acontece dentro do Sucessorista e vale dali em diante.
  const produtos = PRODUTOS_LEXCAUSA.filter(
    (p) => p.id !== 'radar' || perfil !== 'ESCREVENTE' || ehMaster,
  );

  // Preferência restaurada em efeito DIFERIDO (convenção do painel Meus
  // casos): o HTML do servidor e o primeiro render coincidem na hidratação.
  useEffect(() => {
    const t = setTimeout(() => {
      let guardada = '';
      try {
        guardada = localStorage.getItem(PREF_KEY) ?? '';
      } catch {
        /* modo privado/permissão negada: o hub simplesmente aparece */
      }
      setPref(guardada);
      const destino = PRODUTOS_LEXCAUSA.find((p) => p.id === guardada)?.href;
      if (destino && !new URLSearchParams(window.location.search).has('hub')) {
        router.replace(destino);
      }
    }, 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const marcarPref = (id: string, ligado: boolean) => {
    const valor = ligado ? id : '';
    setPref(valor);
    try {
      if (valor) localStorage.setItem(PREF_KEY, valor);
      else localStorage.removeItem(PREF_KEY);
    } catch {
      /* sem armazenamento, sem preferência — o hub continua funcionando */
    }
  };

  return (
    <div className="lexcausa" style={{ minHeight: '100vh' }}>
      <LexTopbar
        menu={menu}
        ehMaster={ehMaster}
        radarAtivo={radarAtivo}
        escrevente={perfil === 'ESCREVENTE'}
      />

      <main className="lc-miolo">
        <section className="lc-hero" style={{ paddingTop: 'var(--e-6)' }}>
          <span className="lc-eyebrow">Seus produtos</span>
          <h1>Por onde começamos hoje?</h1>
        </section>

        <div className="lc-cartoes">
          {produtos.map((p) => {
            const radarSemEnv = p.id === 'radar' && !radarAtivo;
            return (
              <section key={p.id} className={`lc-cartao ${p.classe}`}>
                <span className="lc-eyebrow">{p.perfis.join(' · ')}</span>
                <h3>{p.nome}</h3>
                <p style={{ margin: 0 }}>{p.tagline}</p>
                {p.id === 'radar' && radarNovos > 0 && (
                  <p style={{ margin: 0, fontWeight: 600, color: 'var(--lc-acento)' }}>
                    {radarNovos} caso(s) novo(s) na sua região desde a sua última visita.
                  </p>
                )}
                {radarSemEnv && (
                  <p className="lc-fund" style={{ margin: 0 }}>
                    Em ativação neste ambiente — a página do produto explica
                    como ele funciona.
                  </p>
                )}
                <div className="lc-acoes">
                  {radarSemEnv ? (
                    <Link className="lc-acao secundaria" href={p.landing}>
                      Conhecer o produto
                    </Link>
                  ) : (
                    <>
                      <Link className="lc-acao" href={p.href}>
                        Abrir {p.nome}
                      </Link>
                      <label
                        className="lc-fund"
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                      >
                        <input
                          type="checkbox"
                          checked={pref === p.id}
                          onChange={(e) => marcarPref(p.id, e.target.checked)}
                        />
                        abrir direto no próximo acesso
                      </label>
                    </>
                  )}
                </div>
              </section>
            );
          })}
          <section className="lc-cartao desabilitado">
            <span className="lc-eyebrow">Em breve</span>
            <h3>Novos produtos LexCausa</h3>
            <p style={{ margin: 0 }}>
              Novas ferramentas da prática sucessória entram aqui quando
              estiverem prontas de verdade.
            </p>
          </section>
        </div>

        <p className="lc-fund" style={{ marginTop: 'var(--e-6)' }}>
          {TEXTO_LEGAL_RADAR}
        </p>
      </main>
    </div>
  );
}
