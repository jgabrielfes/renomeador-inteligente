/**
 * Coletor A4 — página de orientações/requisitos do PRÓPRIO cartório de RI.
 *
 * Uma fonte POR cartório (`fontes.config.cartorioId` + `paginaOrientacoes`),
 * inativa até o admin cadastrar a URL. Re-coleta mensal: se o hash do
 * conteúdo mudar, o worker cria documento NOVO e mantém o anterior — é
 * assim que a mudança de entendimento ao longo do tempo fica registrada.
 * A data do documento é a da COLETA (orientação vale enquanto publicada).
 */

import { buscarRespeitoso, htmlParaTexto } from './http';
import type { Coletor, ConteudoColetado } from './tipos';

export const coletorCartorioSite: Coletor = {
  async listar(fonte) {
    const url = fonte.config.paginaOrientacoes as string | null | undefined;
    if (!url)
      throw new Error(
        'Fonte de site de cartório sem paginaOrientacoes em fontes.config — cadastre a URL e ative.',
      );
    return [{ url, dataDocumento: new Date().toISOString().slice(0, 10) }];
  },

  async baixar(_fonte, ref): Promise<ConteudoColetado> {
    const r = await buscarRespeitoso(ref.url);
    const mime = r.headers.get('content-type') ?? 'text/html';
    if (mime.includes('pdf')) {
      const bytes = new Uint8Array(await r.arrayBuffer());
      return { urlOrigem: ref.url, mime: 'application/pdf', bytes, dataDocumento: ref.dataDocumento };
    }
    return {
      urlOrigem: ref.url,
      mime: 'text/html',
      texto: htmlParaTexto(await r.text()),
      dataDocumento: ref.dataDocumento,
    };
  },
};
