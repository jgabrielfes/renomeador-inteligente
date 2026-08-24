// "Como funciona" do RADAR SUCESSÓRIO — a ajuda de dentro do produto
// (logado): o ciclo, os limites éticos e o teto de candidaturas.

import type { Metadata } from 'next';
import Link from 'next/link';

import '@/app/lexcausa.css';

import { LexTopbar } from '@/components/lexcausa/topbar';
import { AvatarSessao } from '@/components/lexcausa/avatar-sessao';
import { TEXTO_LEGAL_RADAR } from '@/components/lexcausa/produtos';
import { requirePlataforma } from '@/lib/app';
import { auth, isMaster, requireSession } from '@/lib/auth';
import { radarAtivo } from '@/lib/radar/config';
import { TETO_CANDIDATURAS_POR_CASO } from '@/lib/radar/candidatura';

export const metadata: Metadata = {
  title: 'Como funciona — Radar Sucessório',
  robots: { index: false },
};

const PASSOS = [
  ['1 · Habilitação', 'OAB com verificação manual, questionário deontológico (10 de 10) e assinatura mensal por UF — nunca comissão por caso. A candidatura vale pelo seu plano de assinatura (em implantação).'],
  ['2 · Casos abertos', 'A família publica o caso ANÔNIMO; você vê os das suas UFs em ordem única por data, com filtros de recorte (via, recência). Casos novos desde a sua última visita chegam com o chip NOVO — e o aviso aparece também no hub.'],
  ['3 · Candidatura', `Até ${TETO_CANDIDATURAS_POR_CASO} advogados(as) por caso (o marcador X/${TETO_CANDIDATURAS_POR_CASO}). A candidatura é a apresentação sóbria + como conduziria — sem valores e sem promessa; a sua vitrine (áreas e experiência) acompanha.`],
  ['4 · Conversa e contratação', 'A família escolhe com quem falar (um por vez) e só então o contato dela chega a você. Fechou? Ela confirma a contratação e o código aparece na conversa.'],
  ['5 · Converter em inventário', 'No funil "Minhas respostas", o caso contratado ganha o botão que cria o inventário no Sucessorista com a folha pré-preenchida — e os dados da família saem do servidor.'],
] as const;

export default async function AjudaRadarPage() {
  await requirePlataforma('SUCESSORISTA');
  await requireSession('/ajuda/radar');
  const session = await auth();
  return (
    <>
      <LexTopbar menu={<AvatarSessao />} ehMaster={isMaster(session)} radarAtivo={radarAtivo()} sub="Radar Sucessório · by LexCausa" />
      <div className="lexcausa" style={{ minHeight: '100vh' }}>
        <main className="lc-miolo produto-radar">
          <section className="lc-hero" style={{ paddingTop: 'var(--e-6)' }}>
            <span className="lc-eyebrow">Como funciona</span>
            <h1>O Radar Sucessório em cinco passos</h1>
            <p className="lc-sub">
              Prospecção com ética por construção: a família solicita, você se
              candidata, e a escolha é sempre dela. {TEXTO_LEGAL_RADAR}
            </p>
          </section>

          <div className="lc-cartoes">
            {PASSOS.map(([nome, texto]) => (
              <section key={nome} className="lc-cartao">
                <h3>{nome}</h3>
                <p style={{ margin: 0 }}>{texto}</p>
              </section>
            ))}
          </div>

          <section className="lc-secao lc-prosa">
            <span className="lc-eyebrow">Limites por desenho</span>
            <h2>O que o Radar nunca faz</h2>
            <ul className="lc-lista">
              <li>Ranquear, destacar ou indicar profissionais — a ordem é por data e as respostas chegam à família em ordem aleatória fixa.</li>
              <li>Exibir ou intermediar honorários — tratados fora da plataforma, direto com o cliente.</li>
              <li>Mostrar o contato da família antes de ela escolher conversar.</li>
              <li>Avaliações públicas de advogados — não existem.</li>
            </ul>
            <p>
              <Link href="/radar">← Voltar ao Radar</Link>
            </p>
          </section>
        </main>
      </div>
    </>
  );
}
