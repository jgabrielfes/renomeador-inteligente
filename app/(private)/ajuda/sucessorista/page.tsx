// "Como funciona" de O SUCESSORISTA — a ajuda de dentro do produto (logado):
// as 5 fases, os perfis e o que cada um pode. Acessível pela paleta (⌘K).

import type { Metadata } from 'next';
import Link from 'next/link';

import '@/app/lexcausa.css';

import { LexTopbar } from '@/components/lexcausa/topbar';
import { AvatarSessao } from '@/components/lexcausa/avatar-sessao';
import { requirePlataforma } from '@/lib/app';
import { auth, isMaster, requireSession } from '@/lib/auth';
import { radarAtivo } from '@/lib/radar/config';

export const metadata: Metadata = {
  title: 'Como funciona — LexCausa',
  robots: { index: false },
};

const FASES = [
  ['1 · Composição', 'A família: quem faleceu, o vínculo, o regime de bens e os herdeiros com a qualificação. O cofre lê os documentos e preenche o que tiver base; o portal do herdeiro traz a qualificação de quem responde.'],
  ['2 · Acervo', 'Os bens com os valores que a lei pede (venal do óbito, venal corrente no imóvel e avaliação) e o passivo. O ITCMD sai pelo maior entre venal do óbito e avaliação; as custas, pelo maior dos três.'],
  ['3 · Quinhões', 'Meação por regime, legítima, colação e a partilha — igual ou diferenciada pela matriz (aceita % e fração). Cada número sai com o fundamento legal.'],
  ['4 · Cofre', 'O catálogo de documentos do inventário: anexos com miniatura, convites aos herdeiros, conferência com validade de certidão e a montagem do processo (PDF único ou ZIP).'],
  ['5 · Espelho ITCMD', 'A declaração paulista espelhada e a provisão do imposto: atualização pela UFESP até o vencimento, multas dos arts. 19/21 e juros Selic — calibrada por demonstrativo oficial.'],
] as const;

export default async function AjudaSucessoristaPage() {
  await requirePlataforma('SUCESSORISTA');
  await requireSession('/ajuda/sucessorista');
  const session = await auth();
  return (
    <>
      <LexTopbar menu={<AvatarSessao />} ehMaster={isMaster(session)} radarAtivo={radarAtivo()} sub="LexCausa" />
      <div className="lexcausa" style={{ minHeight: '100vh' }}>
        <main className="lc-miolo produto-sucessorista">
          <section className="lc-hero" style={{ paddingTop: 'var(--e-6)' }}>
            <span className="lc-eyebrow">Como funciona</span>
            <h1>LexCausa em cinco fases</h1>
            <p className="lc-sub">
              A folha do inventário é contínua — a navegação é livre e nada bloqueia
              nada. A barra das 5 fases no dashboard mostra o progresso e leva à aba
              certa com um clique.
            </p>
          </section>

          <div className="lc-cartoes">
            {FASES.map(([nome, texto]) => (
              <section key={nome} className="lc-cartao">
                <h3>{nome}</h3>
                <p style={{ margin: 0 }}>{texto}</p>
              </section>
            ))}
          </div>

          <section className="lc-secao lc-prosa">
            <span className="lc-eyebrow">Perfis e permissões</span>
            <h2>Quem vê o quê</h2>
            <ul className="lc-lista">
              <li><strong>Advogado(a)</strong>: tudo — inclusive Honorários e Minutas (petição inicial e minuta ao Tabelionato), Radar Sucessório e Diligências.</li>
              <li><strong>Não advogado(a)</strong>: a folha inteira, TODAS as minutas (escritura, Tabelionato, petição) e as Diligências; honorários e o Radar não aparecem.</li>
              <li><strong>Equipe</strong>: contas individuais por convite do(a) chefe — membro trabalha em tudo, só não gere a equipe; a nuvem da equipe sincroniza os casos (só o caso.json — documento nunca sobe).</li>
              <li><strong>Herdeiro (portal)</strong>: entra pelo LINK do convite, sem conta — envia qualificação e documentos e participa do espaço do espólio; nunca vê honorários nem os dados dos outros herdeiros além do que o espólio compartilha.</li>
            </ul>
            <p className="lc-fund">
              Onde ficam os casos: na SUA pasta ou na SUA nuvem (Google Drive,
              OneDrive, Dropbox) — o processamento de documentos acontece no navegador.
            </p>
            <p>
              <Link href="/s">← Voltar a Meus casos</Link>
            </p>
          </section>
        </main>
      </div>
    </>
  );
}
