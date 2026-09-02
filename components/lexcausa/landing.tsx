// LANDING INSTITUCIONAL DA LEXCAUSA — a raiz do apex (lexcausa.com.br,
// APP=hub): hero da marca, os produtos, a porta acolhedora das famílias e as
// áreas de atuação em linguagem acessível (educação do mercado + SEO).
//
// Ela morava na raiz do Sucessorista, mostrada a quem chegava deslogado. Com
// o apex ganhando deploy próprio, a marca passou a ter endereço só dela e a
// ferramenta ficou sem porta pública: em osucessorista.lexcausa.com.br quem
// não tem sessão vai direto para o login.
//
// Login, cadastro, /familias e /portal continuam no deploy da ferramenta, daí
// o `noSucessorista()` nos links — que segue relativo se um dia esta tela for
// montada lá de novo.

import Link from 'next/link';

import '@/app/lexcausa.css';

import { MarcaLexCausa } from '@/components/lexcausa/marca';
import { PRODUTOS_LEXCAUSA } from '@/components/lexcausa/produtos';
import { noSucessorista } from '@/components/lexcausa/sites';
import { emStandby } from '@/lib/standby';

export function LandingLexCausa() {
  return (
    <div className="lexcausa">
      <header className="lc-topo">
        <MarcaLexCausa href="/" />
        <nav aria-label="Entrar na plataforma">
          <Link className="lc-acao secundaria" href={noSucessorista("/cadastro")}>
            Criar conta
          </Link>
          <Link className="lc-acao" href={noSucessorista("/login")}>
            Entrar
          </Link>
        </nav>
      </header>

      <main className="lc-miolo">
        <section className="lc-hero">
          <span className="lc-eyebrow">LexCausa</span>
          <h1>A prática sucessória, organizada.</h1>
          <p className="lc-sub">
            A <strong>LexCausa</strong> conduz o inventário do primeiro
            atendimento ao registro: a folha de trabalho inteira — composição
            familiar, acervo, quinhões com fundamento legal, provisão de custos
            e ITCMD, minutas do balcão e o portal da família — num único lugar.
          </p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Link className="lc-acao" href={noSucessorista("/login")}>
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
            {PRODUTOS_LEXCAUSA.filter((p) => !emStandby(p.id)).map((p) => (
              <section key={p.id} className={`lc-cartao ${p.classe}`}>
                <span className="lc-eyebrow">{p.perfis.join(' · ')}</span>
                <h3>{p.nome}</h3>
                <p className="lc-fund" style={{ margin: 0 }}>{p.tagline}</p>
                <p style={{ margin: 0 }}>{p.descricao}</p>
                <div className="lc-acoes">
                  <Link className="lc-acao" href={noSucessorista("/login")}>
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
          <div className="lc-cartao produto-sucessorista" style={{ maxWidth: 720 }}>
            <span className="lc-eyebrow">Recebeu um link do cofre da família?</span>
            <h3>O escritório compartilhou o andamento com você</h3>
            <p style={{ margin: 0 }}>
              O próprio link que você recebeu é a sua entrada no portal da
              família — acompanhe as fases, envie os documentos pedidos e veja o
              que falta, sem cadastro.
            </p>
          </div>
          <p className="lc-fund" style={{ marginTop: 12 }}>
            Perdeu o link? <Link href={noSucessorista("/portal")}>Peça um novo aqui</Link>.
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
            caminho é o processo judicial. A LexCausa verifica a
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
        </div>
      </footer>
    </div>
  );
}
