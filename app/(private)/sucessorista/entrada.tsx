// Entrada PÚBLICA do site do Sucessorista — quem chega em `/` DESLOGADO
// escolhe a porta (como a home do Jusbrasil): o escritório entra pelo login;
// a família vai para a área gratuita /familias. Quem já tem sessão nunca vê
// esta tela — a raiz continua sendo a ferramenta (gate em app/(private)/page.tsx).

import type { CSSProperties } from 'react';
import Link from 'next/link';

import './sucessorista.css';

const cartao: CSSProperties = {
  flex: '1 1 260px',
  display: 'flex',
  flexDirection: 'column',
  gap: 10,
  margin: 0,
};

const botao: CSSProperties = { textDecoration: 'none', display: 'inline-block' };

export function EntradaSucessorista() {
  return (
    <div className="sucessorista">
      <main className="folha" style={{ margin: '0 auto', maxWidth: 960 }}>
        <span className="eyebrow">O Sucessorista</span>
        <h1>O inventário, do primeiro dia ao encerramento</h1>
        <p className="subtitulo">
          Três portas, um mesmo cuidado — escolha a sua:
        </p>

        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'stretch', marginTop: 8 }}>
          <section className="nota" style={cartao}>
            <span className="eyebrow">Para advogados(as)</span>
            <h3 style={{ margin: 0 }}>Do primeiro atendimento ao registro</h3>
            <p style={{ margin: 0 }}>
              Cofre de documentos com extração por IA, elegibilidade do rito (CPC,
              art. 610), partilha com meação por regime, legítima, colação e cenários;
              ITCMD com atualização pela UFESP, multas e Selic; custas extrajudiciais
              e judiciais, honorários por complexidade, petição inicial e minuta ao
              Tabelionato — e o portal do herdeiro para qualificação, documentos e
              deliberações da família.
            </p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 'auto', paddingTop: 6 }}>
              <Link className="acao" href="/login" style={botao}>
                Entrar
              </Link>
              <Link className="acao secundaria" href="/cadastro" style={botao}>
                Criar conta
              </Link>
            </div>
          </section>

          <section className="nota" style={cartao}>
            <span className="eyebrow">Para escreventes e tabeliães</span>
            <h3 style={{ margin: 0 }}>A escritura do jeito do balcão</h3>
            <p style={{ margin: 0 }}>
              Minuta de escritura calibrada por atos reais: qualificação completa das
              partes, tabelas de patrimônio e partilha, adjudicação, sobrepartilha e
              dois óbitos; base de emolumentos pelo Enunciado 7 do CNB/SP (maior entre
              atribuído, venal e avaliação), conferência das certidões do registro
              civil e antecipador de exigências registrais (LRP, arts. 213 e 246).
            </p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 'auto', paddingTop: 6 }}>
              <Link className="acao" href="/login" style={botao}>
                Entrar
              </Link>
              <Link className="acao secundaria" href="/cadastro" style={botao}>
                Criar conta
              </Link>
            </div>
          </section>

          <section className="nota registro" style={cartao}>
            <span className="eyebrow">Para famílias</span>
            <h3 style={{ margin: 0 }}>Perdeu alguém e não sabe por onde começar?</h3>
            <p style={{ margin: 0 }}>
              Responda até 12 perguntas e veja na hora, de graça e sem cadastro:
              cartório ou justiça, estimativa do imposto e dos custos, o prazo legal e
              a lista de documentos para separar.
            </p>
            <p className="fund" style={{ margin: 0 }}>
              Sem juridiquês e sem pedir dado sensível — os valores entram por faixa.
            </p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 'auto', paddingTop: 6 }}>
              <Link className="acao" href="/familias" style={botao}>
                Começar agora — é gratuito
              </Link>
              <Link className="acao secundaria" href="/familias/guias" style={botao}>
                Ler os guias
              </Link>
            </div>
          </section>
        </div>

        <p className="fund" style={{ marginTop: 18 }}>
          Recebeu do escritório um link do cofre da família? O próprio link é a sua
          entrada — se o perdeu, <Link href="/portal">peça um novo aqui</Link>.
        </p>
      </main>
    </div>
  );
}
