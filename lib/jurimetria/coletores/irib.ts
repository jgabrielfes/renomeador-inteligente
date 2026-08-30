/**
 * Coletor A3 — IRIB (Boletim Eletrônico / Kollemata).
 *
 * A base Kollemata é restrita a associados; enquanto `fontes.config.publico`
 * não for marcado como true (após a validação humana dos termos de uso —
 * TODO_VALIDACAO nº 2), este coletor se BLOQUEIA de propósito: registrar a
 * fonte como bloqueada e avisar é o comportamento correto — não coletar.
 */

import { FonteBloqueadaError } from './tipos';
import { buscarRespeitoso, htmlParaTexto } from './http';
import type { Coletor, ConteudoColetado } from './tipos';

export const coletorIrib: Coletor = {
  async listar(fonte) {
    if (fonte.config.publico !== true)
      throw new FonteBloqueadaError(
        'Conteúdo restrito a associados (termos de uso não validados) — coleta não realizada de propósito.',
      );
    const listaUrl = fonte.config.listaUrl as string | undefined;
    const padrao = fonte.config.padraoLinks as string | undefined;
    if (!listaUrl || !padrao) throw new Error('Fonte IRIB pública sem listaUrl/padraoLinks.');
    const r = await buscarRespeitoso(listaUrl);
    const html = await r.text();
    const re = new RegExp(padrao, 'gi');
    const refs = [...html.matchAll(re)].map((m) => ({
      url: new URL(m[1] ?? m[0], listaUrl).toString(),
    }));
    return refs.slice(0, 20);
  },

  async baixar(_fonte, ref): Promise<ConteudoColetado> {
    // Público confirmado: só metadados + ementa, nunca o inteiro teor da base.
    const r = await buscarRespeitoso(ref.url);
    return { urlOrigem: ref.url, mime: 'text/html', texto: htmlParaTexto(await r.text()).slice(0, 8000) };
  },
};
