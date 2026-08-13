// GET /api/noticias — manchetes da coluna "Migalhas Notariais e Registrais"
// (migalhas.com.br), buscadas NO SERVIDOR e repassadas ao módulo como um
// ticker. Nenhum dado do usuário viaja: é um GET público feito pelo servidor,
// dentro do desenho de fronteira de dados do projeto (o cliente só fala com
// rotas internas). Cache em memória de 15 minutos — "tempo real" de coluna
// editorial, sem martelar o site de origem.

import { auth } from "@/lib/auth";

const FONTE = "https://www.migalhas.com.br/coluna/migalhas-notariais-e-registrais";
const CACHE_MS = 15 * 60 * 1000;

export interface Noticia {
  titulo: string;
  url: string;
}

let cache: { noticias: Noticia[]; em: number } | null = null;

function extrairNoticias(html: string): Noticia[] {
  const vistas = new Set<string>();
  const noticias: Noticia[] = [];
  // Âncoras de matéria da coluna: /coluna/migalhas-notariais-e-registrais/<id>/<slug>
  const re =
    /<a[^>]+href="(?:https?:\/\/www\.migalhas\.com\.br)?(\/coluna\/migalhas-notariais-e-registrais\/\d+[^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
  for (const m of html.matchAll(re)) {
    const url = `https://www.migalhas.com.br${m[1]}`;
    const titulo = m[2]
      .replace(/<[^>]+>/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&quot;/g, '"')
      .replace(/&#0?39;/g, "'")
      .replace(/\s+/g, " ")
      .trim();
    if (!titulo || titulo.length < 20 || vistas.has(url)) continue;
    vistas.add(url);
    noticias.push({ titulo: titulo.slice(0, 180), url });
    if (noticias.length >= 12) break;
  }
  return noticias;
}

export async function GET() {
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
