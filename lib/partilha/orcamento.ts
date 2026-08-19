/**
 * FOLHA DE ORÇAMENTO do inventário (item V — Custos).
 *
 * Consolida a projeção completa numa folha apresentável à família: parcelas
 * cartorárias/judiciais, ITCMD provisionado (inclusive das sucessões
 * cumuladas) e os CUSTOS ADICIONAIS lançados pelo usuário — tabela enxuta
 * Item · Valor (os fundamentos legais ficam no espelho da aba, não na folha;
 * pedido do escritório).
 * Sai em PDF nas cores da identidade (papel/tinta/bronze/lacre, pdf-lib no
 * navegador) ou em DOCX EDITÁVEL na mesma veste (montarDocxRico, Tahoma,
 * tabela com bordas) — tudo gerado localmente, nada sai da máquina.
 */

import { montarDocxRico, type BlocoDocx } from './docx';
import { formatarData } from './familia';

/** Despesa extra lançada à mão na aba Custos (valor decimal "1234.56"). */
export interface DespesaAdicional {
  id: string;
  descricao: string;
  valor: string;
}

export interface LinhaOrcamento {
  rotulo: string;
  valor: number;
  detalhe?: string;
}

export interface DadosOrcamento {
  /** Autor(a) da herança — título da folha. */
  nomeCaso: string;
  dataObito?: string;
  rito: 'EXTRAJUDICIAL' | 'JUDICIAL' | null;
  linhas: LinhaOrcamento[];
  total: number;
  avisos: string[];
  /** Data/hora de emissão já formatada (o gerador não olha o relógio). */
  geradoEm: string;
}

const brl = (v: number) =>
  `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function somaAdicionais(adicionais: DespesaAdicional[]): number {
  return adicionais.reduce((acc, a) => acc + (Number(a.valor) || 0), 0);
}

/** Monta as linhas da folha a partir do que a aba Custos já tem em mãos. */
export function montarDadosOrcamento(entrada: {
  nomeCaso: string;
  dataObito?: string;
  rito: 'EXTRAJUDICIAL' | 'JUDICIAL' | null;
  parcelas: { rotulo: string; valor: number; detalhe?: string; aproximado: boolean }[];
  avisos: string[];
  provisaoTotal: number | null;
  sucessoes: { nome: string; dataObito: string; total: number }[];
  adicionais: DespesaAdicional[];
  geradoEm: string;
}): DadosOrcamento {
  const linhas: LinhaOrcamento[] = entrada.parcelas.map((p) => ({
    rotulo: p.rotulo + (p.aproximado ? ' *' : ''),
    valor: p.valor,
    detalhe: p.detalhe,
  }));
  for (const s of entrada.sucessoes) {
    linhas.push({
      rotulo: `ITCMD — sucessão cumulada de ${s.nome}`,
      detalhe: `fato gerador em ${formatarData(s.dataObito)}`,
      valor: s.total,
    });
  }
  if (entrada.provisaoTotal !== null) {
    linhas.push({
      rotulo: 'ITCMD provisionado (sucessão principal)',
      valor: entrada.provisaoTotal,
    });
  }
  for (const a of entrada.adicionais) {
    const valor = Number(a.valor) || 0;
    if (!a.descricao.trim() && valor === 0) continue;
    linhas.push({
      rotulo: a.descricao.trim() || 'Despesa adicional',
      valor,
    });
  }
  return {
    nomeCaso: entrada.nomeCaso,
    dataObito: entrada.dataObito,
    rito: entrada.rito,
    linhas,
    total: linhas.reduce((acc, l) => acc + l.valor, 0),
    avisos: entrada.avisos,
    geradoEm: entrada.geradoEm,
  };
}

const DISCLAIMER =
  'Cálculo de apoio com fundamento legal, pelas tabelas oficiais vigentes (2026) — os valores são estimativas de orçamento, sujeitas à conferência das tabelas na data dos atos. A revisão do advogado responsável é obrigatória.';
const NOTA_APROXIMADO =
  '* valor aproximado ou contagem de atos a confirmar antes de fechar o orçamento com a família.';

function subtitulo(d: DadosOrcamento): string {
  const partes = [
    `Inventário dos bens deixados por ${d.nomeCaso || '____________'}`,
    d.dataObito ? `óbito em ${formatarData(d.dataObito)}` : '',
    d.rito ? `rito ${d.rito === 'JUDICIAL' ? 'judicial' : 'extrajudicial'}` : '',
  ];
  return partes.filter(Boolean).join(' · ');
}

/* ------------------------------- DOCX ------------------------------- */

/** Folha de orçamento EDITÁVEL, na veste da identidade (Tahoma sobre papel). */
export async function montarOrcamentoDocx(d: DadosOrcamento): Promise<Blob> {
  const temAproximado = d.linhas.some((l) => l.rotulo.endsWith('*'));
  const blocos: BlocoDocx[] = [
    { tipo: 'p', texto: 'FOLHA DE ORÇAMENTO — INVENTÁRIO', titulo: true, negrito: true, filete: '8A6D3B' },
    { tipo: 'p', texto: subtitulo(d), centrado: true },
    { tipo: 'p', texto: `Emitida em ${d.geradoEm}.`, centrado: true, discreto: true },
    { tipo: 'p', texto: '' },
    {
      tipo: 'tabela',
      // Largura útil A4 (~9.070 twips): item · valor.
      colunas: [7270, 1800],
      tamanho: 19,
      linhas: [
        { celulas: ['Item', 'Valor'], negrito: true },
        ...d.linhas.map((l) => ({
          celulas: [l.rotulo + (l.detalhe ? ` — ${l.detalhe}` : ''), brl(l.valor)],
        })),
        { celulas: ['TOTAL PROJETADO', brl(d.total)], negrito: true },
      ],
    },
    { tipo: 'p', texto: '' },
    ...(temAproximado ? [{ tipo: 'p' as const, texto: NOTA_APROXIMADO, discreto: true }] : []),
    ...d.avisos.map((a) => ({ tipo: 'p' as const, texto: a, discreto: true })),
    { tipo: 'p', texto: DISCLAIMER, discreto: true },
  ];
  return montarDocxRico(blocos, {
    estilo: { fonte: 'Tahoma', tamanho: 21, cor: '1A2320', fundo: 'F6F4EE', tituloCentrado: true },
  });
}

/* -------------------------------- PDF -------------------------------- */

/* Paleta do módulo (sucessorista.css) em RGB 0–1 para o pdf-lib. */
const C = {
  papel: [0.965, 0.957, 0.933] as const,
  papelAlto: [0.992, 0.988, 0.976] as const,
  tinta: [0.102, 0.137, 0.125] as const,
  tintaMedia: [0.29, 0.329, 0.31] as const,
  bronze: [0.541, 0.427, 0.231] as const,
  fio: [0.867, 0.847, 0.792] as const,
  fioForte: [0.725, 0.698, 0.612] as const,
};

const A4 = { w: 595.28, h: 841.89 };
const MARGEM = 48;
const LARGURA = A4.w - MARGEM * 2;

/** WinAnsi das fontes padrão: troca o que não codifica por equivalentes. */
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

/** Folha de orçamento em PDF nas cores do módulo. */
export async function montarOrcamentoPdf(d: DadosOrcamento): Promise<Blob> {
  const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib');
  const doc = await PDFDocument.create();
  const serif = await doc.embedFont(StandardFonts.TimesRomanBold);
  const corpo = await doc.embedFont(StandardFonts.Helvetica);
  const negrito = await doc.embedFont(StandardFonts.HelveticaBold);
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
  const precisa = (altura: number) => {
    if (y - altura < MARGEM) novaPagina();
  };

  const quebrar = (texto: string, fonte: Fonte, tamanho: number, largura: number): string[] => {
    const palavras = limparTexto(texto).split(' ');
    const linhas: string[] = [];
    let atual = '';
    for (const p of palavras) {
      const tentativa = atual ? `${atual} ${p}` : p;
      if (fonte.widthOfTextAtSize(tentativa, tamanho) <= largura) atual = tentativa;
      else {
        if (atual) linhas.push(atual);
        atual = p;
      }
    }
    if (atual) linhas.push(atual);
    return linhas.length > 0 ? linhas : [''];
  };

  // Cabeçalho
  page.drawText('FOLHA DE ORÇAMENTO — INVENTÁRIO', {
    x: MARGEM, y: y - 16, size: 17, font: serif, color: cor(C.tinta),
  });
  y -= 24;
  page.drawLine({
    start: { x: MARGEM, y }, end: { x: MARGEM + LARGURA, y },
    thickness: 1.4, color: cor(C.bronze),
  });
  y -= 16;
  for (const linha of quebrar(subtitulo(d), corpo, 10.5, LARGURA)) {
    page.drawText(linha, { x: MARGEM, y, size: 10.5, font: corpo, color: cor(C.tinta) });
    y -= 14;
  }
  page.drawText(limparTexto(`Emitida em ${d.geradoEm}.`), {
    x: MARGEM, y, size: 9, font: corpo, color: cor(C.tintaMedia),
  });
  y -= 20;

  // Tabela: Item · Valor
  const COL = { valor: 110, item: LARGURA - 110 };
  const PAD = 6;
  const desenharLinha = (
    celulas: [string, string],
    opts: { fonte: Fonte; tamanho: number; corTexto: readonly [number, number, number]; fundo?: readonly [number, number, number] },
  ) => {
    const l1 = quebrar(celulas[0], opts.fonte, opts.tamanho, COL.item - PAD * 2);
    const altura = Math.max(l1.length, 1) * (opts.tamanho + 3) + PAD * 2;
    precisa(altura);
    if (opts.fundo)
      page.drawRectangle({ x: MARGEM, y: y - altura, width: LARGURA, height: altura, color: cor(opts.fundo) });
    let ty = y - PAD - opts.tamanho;
    for (const linha of l1) {
      page.drawText(linha, { x: MARGEM + PAD, y: ty, size: opts.tamanho, font: opts.fonte, color: cor(opts.corTexto) });
      ty -= opts.tamanho + 3;
    }
    const valor = limparTexto(celulas[1]);
    const larguraValor = opts.fonte.widthOfTextAtSize(valor, opts.tamanho);
    page.drawText(valor, {
      x: MARGEM + LARGURA - PAD - larguraValor,
      y: y - PAD - opts.tamanho,
      size: opts.tamanho,
      font: opts.fonte,
      color: cor(opts.corTexto),
    });
    y -= altura;
    page.drawLine({
      start: { x: MARGEM, y }, end: { x: MARGEM + LARGURA, y },
      thickness: 0.6, color: cor(C.fio),
    });
  };

  desenharLinha(['Item', 'Valor'], {
    fonte: negrito, tamanho: 9.5, corTexto: C.tinta, fundo: C.papelAlto,
  });
  for (const l of d.linhas) {
    desenharLinha(
      [l.rotulo + (l.detalhe ? ` — ${l.detalhe}` : ''), brl(l.valor)],
      { fonte: corpo, tamanho: 9, corTexto: C.tinta },
    );
  }
  desenharLinha(['TOTAL PROJETADO', brl(d.total)], {
    fonte: negrito, tamanho: 10.5, corTexto: C.tinta, fundo: C.papelAlto,
  });

  // Notas e disclaimer
  y -= 14;
  const notas = [
    ...(d.linhas.some((l) => l.rotulo.endsWith('*')) ? [NOTA_APROXIMADO] : []),
    ...d.avisos,
    DISCLAIMER,
  ];
  for (const nota of notas) {
    for (const linha of quebrar(nota, corpo, 8.5, LARGURA)) {
      precisa(12);
      page.drawText(linha, { x: MARGEM, y, size: 8.5, font: corpo, color: cor(C.tintaMedia) });
      y -= 11;
    }
    y -= 4;
  }

  const bytes = await doc.save();
  return new Blob([bytes as BlobPart], { type: 'application/pdf' });
}
