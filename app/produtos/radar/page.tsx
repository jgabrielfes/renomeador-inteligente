// Página institucional do RADAR SUCESSÓRIO — pública, no site da LexCausa.
// Linguagem dupla: técnica para o(a) advogado(a), acolhedora para a família.
// Os trilhos éticos (docs/etica-oab.md) aparecem por escrito — são promessa
// de produto, não miúdo de rodapé.

import type { Metadata } from 'next';
import Link from 'next/link';

import '@/app/lexcausa.css';

import { MarcaLexCausa } from '@/components/lexcausa/marca';
import { TEXTO_LEGAL_RADAR } from '@/components/lexcausa/produtos';
import { requirePlataforma } from '@/lib/app';

export const metadata: Metadata = {
  title: 'Radar Sucessório — LexCausa',
  description:
    'O encontro entre famílias que precisam resolver um inventário e advogados(as) verificados(as) — com ética OAB por construção: a família escolhe, a plataforma não intermedeia honorários.',
};

export default async function ProdutoRadarPage() {
  // Página institucional: vive no apex da marca (lexcausa.com.br).
  await requirePlataforma('HUB');
  return (
    <div className="lexcausa">
      <header className="lc-topo">
        <MarcaLexCausa href="/" sub="Radar Sucessório · by LexCausa" />
        <nav aria-label="Entrar na plataforma">
          <Link className="lc-acao secundaria" href="/familias">Para famílias</Link>
          <Link className="lc-acao" href="/login">Entrar</Link>
        </nav>
      </header>

      <main className="lc-miolo produto-radar">
        <section className="lc-hero">
          <span className="lc-eyebrow">Radar Sucessório</span>
          <h1>Quem precisa encontra quem entende</h1>
          <p className="lc-sub">
            De um lado, famílias que perderam alguém e não sabem por onde
            começar. Do outro, advogados(as) de sucessões verificados(as). O
            Radar aproxima os dois — e quem escolhe é sempre a família.
          </p>
          <p className="lc-fund">{TEXTO_LEGAL_RADAR}</p>
        </section>

        <section className="lc-secao">
          <div className="lc-cartoes">
            <section className="lc-cartao">
              <span className="lc-eyebrow">Para famílias — gratuito</span>
              <h3>Comece sem cadastro e sem juridiquês</h3>
              <p style={{ margin: 0 }}>
                Um questionário simples mostra na hora se o caso vai a cartório
                ou à justiça, quanto custa aproximadamente e quais documentos
                separar. Se quiser, você pede a análise de advogados(as) — o seu
                caso é publicado <strong>sem nome e sem contato</strong>, e só
                quem VOCÊ escolher para conversar recebe o seu telefone.
              </p>
              <div className="lc-acoes">
                <Link className="lc-acao" href="/familias">Começar agora</Link>
                <Link className="lc-acao secundaria" href="/familias/guias">Ler os guias</Link>
              </div>
            </section>
            <section className="lc-cartao">
              <span className="lc-eyebrow">Para advogados(as)</span>
              <h3>Conexão qualificada, nunca leilão</h3>
              <p style={{ margin: 0 }}>
                Casos anônimos da sua UF em ordem única por data — sem ranking,
                sem preço, sem disputa. A habilitação pede OAB verificada e um
                questionário deontológico; a assinatura é mensal por UF, jamais
                comissão por caso. Fechou? Um código importa o caso direto para
                O Sucessorista, com a folha pré-preenchida.
              </p>
              <div className="lc-acoes">
                <Link className="lc-acao" href="/login">Entrar</Link>
                <Link className="lc-acao secundaria" href="/cadastro">Criar conta</Link>
              </div>
            </section>
          </div>
        </section>

        <section className="lc-secao lc-prosa">
          <span className="lc-eyebrow">Ética por construção</span>
          <h2>Conformidade com o Provimento 205/2021</h2>
          <ul className="lc-lista">
            <li>A família SOLICITA; advogados respondem. Nenhum contato nasce do lado profissional.</li>
            <li>Respostas em ordem aleatória fixa, sempre com nome e OAB — sem ranking, sem destaque pago.</li>
            <li>Honorários são tratados diretamente entre família e advogado(a), fora da plataforma.</li>
            <li>Até dois advogados(as) por caso (o marcador X/2): a família não é leiloada.</li>
            <li>Retirar a solicitação apaga tudo — inclusive as conversas.</li>
          </ul>
          <p className="lc-fund">{TEXTO_LEGAL_RADAR}</p>
        </section>

        <section className="lc-secao lc-prosa">
          <span className="lc-eyebrow">Perguntas frequentes</span>
          <h2>FAQ</h2>
          <details className="lc-faq">
            <summary>Quanto custa para a família?</summary>
            <p style={{ margin: 0 }}>
              Nada. O questionário, o resultado, os guias e o pedido de análise
              são gratuitos, sem cadastro e sem cartão.
            </p>
          </details>
          <details className="lc-faq">
            <summary>Como o advogado se habilita?</summary>
            <p style={{ margin: 0 }}>
              Três passos: verificação manual da OAB, questionário deontológico
              (10 de 10) e assinatura mensal da(s) UF(s) de atuação — concedida
              manualmente, nunca automática.
            </p>
          </details>
          <details className="lc-faq">
            <summary>A plataforma indica o &ldquo;melhor&rdquo; advogado?</summary>
            <p style={{ margin: 0 }}>
              Não. Não há ranking, avaliação pública nem destaque pago. As
              respostas chegam em ordem aleatória fixa e a escolha é
              integralmente da família.
            </p>
          </details>
        </section>
      </main>

      <footer className="lc-noite lc-rodape">
        <div className="lc-miolo">
          <span>Radar Sucessório · by LexCausa</span>
          <Link href="/">← Voltar à página inicial</Link>
        </div>
      </footer>
    </div>
  );
}
