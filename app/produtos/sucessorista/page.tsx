// Página institucional de O SUCESSORISTA — pública, no site da LexCausa.

import type { Metadata } from 'next';
import Link from 'next/link';

import '@/app/lexcausa.css';

import { MarcaLexCausa } from '@/components/lexcausa/marca';
import { requirePlataforma } from '@/lib/app';

export const metadata: Metadata = {
  title: 'O Sucessorista — LexCausa',
  description:
    'Gestão de inventários para a prática sucessória: composição familiar, acervo, quinhões com fundamento legal, cofre de documentos e espelho do ITCMD-SP.',
};

const FASES = [
  ['Composição', 'A família e a qualificação das partes, com leitura das certidões e o portal do herdeiro alimentando a folha.'],
  ['Acervo', 'Os bens com os valores que a lei pede — venal do óbito, venal corrente e avaliação — e o passivo do espólio.'],
  ['Quinhões', 'Meação por regime, legítima, colação e cenários de divisão, cada número com o seu fundamento legal.'],
  ['Cofre', 'O catálogo de documentos do inventário, com leitura por IA, conferência de validade e a montagem do processo.'],
  ['Espelho ITCMD', 'A declaração paulista espelhada com a provisão do imposto: atualização pela UFESP, multas e juros.'],
] as const;

export default async function ProdutoSucessoristaPage() {
  await requirePlataforma('SUCESSORISTA');
  return (
    <div className="lexcausa">
      <header className="lc-topo">
        <MarcaLexCausa href="/" sub="O Sucessorista · by LexCausa" />
        <nav aria-label="Entrar na plataforma">
          <Link className="lc-acao secundaria" href="/cadastro">Criar conta</Link>
          <Link className="lc-acao" href="/login">Entrar</Link>
        </nav>
      </header>

      <main className="lc-miolo produto-sucessorista">
        <section className="lc-hero">
          <span className="lc-eyebrow">O Sucessorista</span>
          <h1>O inventário, do primeiro dia ao encerramento</h1>
          <p className="lc-sub">
            Uma folha de trabalho contínua para o caso inteiro — o que se digita
            num campo move os números do painel na hora, e cada cálculo sai com
            o fundamento legal ao lado.
          </p>
        </section>

        <section className="lc-secao">
          <span className="lc-eyebrow">Como funciona</span>
          <h2>Cinco fases, uma folha</h2>
          <div className="lc-cartoes">
            {FASES.map(([nome, texto], i) => (
              <section key={nome} className="lc-cartao">
                <span className="lc-eyebrow">Fase {i + 1}</span>
                <h3>{nome}</h3>
                <p style={{ margin: 0 }}>{texto}</p>
              </section>
            ))}
          </div>
        </section>

        <section className="lc-secao lc-prosa">
          <span className="lc-eyebrow">Perfis atendidos</span>
          <h2>Dois ofícios, duas vestes</h2>
          <h3>Advogado(a)</h3>
          <p>
            Carteira de casos com o prazo do art. 611 vivo, honorários por
            complexidade, petição inicial e minuta ao Tabelionato, portal da
            família com deliberações — e a rede: Radar Sucessório e
            correspondentes por comarca.
          </p>
          <h3>Escrevente Notarial</h3>
          <p>
            A escritura do jeito do balcão: minuta calibrada por atos reais,
            base de emolumentos pelo Enunciado 7 do CNB/SP, conferência das
            certidões do registro civil e antecipador de exigências registrais
            (LRP, arts. 213 e 246).
          </p>
        </section>

        <section className="lc-secao lc-prosa">
          <span className="lc-eyebrow">Acesso</span>
          <h2>Como entrar</h2>
          <p>
            A conta é gratuita nesta fase de implantação — crie a sua e escolha
            o perfil no primeiro acesso. Os documentos são processados no seu
            navegador e os casos vivem na SUA pasta ou na SUA nuvem (Google
            Drive, OneDrive ou Dropbox), nunca soltos num servidor nosso.
          </p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Link className="lc-acao" href="/cadastro">Criar conta</Link>
            <Link className="lc-acao secundaria" href="/login">Já tenho conta</Link>
          </div>
        </section>

        <section className="lc-secao lc-prosa">
          <span className="lc-eyebrow">Perguntas frequentes</span>
          <h2>FAQ</h2>
          <details className="lc-faq">
            <summary>Os cálculos substituem a revisão do advogado?</summary>
            <p style={{ margin: 0 }}>
              Não. Toda saída — imposto, custas, quinhões, minutas — é cálculo
              de apoio e rascunho para aprovação humana. A revisão do(a)
              profissional responsável é obrigatória.
            </p>
          </details>
          <details className="lc-faq">
            <summary>Onde ficam os documentos dos meus clientes?</summary>
            <p style={{ margin: 0 }}>
              Na sua máquina ou na sua nuvem. O processamento acontece no
              navegador; conteúdo de documento só passa pelo servidor nas
              leituras por IA que você aciona, sem ficar guardado lá.
            </p>
          </details>
          <details className="lc-faq">
            <summary>Funciona no celular?</summary>
            <p style={{ margin: 0 }}>
              Sim — o app é instalável (PWA) e a folha inteira se adapta ao
              telefone, incluindo fotografar documentos direto para o cofre.
            </p>
          </details>
        </section>
      </main>

      <footer className="lc-noite lc-rodape">
        <div className="lc-miolo">
          <span>O Sucessorista · by LexCausa</span>
          <Link href="/">← Voltar à página inicial</Link>
        </div>
      </footer>
    </div>
  );
}
