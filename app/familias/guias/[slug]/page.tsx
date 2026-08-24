// Guia individual — página estática (SSG) com metadados por guia.

import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { requirePlataforma } from '@/lib/app';
import { GUIAS, guiaPorSlug } from '@/lib/familias/guias';

import '../../../(private)/sucessorista/sucessorista.css';

export function generateStaticParams() {
  return GUIAS.map((g) => ({ slug: g.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const guia = guiaPorSlug(slug);
  if (!guia) return {};
  return {
    title: `${guia.titulo} — O Sucessorista`,
    description: guia.descricao,
    openGraph: { title: guia.titulo, description: guia.descricao, type: 'article' },
  };
}

export default async function GuiaPage({ params }: { params: Promise<{ slug: string }> }) {
  await requirePlataforma('SUCESSORISTA');
  const { slug } = await params;
  const guia = guiaPorSlug(slug);
  if (!guia) notFound();

  return (
    <div className="sucessorista">
      <main className="folha" style={{ margin: '0 auto', maxWidth: 720 }}>
        <span className="eyebrow">Guias para famílias</span>
        <h1>{guia.titulo}</h1>
        <p className="subtitulo">{guia.descricao}</p>
        {guia.rascunho && (
          <p className="fund">
            Este guia está em elaboração — o texto completo chega em breve.
          </p>
        )}
        {guia.secoes.map((s, i) => (
          <section key={i}>
            <h2>{s.titulo}</h2>
            {s.paragrafos.map((p, j) => (
              <p key={j} style={{ marginTop: 6 }}>
                {p}
              </p>
            ))}
          </section>
        ))}
        <div style={{ marginTop: 16 }}>
          <Link className="acao" href="/familias" style={{ textDecoration: 'none', display: 'inline-block' }}>
            Descobrir por onde começar o seu caso — grátis
          </Link>
        </div>
        <footer className="rodape-etico">
          Conteúdo informativo geral — não substitui a consulta com advogado(a). Esta
          plataforma não intermedeia honorários nem indica advogados.
        </footer>
      </main>
    </div>
  );
}
