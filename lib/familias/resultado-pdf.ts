/**
 * PDF do resultado "Para famílias" — montado no NAVEGADOR (pdf-lib), nas
 * cores da marca. É o papel que a família leva à primeira conversa com o
 * advogado: via indicada com os porquês, estimativas por faixa, prazo e a
 * lista de documentos. Mesmo padrão visual dos demais PDFs do módulo.
 */

import type { RespostasFamilia } from './tipos';
import type { Triagem } from './triagem';
import { compararCenarios, type EstimativaCompleta } from './estimativas';
import type { ItemChecklist } from './documentos';
import { calcularComplexidade, ROTULO_COMPLEXIDADE } from './complexidade';
import { estimarQuinhoes } from './quinhoes';
import { PERGUNTAS_AO_ADVOGADO } from './perguntas';

const C = {
  papel: [0.965, 0.957, 0.933] as const,
  tinta: [0.102, 0.137, 0.125] as const,
  tintaMedia: [0.29, 0.329, 0.31] as const,
  bronze: [0.541, 0.427, 0.231] as const,
  fio: [0.867, 0.847, 0.792] as const,
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

const ROTULO_VIA = {
  EXTRAJUDICIAL: 'INVENTÁRIO EM CARTÓRIO (EXTRAJUDICIAL)',
  JUDICIAL: 'INVENTÁRIO JUDICIAL',
  ALVARA: 'ALVARÁ JUDICIAL (CAMINHO SIMPLIFICADO)',
} as const;

const brl = (v: number) =>
  `R$ ${Math.round(v).toLocaleString('pt-BR', { maximumFractionDigits: 0 })}`;

export async function montarResultadoPdf({
  r,
  triagem,
  estimativa,
  docs,
  agora,
}: {
  r: RespostasFamilia;
  triagem: Triagem;
  estimativa: EstimativaCompleta;
  docs: ItemChecklist[];
  /** ISO de geração — vem de fora (o motor não olha o relógio). */
  agora: string;
}): Promise<Blob> {
  const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib');
  const doc = await PDFDocument.create();
  const serif = await doc.embedFont(StandardFonts.TimesRomanBold);
  const corpo = await doc.embedFont(StandardFonts.Helvetica);
  const corpoNegrito = await doc.embedFont(StandardFonts.HelveticaBold);
  type Fonte = typeof corpo;
  const cor = (c: readonly [number, number, number]) => rgb(c[0], c[1], c[2]);

  let page = doc.addPage([A4.w, A4.h]);
  let y = A4.h - MARGEM;
  const pintarFundo = (p: typeof page) =>
    p.drawRectangle({ x: 0, y: 0, width: A4.w, height: A4.h, color: cor(C.papel) });
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
      if (fonte.widthOfTextAtSize(tentativa, tamanho) <= largura) atual = tentativa;
      else {
        if (atual) linhas.push(atual);
        atual = palavra;
      }
    }
    if (atual) linhas.push(atual);
    return linhas;
  };
  const escrever = (
    texto: string,
    fonte: Fonte,
    tamanho: number,
    corTexto: readonly [number, number, number],
    entrelinha = 1.35,
  ) => {
    for (const linha of quebrar(texto, fonte, tamanho, LARGURA)) {
      garantir(tamanho * entrelinha);
      page.drawText(linha, {
        x: MARGEM,
        y: y - tamanho,
        size: tamanho,
        font: fonte,
        color: cor(corTexto),
      });
      y -= tamanho * entrelinha;
    }
  };
  const titulo = (t: string) => {
    y -= 8;
    garantir(24);
    escrever(t, corpoNegrito, 11, C.bronze);
    y -= 2;
  };

  /* Cabeçalho. */
  escrever('POR ONDE COMEÇAR O INVENTÁRIO', serif, 16, C.tinta);
  y -= 2;
  escrever(ROTULO_VIA[triagem.via], corpoNegrito, 12, C.tintaMedia);
  escrever(
    `Orientação gratuita gerada em ${new Date(agora).toLocaleDateString('pt-BR')} pelo O Sucessorista — estimativas por faixa, para a primeira conversa com o(a) advogado(a).`,
    corpo,
    9,
    C.tintaMedia,
  );
  y -= 6;
  page.drawLine({
    start: { x: MARGEM, y },
    end: { x: MARGEM + LARGURA, y },
    thickness: 1.4,
    color: cor(C.tinta),
  });
  y -= 12;

  titulo('POR QUE ESSE CAMINHO');
  for (const m of triagem.motivos) escrever(m, corpo, 10, C.tinta);
  for (const o of triagem.observacoes) escrever(o, corpo, 9, C.tintaMedia);

  // Seções derivadas das MESMAS respostas (motores puros).
  const complexidade = calcularComplexidade(r);
  const quinhoes = estimarQuinhoes(r);
  const comparador = compararCenarios(r, agora.slice(0, 10));

  titulo('COMPLEXIDADE DO CASO');
  escrever(ROTULO_COMPLEXIDADE[complexidade.nivel], corpoNegrito, 10.5, C.tinta);
  for (const f of complexidade.fatores) escrever(`- ${f}`, corpo, 9, C.tintaMedia);

  titulo('ESTIMATIVA DO IMPOSTO (ITCMD)');
  for (const e of estimativa.itcmd) {
    escrever(`${e.uf}: ${brl(e.faixa.min)} a ${brl(e.faixa.max)}`, corpoNegrito, 10.5, C.tinta);
  }
  if (estimativa.itcmd.length > 1) {
    escrever(
      `Total estimado: ${brl(estimativa.itcmdTotal.min)} a ${brl(estimativa.itcmdTotal.max)}`,
      corpoNegrito,
      10.5,
      C.tinta,
    );
  }
  for (const a of estimativa.itcmd.flatMap((e) => e.avisos)) escrever(a, corpo, 8.5, C.tintaMedia);

  titulo('COMO A HERANÇA COSTUMA SER DIVIDIDA');
  if (quinhoes.indeterminado) {
    escrever(quinhoes.motivo ?? '', corpo, 10, C.tinta);
  } else {
    for (const p of quinhoes.partes) {
      escrever(
        `${p.rotulo}: ${p.pct.toLocaleString('pt-BR')}%${p.meacao ? ' (meação - não é herança)' : ''}`,
        corpoNegrito,
        10,
        C.tinta,
      );
    }
  }
  for (const a of quinhoes.avisos) escrever(a, corpo, 8.5, C.tintaMedia);

  titulo(limparTexto(estimativa.custos.rotulo).toUpperCase());
  escrever(
    `${brl(estimativa.custos.faixa.min)} a ${brl(estimativa.custos.faixa.max)}`,
    corpoNegrito,
    10.5,
    C.tinta,
  );
  for (const a of estimativa.custos.avisos) escrever(a, corpo, 8.5, C.tintaMedia);

  titulo('PRAZO');
  escrever(estimativa.prazo.texto, corpo, 10, C.tinta);

  titulo('RESOLVER AGORA × ADIAR');
  if (comparador.aplicavel) {
    for (const c of comparador.cenarios) {
      escrever(
        `${c.rotulo}: ${brl(c.itcmd.min)} a ${brl(c.itcmd.max)} de imposto projetado`,
        corpoNegrito,
        10,
        C.tinta,
      );
    }
  } else if (comparador.motivoNaoAplicavel) {
    escrever(comparador.motivoNaoAplicavel, corpo, 10, C.tinta);
  }
  for (const a of comparador.avisos) escrever(a, corpo, 8.5, C.tintaMedia);

  titulo('DOCUMENTOS PARA A FAMÍLIA SEPARAR');
  for (const d of docs) {
    escrever(`- ${d.titulo}: ${d.detalhe}`, corpo, 9.5, C.tinta);
  }

  titulo('10 PERGUNTAS PARA FAZER AO(À) ADVOGADO(A)');
  PERGUNTAS_AO_ADVOGADO.forEach((p, i) => {
    escrever(`${i + 1}. ${p.pergunta}`, corpoNegrito, 9.5, C.tinta);
    escrever(p.porque, corpo, 8.5, C.tintaMedia);
  });

  y -= 10;
  page.drawLine({
    start: { x: MARGEM, y },
    end: { x: MARGEM + LARGURA, y },
    thickness: 0.5,
    color: cor(C.fio),
  });
  y -= 8;
  escrever(
    `Respostas de referência: falecimento em ${r.dataObito.split('-').reverse().join('/')} (${r.ufFalecido}); ${r.qtdHerdeiros} herdeiro(s); família em ${r.cidade || '—'}/${r.ufFamilia || r.ufFalecido}. Orientação geral, sem coleta de dados sensíveis — não substitui a consulta com advogado(a). Esta plataforma não intermedeia honorários nem indica advogados.`,
    corpo,
    8,
    C.tintaMedia,
  );

  const bytes = await doc.save();
  return new Blob([bytes as unknown as BlobPart], { type: 'application/pdf' });
}
