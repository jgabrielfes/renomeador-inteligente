/**
 * Relatório em PDF do Antecipador de Qualificação Registral — montado no
 * NAVEGADOR com pdf-lib, vestindo as cores do módulo (mesma identidade do
 * relatório do Analisador de Matrícula): exigências em lacre, conferências
 * em bronze, fundamento legal em itálico de apoio.
 */

import type { RelatorioAntecipador } from './antecipador';

/* Paleta do módulo (sucessorista.css) em RGB 0–1 para o pdf-lib. */
const C = {
  papel: [0.965, 0.957, 0.933] as const,
  papelAlto: [0.992, 0.988, 0.976] as const,
  tinta: [0.102, 0.137, 0.125] as const,
  tintaMedia: [0.29, 0.329, 0.31] as const,
  lacre: [0.62, 0.169, 0.145] as const,
  bronze: [0.541, 0.427, 0.231] as const,
  verde: [0.18, 0.369, 0.306] as const,
  fioForte: [0.725, 0.698, 0.612] as const,
};

const A4 = { w: 595.28, h: 841.89 };
const MARGEM = 48;
const LARGURA = A4.w - MARGEM * 2;

function limparTexto(s: string): string {
  return s
    .replace(/[‘’‚]/g, "'")
    .replace(/[“”„]/g, '"')
    .replace(/•/g, '-')
    .replace(/…/g, '...')
    .replace(/[→➔]/g, '->')
    .replace(/[^\x20-\x7E -ÿ–—]/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .trim();
}

export async function montarAntecipadorPdf(
  relatorio: RelatorioAntecipador,
  nomeCaso: string,
): Promise<Blob> {
  const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib');
  const doc = await PDFDocument.create();
  const serif = await doc.embedFont(StandardFonts.TimesRomanBold);
  const corpo = await doc.embedFont(StandardFonts.Helvetica);
  const corpoNegrito = await doc.embedFont(StandardFonts.HelveticaBold);
  const italico = await doc.embedFont(StandardFonts.HelveticaOblique);

  type Fonte = typeof corpo;
  const cor = (c: readonly [number, number, number]) => rgb(c[0], c[1], c[2]);

  let page = doc.addPage([A4.w, A4.h]);
  let y = A4.h - MARGEM;

  const pintarFundo = (p: typeof page) => {
    p.drawRectangle({ x: 0, y: 0, width: A4.w, height: A4.h, color: cor(C.papel) });
  };
  pintarFundo(page);

  const novaPagina = () => {
    page = doc.addPage([A4.w, A4.h]);
    pintarFundo(page);
    y = A4.h - MARGEM;
  };

  const garantir = (altura: number) => {
    if (y - altura < MARGEM) novaPagina();
  };

  const quebrar = (texto: string, fonte: Fonte, tamanho: number, largura: number): string[] => {
    const palavras = limparTexto(texto).split(' ');
    const linhas: string[] = [];
    let atual = '';
    for (const palavra of palavras) {
      const tentativa = atual ? `${atual} ${palavra}` : palavra;
      if (fonte.widthOfTextAtSize(tentativa, tamanho) <= largura) {
        atual = tentativa;
      } else {
        if (atual) linhas.push(atual);
        atual = palavra;
      }
    }
    if (atual) linhas.push(atual);
    return linhas.length > 0 ? linhas : [''];
  };

  const paragrafo = (
    texto: string,
    opts: {
      fonte?: Fonte;
      tamanho?: number;
      corTexto?: readonly [number, number, number];
      recuo?: number;
      espacoDepois?: number;
    } = {},
  ) => {
    const fonte = opts.fonte ?? corpo;
    const tamanho = opts.tamanho ?? 9.5;
    const largura = LARGURA - (opts.recuo ?? 0);
    const linhas = quebrar(texto, fonte, tamanho, largura);
    const alturaLinha = tamanho * 1.35;
    for (const linha of linhas) {
      garantir(alturaLinha);
      page.drawText(linha, {
        x: MARGEM + (opts.recuo ?? 0),
        y: y - tamanho,
        size: tamanho,
        font: fonte,
        color: cor(opts.corTexto ?? C.tinta),
      });
      y -= alturaLinha;
    }
    y -= opts.espacoDepois ?? 4;
  };

  const tituloSecao = (texto: string) => {
    garantir(34);
    y -= 10;
    page.drawText(limparTexto(texto).toUpperCase(), {
      x: MARGEM,
      y: y - 11,
      size: 11,
      font: serif,
      color: cor(C.bronze),
    });
    y -= 16;
    page.drawLine({
      start: { x: MARGEM, y },
      end: { x: A4.w - MARGEM, y },
      thickness: 0.8,
      color: cor(C.fioForte),
    });
    y -= 8;
  };

  const apontamento = (a: { nivel: 'EXIGENCIA' | 'CONFERIR'; texto: string; fundamento: string }) => {
    const etiqueta = a.nivel === 'EXIGENCIA' ? '[EXIGÊNCIA]' : '[CONFERIR]';
    const corEtiqueta = a.nivel === 'EXIGENCIA' ? C.lacre : C.bronze;
    garantir(24);
    page.drawText(limparTexto(etiqueta), {
      x: MARGEM,
      y: y - 9,
      size: 9,
      font: corpoNegrito,
      color: cor(corEtiqueta),
    });
    y -= 13;
    paragrafo(a.texto, { recuo: 12, espacoDepois: 1 });
    paragrafo(a.fundamento, {
      fonte: italico,
      tamanho: 8,
      corTexto: C.tintaMedia,
      recuo: 12,
      espacoDepois: 8,
    });
  };

  /* ---------- cabeçalho ---------- */
  page.drawRectangle({ x: 0, y: A4.h - 92, width: A4.w, height: 92, color: cor(C.tinta) });
  page.drawText('O SUCESSORISTA', {
    x: MARGEM,
    y: A4.h - 34,
    size: 9,
    font: corpoNegrito,
    color: cor(C.bronze),
  });
  page.drawText('Antecipador de Qualificação Registral', {
    x: MARGEM,
    y: A4.h - 58,
    size: 20,
    font: serif,
    color: cor(C.papelAlto),
  });
  if (nomeCaso) {
    page.drawText(limparTexto(`Inventário de ${nomeCaso}`), {
      x: MARGEM,
      y: A4.h - 76,
      size: 10,
      font: corpo,
      color: cor(C.papelAlto),
    });
  }
  y = A4.h - 92 - 18;

  paragrafo(
    `Confronto do ato com as certidões de matrícula: o que o Registro de Imóveis pode exigir junto ao ${relatorio.tituloRegistro}. ${relatorio.totalExigencias} exigência(s) prevista(s). Relatório de APOIO — a qualificação registral é do Oficial; conferir cada item na certidão.`,
    { corTexto: C.tintaMedia, espacoDepois: 8 },
  );

  for (const im of relatorio.imoveis) {
    tituloSecao(im.matricula ? `${im.descricao} — matrícula ${im.matricula}` : im.descricao);
    if (im.apontamentos.length === 0) {
      paragrafo('Nenhum apontamento — a folha confere com a titularidade informada.', {
        corTexto: C.verde,
        espacoDepois: 8,
      });
    }
    for (const a of im.apontamentos) apontamento(a);
  }

  tituloSecao('Itens de praxe do caso');
  for (const a of relatorio.gerais) apontamento(a);

  const bytes = await doc.save();
  const copia = new Uint8Array(bytes);
  return new Blob([copia.buffer], { type: 'application/pdf' });
}
