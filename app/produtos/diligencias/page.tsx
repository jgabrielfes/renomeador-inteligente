// Página institucional das DILIGÊNCIAS ENTRE ADVOGADOS — pública, no site
// da LexCausa. Trilhos éticos sempre por escrito: a plataforma não processa
// pagamento nem comissiona — o acerto é entre os advogados (art. 34 da Lei
// 8.906/94; CED arts. 26–27).

import type { Metadata } from 'next';
import Link from 'next/link';

import '@/app/lexcausa.css';

import { MarcaLexCausa } from '@/components/lexcausa/marca';
import { requirePlataforma } from '@/lib/app';

export const metadata: Metadata = {
  title: 'Diligências entre advogados — LexCausa',
  description:
    'Correspondentes por comarca para a prática sucessória: publique o ato, receba ofertas em ordem neutra, registre o termo de referência e receba o relatório direto no caso.',
};

const PASSOS = [
  ['Publicar', 'Escolha a comarca e o tipo — retirada de certidão, audiência, protocolo, ITCMD e outros — e descreva o que precisa ser feito. Só os anexos que você SELECIONAR formam a pasta da diligência.'],
  ['Ofertar', 'Correspondentes verificados da comarca (e mesma UF) veem a publicação em ordem neutra — sem ranking e sem preço — e ofertam com prazo e a forma de atender.'],
  ['Combinar', 'Você escolhe a oferta e registra o termo de referência: escopo, prazo e valor em texto livre, combinados ENTRE os advogados. A plataforma não intermedeia pagamento.'],
  ['Entregar', 'O correspondente executa e entrega o relatório, que volta ao seu caso com nome padronizado, caindo no tópico certo do cofre. Ao concluir, os dois avaliam por critérios objetivos.'],
] as const;

export default async function ProdutoDiligenciasPage() {
  // Página institucional: vive no apex da marca (lexcausa.com.br).
  await requirePlataforma('HUB');
  return (
    <div className="lexcausa">
      <header className="lc-topo">
        <MarcaLexCausa href="/" sub="Diligências · by LexCausa" />
        <nav aria-label="Entrar na plataforma">
          <Link className="lc-acao secundaria" href="/cadastro">Criar conta</Link>
          <Link className="lc-acao" href="/login">Entrar</Link>
        </nav>
      </header>

      <main className="lc-miolo produto-diligencias">
        <section className="lc-hero">
          <span className="lc-eyebrow">Diligências entre advogados</span>
          <h1>O ato em outra comarca, sem sair do caso</h1>
          <p className="lc-sub">
            Retirar certidão, acompanhar audiência, protocolar, resolver o ITCMD
            fora da sua praça — publique aos correspondentes verificados e
            receba o relatório direto no inventário.
          </p>
        </section>

        <section className="lc-secao">
          <span className="lc-eyebrow">Como funciona</span>
          <h2>Quatro passos, tudo registrado</h2>
          <div className="lc-cartoes">
            {PASSOS.map(([nome, texto], i) => (
              <section key={nome} className="lc-cartao">
                <span className="lc-eyebrow">Passo {i + 1}</span>
                <h3>{nome}</h3>
                <p style={{ margin: 0 }}>{texto}</p>
              </section>
            ))}
          </div>
        </section>

        <section className="lc-secao lc-prosa">
          <span className="lc-eyebrow">Confiança</span>
          <h2>Verificação e ética por construção</h2>
          <p>
            Atuar como correspondente exige o mesmo selo do Radar Sucessório:
            OAB verificada manualmente e questionário deontológico. As ofertas
            aparecem por ordem de chegada e proximidade da comarca — nunca por
            preço, nunca por nota. O acerto de honorários é entre os advogados
            (art. 34 da Lei 8.906/94; Código de Ética, arts. 26–27); a
            plataforma só registra o termo de referência e a pasta isolada leva
            apenas os arquivos que o solicitante escolher.
          </p>
        </section>

        <section className="lc-secao lc-prosa">
          <span className="lc-eyebrow">Acesso</span>
          <h2>Como entrar</h2>
          <p>
            Crie a conta gratuita, abra as Diligências pelo hub e publique a
            primeira solicitação — ou preencha o seu perfil de correspondente
            (comarcas atendidas, tipos de ato, prazo médio) para receber as da
            sua região.
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
            <summary>A plataforma cobra comissão por diligência?</summary>
            <p style={{ margin: 0 }}>
              Não. Não há processamento de pagamento nem comissão por ato — o
              valor é combinado diretamente entre os advogados e registrado no
              termo de referência como texto livre.
            </p>
          </details>
          <details className="lc-faq">
            <summary>O correspondente vê o meu caso inteiro?</summary>
            <p style={{ margin: 0 }}>
              Não. A pasta da diligência é isolada: só os arquivos que você
              selecionar circulam — o restante do caso nunca sai do seu
              ambiente.
            </p>
          </details>
          <details className="lc-faq">
            <summary>Como as avaliações funcionam?</summary>
            <p style={{ margin: 0 }}>
              Ao concluir, solicitante e correspondente avaliam-se mutuamente
              por critérios objetivos (prazo, relatório, comunicação, 1–5). A
              nota agregada aparece só a assinantes logados — nunca é pública
              nem vira ranking.
            </p>
          </details>
        </section>
      </main>

      <footer className="lc-noite lc-rodape">
        <div className="lc-miolo">
          <span>Diligências entre advogados · by LexCausa</span>
          <Link href="/">← Voltar à página inicial</Link>
        </div>
      </footer>
    </div>
  );
}
