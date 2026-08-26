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
import type { MatrizPartilha } from './quadro-bens';

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
  /**
   * Seções do PDF COMPLETO — partes, acervo, divisão e quadro por bem.
   * Opcionais de propósito: o DOCX editável e o orçamento de quem ainda não
   * lançou a partilha continuam saindo só com a tabela de custos.
   */
  completo?: DossieOrcamento;
}

/** As seções que antecedem a folha de custos no PDF completo. */
export interface DossieOrcamento {
  /** Viúvo(a) meeiro(a), quando há. */
  meeiro?: { nome: string; fracao: string; valor: number };
  /** Herdeiros com a fração da herança e o quinhão apurado. */
  herdeiros: { nome: string; fracao: string; valor: number; pctMassa: number }[];
  /** Relação do acervo com o valor de avaliação ao lado do atribuído. */
  acervo: {
    descricao: string;
    natureza: 'COMUM' | 'PARTICULAR';
    valor: number;
    avaliacao?: number;
  }[];
  /** Fatias do gráfico de pizza (meação + quinhões), na ordem da tela. */
  fatias: { nome: string; valor: number }[];
  /** Base do gráfico e dos percentuais. */
  massaPartilhavel: number;
  /**
   * Quadro da partilha CONSOLIDADO em matriz: linhas = bens, colunas =
   * participantes (meação primeiro), célula = proporção + valor. A lista
   * linha a linha ficava extensa demais no papel (pedido do escritório).
   */
  matriz: MatrizPartilha;
  /** Divergências do quadro (bem cuja partilha não fecha 100%). */
  avisosQuadro: string[];
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

/**
 * Slots --graf-1..8 do sucessorista.css, na MESMA ordem da pizza da tela —
 * o PDF e o gráfico da aba III têm de sair com as mesmas cores nas mesmas
 * fatias. (No papel vale sempre a paleta do tema claro.)
 */
const GRAF = [
  [0.541, 0.427, 0.231], // --bronze     #8a6d3b
  [0.561, 0.702, 0.631], // verde claro  #8fb3a1
  [0.62, 0.169, 0.145], // --lacre      #9e2b25
  [0.812, 0.663, 0.416], // bronze claro #cfa96a
  [0.18, 0.369, 0.306], // --verde-registro #2e5e4e
  [0.769, 0.4, 0.373], // lacre claro  #c4665f
  [0.29, 0.329, 0.31], // --tinta-media #4a544f
  [0.839, 0.788, 0.639], // creme        #d6c9a3
] as const;

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

/**
 * Setor circular como caminho SVG — a MESMA geometria da pizza da aba III
 * (0° no topo, sentido horário), para o papel não contar outra história.
 * O pdf-lib desenha caminho SVG com o y crescendo para BAIXO a partir da
 * âncora, então o chamador passa o TOPO da caixa.
 */
function setorSvg(cx: number, cy: number, r: number, a0: number, a1: number): string {
  const rad = (a: number) => ((a - 90) * Math.PI) / 180;
  const p = (a: number) => `${(cx + r * Math.cos(rad(a))).toFixed(3)} ${(cy + r * Math.sin(rad(a))).toFixed(3)}`;
  const grande = a1 - a0 > 180 ? 1 : 0;
  return `M ${cx} ${cy} L ${p(a0)} A ${r} ${r} 0 ${grande} 1 ${p(a1)} Z`;
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

  /* ---- primitivas de seção e de tabela (usadas pelo dossiê e pela folha) ---- */

  const tituloSecao = (texto: string) => {
    precisa(34);
    y -= 8;
    page.drawText(limparTexto(texto).toUpperCase(), {
      x: MARGEM, y: y - 11, size: 10.5, font: negrito, color: cor(C.bronze),
    });
    y -= 16;
    page.drawLine({
      start: { x: MARGEM, y }, end: { x: MARGEM + LARGURA, y },
      thickness: 0.8, color: cor(C.fioForte),
    });
    y -= 10;
  };

  const paragrafo = (
    texto: string,
    tamanho = 9.5,
    corTexto: readonly [number, number, number] = C.tinta,
  ) => {
    for (const linha of quebrar(texto, corpo, tamanho, LARGURA)) {
      precisa(tamanho + 4);
      page.drawText(linha, { x: MARGEM, y, size: tamanho, font: corpo, color: cor(corTexto) });
      y -= tamanho + 3;
    }
  };

  interface Coluna {
    titulo: string;
    /** Fração da largura útil (as colunas somam 1). */
    peso: number;
    direita?: boolean;
  }

  /**
   * Tabela de N colunas com cabeçalho que se REPETE quando a página vira —
   * sem isso uma partilha longa perde o cabeçalho no meio do caminho.
   */
  const tabela = (
    colunas: Coluna[],
    linhas: string[][],
    rodape?: string[],
    opts?: { tamanho?: number },
  ) => {
    const PAD = 5;
    const tamanhoCorpo = opts?.tamanho ?? 8.5;
    const larguras = colunas.map((c) => c.peso * LARGURA);
    const desenhar = (
      celulas: string[],
      opts: { fonte: Fonte; tamanho: number; fundo?: readonly [number, number, number] },
    ) => {
      const porColuna = celulas.map((texto, i) =>
        quebrar(texto, opts.fonte, opts.tamanho, larguras[i] - PAD * 2),
      );
      const altura = Math.max(...porColuna.map((l) => l.length)) * (opts.tamanho + 3) + PAD * 2;
      return { porColuna, altura };
    };
    const linhaNaPagina = (
      celulas: string[],
      opts: { fonte: Fonte; tamanho: number; fundo?: readonly [number, number, number] },
    ) => {
      const { porColuna, altura } = desenhar(celulas, opts);
      if (opts.fundo)
        page.drawRectangle({
          x: MARGEM, y: y - altura, width: LARGURA, height: altura, color: cor(opts.fundo),
        });
      let x = MARGEM;
      porColuna.forEach((linhasCel, i) => {
        let ty = y - PAD - opts.tamanho;
        for (const t of linhasCel) {
          const largura = opts.fonte.widthOfTextAtSize(t, opts.tamanho);
          page.drawText(t, {
            x: colunas[i].direita ? x + larguras[i] - PAD - largura : x + PAD,
            y: ty,
            size: opts.tamanho,
            font: opts.fonte,
            color: cor(C.tinta),
          });
          ty -= opts.tamanho + 3;
        }
        x += larguras[i];
      });
      y -= altura;
      page.drawLine({
        start: { x: MARGEM, y }, end: { x: MARGEM + LARGURA, y },
        thickness: 0.6, color: cor(C.fio),
      });
    };

    const cabecalho = () =>
      linhaNaPagina(colunas.map((c) => c.titulo), {
        fonte: negrito, tamanho: 9, fundo: C.papelAlto,
      });

    precisa(desenhar(colunas.map((c) => c.titulo), { fonte: negrito, tamanho: 9 }).altura + 24);
    cabecalho();
    for (const celulas of linhas) {
      const { altura } = desenhar(celulas, { fonte: corpo, tamanho: tamanhoCorpo });
      if (y - altura < MARGEM) {
        novaPagina();
        cabecalho();
      }
      linhaNaPagina(celulas, { fonte: corpo, tamanho: tamanhoCorpo });
    }
    if (rodape) {
      const { altura } = desenhar(rodape, { fonte: negrito, tamanho: 9.5 });
      if (y - altura < MARGEM) {
        novaPagina();
        cabecalho();
      }
      linhaNaPagina(rodape, { fonte: negrito, tamanho: 9.5, fundo: C.papelAlto });
    }
  };

  // Cabeçalho
  page.drawText(d.completo ? 'INVENTÁRIO — PARTILHA E ORÇAMENTO' : 'FOLHA DE ORÇAMENTO — INVENTÁRIO', {
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

  /* ------------- dossiê: partes, acervo, divisão e quadro ------------- */

  const dossie = d.completo;
  if (dossie) {
    // 1. As partes
    tituloSecao('As partes');
    paragrafo(`Autor(a) da herança: ${d.nomeCaso || '____________'}.`);
    if (dossie.meeiro) {
      paragrafo(
        `Viúvo(a) meeiro(a): ${dossie.meeiro.nome} — meação de ${dossie.meeiro.fracao} (${brl(
          dossie.meeiro.valor,
        )}), que não é herança: essa parte já lhe pertence.`,
      );
    }
    if (dossie.herdeiros.length > 0) {
      y -= 4;
      tabela(
        [
          { titulo: 'Herdeiro(a)', peso: 0.46 },
          { titulo: 'Fração da herança', peso: 0.2 },
          { titulo: '% da massa', peso: 0.14, direita: true },
          { titulo: 'Quinhão', peso: 0.2, direita: true },
        ],
        dossie.herdeiros.map((h) => [
          h.nome,
          h.fracao,
          `${h.pctMassa.toFixed(2).replace('.', ',')}%`,
          brl(h.valor),
        ]),
      );
    }

    // 2. O acervo, com a avaliação ao lado do valor atribuído
    if (dossie.acervo.length > 0) {
      tituloSecao('O acervo');
      tabela(
        [
          { titulo: 'Bem', peso: 0.46 },
          { titulo: 'Natureza', peso: 0.16 },
          { titulo: 'Valor atribuído', peso: 0.19, direita: true },
          { titulo: 'Avaliação', peso: 0.19, direita: true },
        ],
        dossie.acervo.map((b) => [
          b.descricao,
          b.natureza === 'COMUM' ? 'comum' : 'particular',
          brl(b.valor),
          b.avaliacao ? brl(b.avaliacao) : '—',
        ]),
        [
          'Monte partilhável',
          '',
          brl(dossie.massaPartilhavel),
          '',
        ],
      );
    }

    // 3. O gráfico de pizza, com a legenda ao lado
    const fatias = dossie.fatias.filter((f) => f.valor > 0);
    if (fatias.length > 0 && dossie.massaPartilhavel > 0) {
      tituloSecao('Divisão do acervo');
      const LADO = 150;
      const alturaLegenda = fatias.length * 14 + 6;
      precisa(Math.max(LADO, alturaLegenda) + 10);
      const topo = y;
      const escala = LADO / 190; // a pizza da tela é 190×190
      let acumulado = 0;
      fatias.forEach((f, i) => {
        const fracao = f.valor / dossie.massaPartilhavel;
        const a0 = acumulado * 360;
        const a1 = Math.min((acumulado + fracao) * 360, 359.98);
        acumulado += fracao;
        const c = GRAF[i % GRAF.length];
        page.drawSvgPath(setorSvg(95, 95, 88, a0, a1), {
          x: MARGEM,
          y: topo,
          scale: escala,
          color: rgb(c[0], c[1], c[2]),
          borderColor: cor(C.papelAlto),
          borderWidth: 1.5,
        });
      });
      // Legenda: quadradinho da cor + nome + % + valor.
      let ly = topo - 10;
      const xLegenda = MARGEM + LADO + 18;
      fatias.forEach((f, i) => {
        const c = GRAF[i % GRAF.length];
        const pct = (f.valor / dossie.massaPartilhavel) * 100;
        page.drawRectangle({
          x: xLegenda, y: ly - 6, width: 8, height: 8, color: rgb(c[0], c[1], c[2]),
        });
        const rotulo = `${f.nome} — ${pct.toFixed(2).replace('.', ',')}% · ${brl(f.valor)}`;
        page.drawText(limparTexto(rotulo).slice(0, 90), {
          x: xLegenda + 13, y: ly - 5, size: 8.5, font: corpo, color: cor(C.tinta),
        });
        ly -= 14;
      });
      y = Math.min(topo - LADO, ly) - 10;
    }

    // 4. O quadro da partilha, bem a bem — MATRIZ consolidada: linhas = bens,
    //    colunas = participantes, célula = proporção + valor (a lista linha a
    //    linha ficava extensa demais para apresentar; pedido do escritório).
    const parts = dossie.matriz.participantes;
    if (dossie.matriz.linhas.length > 0 && parts.length > 0) {
      tituloSecao('Quadro da partilha — bem a bem');
      // Sem o "R$ " nas células: a sigla única fica na nota sob a matriz e a
      // coluna estreita não parte o valor no prefixo.
      const compacto = (v: number) =>
        v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      const pesoBem = parts.length <= 3 ? 0.34 : 0.28;
      tabela(
        [
          { titulo: 'Bem', peso: pesoBem },
          ...parts.map((p) => ({
            titulo: p.nome + (p.meacao ? ' (meação)' : ''),
            peso: (1 - pesoBem) / parts.length,
            direita: true,
          })),
        ],
        dossie.matriz.linhas.map((l) => [
          l.bem,
          ...l.celulas.map((c) => (c ? `${c.proporcao} — ${compacto(c.valor)}` : '—')),
        ]),
        ['TOTAL', ...dossie.matriz.totais.map(compacto)],
        { tamanho: parts.length >= 5 ? 7.5 : 8.5 },
      );
      paragrafo(
        'Valores em reais (R$). A coluna "(meação)" não é herança: essa parte já pertence ao(à) sobrevivente.',
        8.5,
        C.tintaMedia,
      );
      for (const aviso of dossie.avisosQuadro) paragrafo(aviso, 8.5, C.tintaMedia);
    }

    tituloSecao('Orçamento');
  }

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
