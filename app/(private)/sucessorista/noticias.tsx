/**
 * Ticker de notícias — coluna "Migalhas Notariais e Registrais", via rota
 * interna /api/noticias (o cliente nunca fala com o site de fora). As
 * manchetes giram sozinhas; clique abre a matéria em nova aba. Sem
 * manchetes (falha da fonte), o ticker simplesmente não aparece.
 */

import { useEffect, useState } from 'react';

interface Noticia {
  titulo: string;
  url: string;
  intro?: string;
}

const FONTE = 'https://www.migalhas.com.br/coluna/migalhas-notariais-e-registrais';

export function NoticiasTicker() {
  const [noticias, setNoticias] = useState<Noticia[]>([]);
  const [indice, setIndice] = useState(0);

  useEffect(() => {
    let ativo = true;
    void fetch('/api/noticias')
      .then((r) => (r.ok ? r.json() : null))
      .then((corpo: { noticias?: Noticia[] } | null) => {
        if (ativo && corpo?.noticias?.length) setNoticias(corpo.noticias);
      })
      .catch(() => {
        // fonte fora do ar: o módulo segue sem o ticker
      });
    return () => {
      ativo = false;
    };
  }, []);

  useEffect(() => {
    if (noticias.length < 2) return;
    // 10s por notícia: agora há título + introdução para ler.
    const t = setInterval(() => setIndice((i) => (i + 1) % noticias.length), 10_000);
    return () => clearInterval(t);
  }, [noticias.length]);

  if (noticias.length === 0) return null;
  const atual = noticias[indice];

  return (
    <div className="noticias-ticker" role="complementary" aria-label="Notícias notariais e registrais">
      <div className="cabeca">
        <a className="rotulo" href={FONTE} target="_blank" rel="noopener noreferrer">
          Migalhas Notariais e Registrais
        </a>
        <span className="num contagem">
          {indice + 1}/{noticias.length}
        </span>
      </div>
      <a
        key={atual.url}
        className="manchete"
        href={atual.url}
        target="_blank"
        rel="noopener noreferrer"
        title={atual.titulo}
      >
        {atual.titulo}
      </a>
      {atual.intro && <p className="introducao">{atual.intro}</p>}
    </div>
  );
}
