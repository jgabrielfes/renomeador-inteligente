// Landing PÚBLICA da LEXCAUSA — quem chega em `/` DESLOGADO vê a marca-mãe:
// hero institucional, os produtos (O Sucessorista e Radar Sucessório), a
// porta acolhedora das famílias e as áreas de atuação em linguagem acessível
// (educação do mercado + SEO). Quem já tem sessão nunca vê esta tela — a
// raiz logada é o HUB de produtos (gate em app/(private)/page.tsx).

import Link from 'next/link';

import '@/app/lexcausa.css';

import { MarcaLexCausa } from '@/components/lexcausa/marca';
import { PRODUTOS_LEXCAUSA, TEXTO_LEGAL_RADAR } from '@/components/lexcausa/produtos';

export function EntradaSucessorista() {
  return (
    <div className="lexcausa">
      <header className="lc-topo">
        <MarcaLexCausa href="/" />
        <nav aria-label="Entrar na plataforma">
          <Link className="lc-acao secundaria" href="/familias">
            Para famílias
          </Link>
          <Link className="lc-acao secundaria" href="/cadastro">
            Criar conta
          </Link>
          <Link className="lc-acao" href="/login">
            Entrar
          </Link>
        </nav>
      </header>

      <main className="lc-miolo">
        <section className="lc-hero">
          <span className="lc-eyebrow">LexCausa</span>
          <h1>A prática sucessória, organizada.</h1>
          <p className="lc-sub">
            Uma casa, três ofícios: <strong>O Sucessorista</strong> conduz o
            inventário do primeiro atendimento ao registro; o{' '}
            <strong>Radar Sucessório</strong> aproxima famílias que precisam de
            um inventário de advogados(as) verificados(as); e as{' '}
            <strong>Diligências entre advogados</strong> resolvem o ato em outra
            comarca com correspondentes verificados. Um único login dá acesso ao
            que a sua conta pode usar.
          </p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Link className="lc-acao" href="/login">
              Entrar
            </Link>
            <Link className="lc-acao secundaria" href="#produtos">
              Conhecer os produtos
            </Link>
          </div>
        </section>

        <section className="lc-secao" id="produtos" aria-label="Nossos produtos">
          <span className="lc-eyebrow">Nossos produtos</span>
          <h2>Cada etapa do ofício tem a sua ferramenta</h2>
          <div className="lc-cartoes">
            {PRODUTOS_LEXCAUSA.map((p) => (
              <section key={p.id} className={`lc-cartao ${p.classe}`}>
                <span className="lc-eyebrow">{p.perfis.join(' · ')}</span>
                <h3>{p.nome}</h3>
                <p className="lc-fund" style={{ margin: 0 }}>{p.tagline}</p>
                <p style={{ margin: 0 }}>{p.descricao}</p>
                <div className="lc-acoes">
                  <Link className="lc-acao" href="/login">
                    Entrar
                  </Link>
                  <Link className="lc-acao secundaria" href={p.landing}>
                    Saiba mais
                  </Link>
                </div>
              </section>
            ))}
            <section className="lc-cartao desabilitado">
              <span className="lc-eyebrow">Em breve</span>
              <h3>Novos produtos LexCausa</h3>
              <p style={{ margin: 0 }}>
                A casa cresce no mesmo ritmo do balcão: novas ferramentas para a
                prática sucessória entram aqui quando estiverem prontas de
                verdade.
              </p>
            </section>
          </div>
        </section>

        <section className="lc-secao" aria-label="Para famílias">
          <div className="lc-cartao produto-radar" style={{ maxWidth: 720 }}>
            <span className="lc-eyebrow">Para famílias — gratuito, sem cadastro</span>
            <h3>Perdeu alguém e não sabe por onde começar?</h3>
            <p style={{ margin: 0 }}>
              Responda até 12 perguntas simples e veja na hora: cartório ou
              justiça, uma estimativa do imposto e dos custos, o prazo legal e a
              lista de documentos para separar. Sem juridiquês e sem pedir dado
              sensível — os valores entram por faixa.
            </p>
            <div className="lc-acoes">
              <Link className="lc-acao" href="/familias">
                Começar agora
              </Link>
              <Link className="lc-acao secundaria" href="/familias/guias">
                Ler os guias
              </Link>
            </div>
          </div>
          <p className="lc-fund" style={{ marginTop: 12 }}>
            Recebeu do escritório um link do cofre da família? O próprio link é
            a sua entrada — se o perdeu, <Link href="/portal">peça um novo aqui</Link>.
          </p>
        </section>

        <section className="lc-secao lc-prosa" aria-label="Áreas de atuação">
          <span className="lc-eyebrow">Áreas de atuação</span>
          <h2>Direito sucessório, explicado sem juridiquês</h2>
          <h3>Inventário extrajudicial e judicial</h3>
          <p>
            Inventário é o procedimento que transfere os bens de quem faleceu
            aos herdeiros. Quando todos são capazes e estão de acordo, ele pode
            ser feito em cartório, por escritura pública (CPC, art. 610) —
            costuma ser mais rápido. Havendo menor, incapaz ou desacordo, o
            caminho é o processo judicial. O Sucessorista verifica a
            elegibilidade do rito e conduz os dois caminhos.
          </p>
          <h3>ITCMD em São Paulo</h3>
          <p>
            O ITCMD é o imposto estadual sobre a herança. Em São Paulo a
            alíquota é de 4%, com atualização pela UFESP, prazos que correm da
            data do falecimento e hipóteses de isenção previstas em lei. A
            plataforma projeta o imposto com multas e juros — sempre como
            cálculo de apoio, conferido pelo(a) profissional responsável.
          </p>
          <h3>Partilha e planejamento</h3>
          <p>
            A partilha define o quinhão de cada herdeiro, respeitando a meação
            do cônjuge, o regime de bens e a legítima. Cenários diferentes de
            divisão têm custos tributários diferentes — a plataforma os compara
            lado a lado, com o fundamento legal de cada número, para a decisão
            ser informada.
          </p>
        </section>
      </main>

      <footer className="lc-noite lc-rodape">
        <div className="lc-miolo">
          <span>
            <span className="lc-eyebrow" style={{ display: 'inline' }}>LexCausa</span>{' '}
            — ferramentas de apoio à prática sucessória. Toda saída é rascunho
            para revisão profissional.
          </span>
          <span>{TEXTO_LEGAL_RADAR}</span>
        </div>
      </footer>
    </div>
  );
}
