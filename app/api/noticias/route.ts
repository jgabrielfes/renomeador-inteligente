// GET /api/noticias — manchetes da coluna "Migalhas Notariais e Registrais"
// (migalhas.com.br), buscadas NO SERVIDOR e repassadas ao módulo como um
// ticker. Nenhum dado do usuário viaja: é um GET público feito pelo servidor,
// dentro do desenho de fronteira de dados do projeto (o cliente só fala com
// rotas internas). Cache em memória de 15 minutos — "tempo real" de coluna
// editorial, sem martelar o site de origem.

import { auth } from "@/lib/auth";
import { foraDaPlataforma } from '@/lib/app';

const FONTE = "https://www.migalhas.com.br/coluna/migalhas-notariais-e-registrais";
const CACHE_MS = 15 * 60 * 1000;

export interface Noticia {
  titulo: string;
  url: string;
  /** Introdução/resumo da matéria, quando a listagem traz um. */
  intro?: string;
}

let cache: { noticias: Noticia[]; em: number } | null = null;

function limparTexto(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extrairNoticias(html: string): Noticia[] {
  const vistas = new Set<string>();
  // Âncoras de matéria da coluna: /coluna/migalhas-notariais-e-registrais/<id>/<slug>
  const re =
    /<a[^>]+href="(?:https?:\/\/www\.migalhas\.com\.br)?(\/coluna\/migalhas-notariais-e-registrais\/\d+[^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
  const brutos: { url: string; titulo: string; inicio: number; fim: number }[] = [];
  for (const m of html.matchAll(re)) {
    const url = `https://www.migalhas.com.br${m[1]}`;
    const titulo = limparTexto(m[2]);
    if (!titulo || titulo.length < 20 || vistas.has(url)) continue;
    vistas.add(url);
    const inicio = m.index ?? 0;
    brutos.push({ url, titulo, inicio, fim: inicio + m[0].length });
    if (brutos.length >= 12) break;
  }
  return brutos.map((b, i) => {
    // A introdução da matéria costuma vir logo após a âncora do título,
    // antes da âncora seguinte — melhor esforço em três degraus, tolerante a
    // mudança de layout da fonte: <p> → <div>/<span> → texto solto do trecho.
    const limite = i + 1 < brutos.length ? brutos[i + 1].inicio : b.fim + 2500;
    const trecho = html.slice(b.fim, Math.min(limite, b.fim + 2500));
    const encurtar = (texto: string) =>
      texto.length > 260 ? `${texto.slice(0, 257).trimEnd()}…` : texto;
    const serve = (texto: string) =>
      texto.length >= 40 && texto !== b.titulo && !texto.startsWith(b.titulo);
    let intro: string | undefined;
    for (const re of [/<p[^>]*>([\s\S]*?)<\/p>/gi, /<(?:div|span)[^>]*>([\s\S]*?)<\/(?:div|span)>/gi]) {
      for (const pm of trecho.matchAll(re)) {
        const texto = limparTexto(pm[1]);
        if (serve(texto)) {
          intro = encurtar(texto);
          break;
        }
      }
      if (intro) break;
    }
    if (!intro) {
      // Último degrau: o texto corrido do trecho (sem tags), tirando datas e
      // rótulos curtos que sobram do card da listagem.
      const solto = limparTexto(trecho).replace(/^\d{1,2}\/\d{1,2}\/\d{2,4}\s*/, '');
      if (serve(solto)) intro = encurtar(solto);
    }
    return { titulo: b.titulo.slice(0, 180), url: b.url, intro };
  });
}

export async function GET() {
  // Rota do Sucessorista: no deploy do Renomeador ela não existe.
  const fora = foraDaPlataforma('SUCESSORISTA');
  if (fora) return fora;

  const session = await auth();
  if (!session) {
    return Response.json({ error: "Não autenticado." }, { status: 401 });
  }

  if (cache && Date.now() - cache.em < CACHE_MS) {
    return Response.json({ noticias: cache.noticias, fonte: FONTE });
  }

  try {
    const res = await fetch(FONTE, {
      headers: { "user-agent": "Mozilla/5.0 (compatible; leitor de manchetes)" },
      next: { revalidate: 900 },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const noticias = extrairNoticias(await res.text());
    if (noticias.length === 0) throw new Error("Nenhuma manchete reconhecida na página.");
    cache = { noticias, em: Date.now() };
    return Response.json({ noticias, fonte: FONTE });
  } catch (err) {
    // Cache vencido ainda é melhor que nada quando a fonte falha.
    if (cache) return Response.json({ noticias: cache.noticias, fonte: FONTE });
    const mensagem = err instanceof Error ? err.message : String(err);
    return Response.json({ error: mensagem }, { status: 502 });
  }
}
