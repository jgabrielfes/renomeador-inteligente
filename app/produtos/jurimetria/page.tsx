// Página institucional da JURIMETRIA REGISTRAL — pública, no site da
// LexCausa. Promessa central por escrito: histórico de entendimentos
// públicos, nunca previsão ou garantia; documento lido no navegador.

import type { Metadata } from 'next';
import Link from 'next/link';

import '@/app/lexcausa.css';

import { MarcaLexCausa } from '@/components/lexcausa/marca';
import { requirePlataforma } from '@/lib/app';

export const metadata: Metadata = {
  title: 'Jurimetria Registral — LexCausa',
  description:
    'O histórico de exigências dos Registros de Imóveis, organizado por cartório e por tema, a partir de decisões públicas — para conferir o título antes do protocolo.',
};

export default async function ProdutoJurimetriaPage() {
  await requirePlataforma('HUB');
  return (
    <div className="lexcausa">
      <header className="lc-topo">
        <MarcaLexCausa href="/" sub="Jurimetria Registral · by LexCausa" />
        <nav aria-label="Entrar na plataforma">
          <Link className="lc-acao" href="/login">Entrar</Link>
        </nav>
      </header>

      <main className="lc-miolo produto-jurimetria">
        <section className="lc-hero">
          <span className="lc-eyebrow">Jurimetria Registral</span>
          <h1>O que os cartórios registraram de exigência — antes do seu protocolo</h1>
          <p className="lc-sub">
            Decisões públicas de dúvida registral e orientações dos próprios
            cartórios, lidas, anonimizadas e revisadas — organizadas por
            cartório e por tema.
          </p>
          <p className="lc-fund">
            Tudo aqui é histórico de entendimentos públicos, com a fonte de
            origem — nunca previsão, recomendação ou garantia de como um
            cartório decidirá o seu caso.
          </p>
        </section>

        <section className="lc-secao">
          <div className="lc-cartoes">
            <section className="lc-cartao">
              <span className="lc-eyebrow">Arraste o título</span>
              <h3>Confira a minuta antes de protocolar</h3>
              <p style={{ margin: 0 }}>
                Solte o título ou a minuta e veja o histórico de exigências em
                atos parecidos, no cartório de destino. O documento é lido{' '}
                <strong>no seu navegador</strong> e não é enviado a lugar
                nenhum — a consulta usa só o tipo de ato e os temas detectados.
              </p>
            </section>
            <section className="lc-cartao">
              <span className="lc-eyebrow">Navegue sem documento</span>
              <h3>Cartório por cartório, tema por tema</h3>
              <p style={{ margin: 0 }}>
                Escolha o Registro de Imóveis ou o tema (certidões fiscais,
                qualificação das partes, continuidade registral…) e leia as
                exigências históricas com a decisão pública de origem e a data.
              </p>
            </section>
            <section className="lc-cartao">
              <span className="lc-eyebrow">Base viva e revisada</span>
              <h3>Coleta diária com revisão humana</h3>
              <p style={{ margin: 0 }}>
                A base cresce todos os dias a partir de fontes públicas
                (sentenças de dúvida do TJSP, dados oficiais do CNJ), passa por
                anonimização automática e só é publicada depois de revisão —
                LGPD por construção.
              </p>
            </section>
          </div>
          <div className="lc-acoes" style={{ marginTop: 'var(--e-4)' }}>
            <Link className="lc-acao" href="/jurimetria">Abrir a consulta</Link>
            <Link className="lc-acao secundaria" href="/?hub=1">Ver todos os produtos</Link>
          </div>
        </section>
      </main>
    </div>
  );
}
