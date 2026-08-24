/**
 * VITRINE DA LEXCAUSA — a raiz de lexcausa.com.br (APP=hub, ver lib/app.ts).
 *
 * Página pública e sem login: apresenta a marca e as três ferramentas, e cada
 * cartão leva ao site da sua ferramenta (`components/lexcausa/sites.ts` monta
 * o endereço conforme o ambiente — homologação leva a homologação).
 *
 * Hierarquia de marca: aqui ficam as FERRAMENTAS; os produtos sucessórios
 * (Radar Sucessório, Diligências) moram dentro do site do Sucessorista, que
 * tem a landing e o hub próprios. Por isso esta página não os repete — quem
 * quer o Radar entra por O Sucessorista.
 *
 * O cartão inteiro é o link. Isso amplia o alvo de clique e evita o vaivém de
 * "li o cartão, agora procuro o botão"; o "Abrir" é um span (um <a> dentro de
 * outro <a> seria marcação inválida), vestido como ação em app/lexcausa.css.
 */

import '@/app/lexcausa.css';

import { MarcaLexCausa } from '@/components/lexcausa/marca';
import { SITES_LEXCAUSA, urlDoSite } from '@/components/lexcausa/sites';

/** Contato da marca — `HUB_EMAIL_CONTATO` sobrescreve sem mexer no código. */
const EMAIL_CONTATO = process.env.HUB_EMAIL_CONTATO ?? 'contato@lexcausa.com.br';

export function VitrineLexCausa() {
  return (
    <div className="lexcausa">
      <header className="lc-topo">
        <MarcaLexCausa href="/" />
      </header>

      <main className="lc-miolo">
        <section className="lc-hero">
          <span className="lc-eyebrow">LexCausa</span>
          <h1>As ferramentas do escritório, num lugar só.</h1>
          <p className="lc-sub">
            Três ferramentas para o trabalho de todo dia: conduzir o inventário
            do primeiro atendimento ao registro, dar nome de gente aos
            documentos digitalizados e transformar a nota devolutiva do cartório
            em uma lista de trabalho. Escolha por onde começar.
          </p>
        </section>

        <section className="lc-secao" aria-label="Ferramentas da LexCausa">
          <div className="lc-cartoes">
            {SITES_LEXCAUSA.map((site) => (
              <a
                key={site.id}
                className={`lc-cartao ${site.classe}`}
                href={urlDoSite(site)}
              >
                <span className="lc-eyebrow">{site.perfis.join(' · ')}</span>
                <h2>{site.nome}</h2>
                <p className="lc-fund" style={{ margin: 0 }}>
                  {site.tagline}
                </p>
                <p style={{ margin: 0 }}>{site.descricao}</p>
                <span className="lc-acoes">
                  {/* Rótulo curto e igual nos três: com o nome do produto
                      dentro, o do Resolvedor quebrava em duas linhas e os
                      botões desalinhavam. O card inteiro é o link, então o
                      leitor de tela já anuncia o nome — este "Abrir" é
                      indicação visual, não a etiqueta do destino. */}
                  <span className="lc-abrir">Abrir →</span>
                </span>
              </a>
            ))}
          </div>
          <p className="lc-fund" style={{ marginTop: 'var(--e-4)' }}>
            Cada ferramenta pede a sua própria conta — criar acesso em uma não
            dá entrada nas outras.
          </p>
        </section>
      </main>

      <footer className="lc-noite lc-rodape">
        <div className="lc-miolo">
          <span>
            <span className="lc-eyebrow" style={{ display: 'inline' }}>
              LexCausa
            </span>{' '}
            — ferramentas de apoio à prática jurídica. Toda saída é rascunho
            para revisão profissional.
          </span>
          <span>
            Fale com a gente:{' '}
            <a href={`mailto:${EMAIL_CONTATO}`}>{EMAIL_CONTATO}</a>
          </span>
        </div>
      </footer>
    </div>
  );
}
