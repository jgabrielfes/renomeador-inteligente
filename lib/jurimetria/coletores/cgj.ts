/**
 * Coletor A2 — CGJ-SP: decisões em recurso de dúvida e pareceres do
 * extrajudicial publicados em página PÚBLICA da Corregedoria.
 *
 * A fonte nasce INATIVA: a página de listagem muda de estrutura e as URLs
 * ficam em fontes.config (`listaUrl` + `padraoLinks`, um regex de href) —
 * nunca hardcoded (princípio do desenho). O admin cadastra e ativa;
 * captcha/403 derrubam a fonte para `bloqueada` automaticamente.
 */

import { buscarRespeitoso, htmlParaTexto } from './http';
import type { Coletor, ConteudoColetado } from './tipos';

export const coletorCgj: Coletor = {
  async listar(fonte) {
    const listaUrl = fonte.config.listaUrl as string | null | undefined;
    const padrao = fonte.config.padraoLinks as string | null | undefined;
    if (!listaUrl || !padrao)
      throw new Error(
        'Fonte CGJ sem configuração: cadastre listaUrl e padraoLinks em fontes.config (TODO_VALIDACAO nº 2).',
      );
    const r = await buscarRespeitoso(listaUrl);
    const html = await r.text();
    const re = new RegExp(padrao, 'gi');
    const vistos = new Set<string>();
    const refs: { url: string }[] = [];
    for (const m of html.matchAll(re)) {
      const bruta = m[1] ?? m[0];
      const url = new URL(bruta, listaUrl).toString();
      if (!vistos.has(url)) {
        vistos.add(url);
        refs.push({ url });
      }
    }
    return refs.slice(0, Number(fonte.config.maxPorColeta ?? 30));
  },

  async baixar(_fonte, ref): Promise<ConteudoColetado> {
    const r = await buscarRespeitoso(ref.url);
    const mime = r.headers.get('content-type') ?? 'text/html';
    if (mime.includes('pdf')) {
      const bytes = new Uint8Array(await r.arrayBuffer());
      return { urlOrigem: ref.url, mime: 'application/pdf', bytes };
    }
    return { urlOrigem: ref.url, mime: 'text/html', texto: htmlParaTexto(await r.text()) };
  },
};
