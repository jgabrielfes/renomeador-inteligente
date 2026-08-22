// Índice dos guias "Para famílias" — páginas de conteúdo renderizadas no
// servidor (SEO). Os textos finais são do escritório; a estrutura vive em
// lib/familias/guias.ts.

import type { Metadata } from 'next';
import Link from 'next/link';

import { requirePlataforma } from '@/lib/app';
import { GUIAS } from '@/lib/familias/guias';

import '../../(private)/sucessorista/sucessorista.css';

export const metadata: Metadata = {
  title: 'Guias de inventário para famílias — O Sucessorista',
  description:
    'Guias em linguagem simples sobre inventário: cartório ou justiça, ITCMD, prazos e multas, alvará judicial e mais.',
};

export default async function GuiasPage() {
  await requirePlataforma('SUCESSORISTA');
  return (
    <div className="sucessorista">
      <main className="folha" style={{ margin: '0 auto', maxWidth: 720 }}>
        <span className="eyebrow">Para famílias</span>
        <h1>Guias de inventário</h1>
        <p className="subtitulo">
          Explicações em linguagem simples, sem juridiquês — para a família entender o
          processo antes (e durante) a conversa com o advogado.
        </p>
        <ul className="custos-portal">
          {GUIAS.map((g) => (
            <li key={g.slug}>
              <span>
                <Link href={`/familias/guias/${g.slug}`}>{g.titulo}</Link>
                <span className="fase-descricao">{g.descricao}</span>
              </span>
            </li>
          ))}
        </ul>
        <div style={{ marginTop: 14 }}>
          <Link className="acao" href="/familias" style={{ textDecoration: 'none', display: 'inline-block' }}>
            Descobrir por onde começar — grátis
          </Link>
        </div>
      </main>
    </div>
  );
}
