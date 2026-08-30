/**
 * Relatório em PDF da NOTA DEVOLUTIVA analisada — montado no NAVEGADOR com
 * pdf-lib, na veste do módulo (papel/tinta/bronze). É o entregável do
 * usuário: a nota decomposta exigência a exigência, com a via de solução
 * sugerida pelo Resolvedor, os temas e o histórico do cartório — sempre com
 * o rodapé de que histórico não é previsão nem garantia.
 */

import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

import { ROTULO_VIA } from '@/lib/notas-rotulos';

import type { AnaliseNota } from './nota-analise';
import { TEMAS_LOCAIS } from './temas-local';

const C = {
  papel: rgb(0.965, 0.957, 0.933),
  tinta: rgb(0.102, 0.137, 0.125),
  tintaMedia: rgb(0.29, 0.329, 0.31),
  bronze: rgb(0.541, 0.427, 0.231),
  fio: rgb(0.867, 0.847, 0.792),
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
    .replace(/[^\x20-\x7E -ÿ–—]/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .trim();
}

export interface HistoricoParaPdf {
  cartorioNome: string | null;
  total: number;
  porTema: { rotulo: string; n: number }[];
}

export async function montarRelatorioNotaPdf(
  analise: AnaliseNota,
  historico: HistoricoParaPdf | null,
): Promise<Blob> {
  const doc = await PDFDocument.create();
  const fonte = await doc.embedFont(StandardFonts.Helvetica);
  const negrito = await doc.embedFont(StandardFonts.HelveticaBold);

  let pagina = doc.addPage([A4.w, A4.h]);
  let y = A4.h - MARGEM;
  const fundo = () =>
    pagina.drawRectangle({ x: 0, y: 0, width: A4.w, height: A4.h, color: C.papel });
  fundo();

  const quebrar = (texto: string, tamanho: number, f = fonte): string[] => {
    const palavras = limparTexto(texto).split(' ');
    const linhas: string[] = [];
    let atual = '';
    for (const p of palavras) {
      const tentativa = atual ? `${atual} ${p}` : p;
      if (f.widthOfTextAtSize(tentativa, tamanho) > LARGURA) {
        if (atual) linhas.push(atual);
        atual = p;
      } else atual = tentativa;
    }
    if (atual) linhas.push(atual);
    return linhas;
  };
  const linha = (texto: string, tamanho: number, f = fonte, cor = C.tinta) => {
    for (const l of quebrar(texto, tamanho, f)) {
      if (y < MARGEM + 40) {
        pagina = doc.addPage([A4.w, A4.h]);
        fundo();
        y = A4.h - MARGEM;
      }
      pagina.drawText(l, { x: MARGEM, y, size: tamanho, font: f, color: cor });
      y -= tamanho * 1.45;
    }
  };
  const respiro = (px: number) => {
    y -= px;
  };
  const filete = () => {
    pagina.drawLine({
      start: { x: MARGEM, y: y + 4 },
      end: { x: A4.w - MARGEM, y: y + 4 },
      thickness: 0.7,
      color: C.fio,
    });
    respiro(10);
  };

  linha('Jurimetria Registral - LexCausa', 10, negrito, C.bronze);
  linha('Análise de nota devolutiva', 18, negrito);
  linha(
    `Gerada em ${new Date().toLocaleDateString('pt-BR')} - análise feita no navegador do usuário`,
    9,
    fonte,
    C.tintaMedia,
  );
  respiro(8);
  filete();

  const rotuloTema = (id: string) => TEMAS_LOCAIS.find((t) => t.id === id)?.rotulo ?? id;

  linha(`${analise.itens.length} exigência(s) identificada(s) na nota`, 12, negrito);
  respiro(6);
  for (const [i, item] of analise.itens.entries()) {
    linha(`${i + 1}. ${item.rotulo || item.texto.slice(0, 90)}`, 11, negrito);
    linha(item.texto, 10);
    linha(`Via sugerida: ${ROTULO_VIA[item.via] ?? item.via}`, 10, fonte, C.bronze);
    if (item.nota) linha(`Orientação: ${item.nota}`, 10, fonte, C.tintaMedia);
    if (item.temas.length > 0)
      linha(`Temas: ${item.temas.map(rotuloTema).join(' · ')}`, 9, fonte, C.tintaMedia);
    respiro(8);
  }

  filete();
  if (historico) {
    linha(
      `Histórico público${historico.cartorioNome ? ` — ${historico.cartorioNome}` : ''}`,
      12,
      negrito,
    );
    if (historico.total === 0) {
      linha(
        'Ainda não há exigências publicadas para este recorte na base — ela cresce com a coleta diária e as contribuições.',
        10,
      );
    } else {
      linha(`${historico.total} exigência(s) publicada(s) nos temas desta nota.`, 10);
      for (const t of historico.porTema.slice(0, 8))
        linha(`- ${t.rotulo}: ${t.n} ocorrência(s)`, 10, fonte, C.tintaMedia);
    }
    respiro(8);
  }

  filete();
  linha(
    'Este relatório organiza a nota devolutiva e confronta com HISTÓRICO de entendimentos públicos - nunca previsão, recomendação ou garantia de como o cartório decidirá. A via sugerida é rascunho de apoio para conferência profissional.',
    8.5,
    fonte,
    C.tintaMedia,
  );

  const bytes = await doc.save();
  return new Blob([bytes as unknown as BlobPart], { type: 'application/pdf' });
}
