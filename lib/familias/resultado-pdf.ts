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
  papelAlto: [0.992, 0.988, 0.976] as const,
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

/**
 * Setor circular como caminho SVG — a MESMA geometria da pizza dos PDFs do
 * módulo (orçamento do caso): 0° no topo, sentido horário. O pdf-lib desenha
 * caminho SVG com o y crescendo para BAIXO a partir da âncora, então o
 * chamador passa o TOPO da caixa.
 */
function setorSvg(cx: number, cy: number, r: number, a0: number, a1: number): string {
  const rad = (a: number) => ((a - 90) * Math.PI) / 180;
  const p = (a: number) => `${(cx + r * Math.cos(rad(a))).toFixed(3)} ${(cy + r * Math.sin(rad(a))).toFixed(3)}`;
  const grande = a1 - a0 > 180 ? 1 : 0;
  return `M ${cx} ${cy} L ${p(a0)} A ${r} ${r} 0 ${grande} 1 ${p(a1)} Z`;
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
    /* Pizza + tabela, na mesma veste do PDF de orçamento do caso. */
    const partes = quinhoes.partes;
    const n = Math.max(1, r.qtdHerdeiros);
    const VERDE_REGISTRO = [0.18, 0.369, 0.306] as const;
    // Cores com o mesmo significado da tela: meação em tinta-média, filhos em
    // bronze; o(a) viúvo(a) que herda junto (separação) em verde-registro.
    const corDaParte = (i: number) =>
      partes[i].meacao ? C.tintaMedia : i === partes.length - 1 ? C.bronze : VERDE_REGISTRO;
    // A última linha é sempre a dos filhos, com o % POR CABEÇA — na pizza ela
    // vira uma fatia por filho(a), as bordas separando os quinhões iguais.
    const fatias: { pct: number; cor: readonly [number, number, number] }[] = [];
    partes.forEach((p, i) => {
      const repete = i === partes.length - 1 ? n : 1;
      for (let k = 0; k < repete; k++) fatias.push({ pct: p.pct, cor: corDaParte(i) });
    });
    const totalPct = fatias.reduce((s, f) => s + f.pct, 0) || 100;

    const LADO = 130;
    const alturaLegenda = partes.length * 14 + 6;
    garantir(Math.max(LADO, alturaLegenda) + 12);
    const topo = y;
    const escala = LADO / 190; // mesma geometria da pizza de 190×190 da tela
    let acumulado = 0;
    for (const f of fatias) {
      const fracao = f.pct / totalPct;
      const a0 = acumulado * 360;
      const a1 = Math.min((acumulado + fracao) * 360, 359.98);
      acumulado += fracao;
      page.drawSvgPath(setorSvg(95, 95, 88, a0, a1), {
        x: MARGEM,
        y: topo,
        scale: escala,
        color: cor(f.cor),
        borderColor: cor(C.papelAlto),
        borderWidth: 1.5,
      });
    }
    // Legenda ao lado: quadradinho da cor + rótulo + %.
    let ly = topo - 10;
    const xLegenda = MARGEM + LADO + 16;
    partes.forEach((p, i) => {
      page.drawRectangle({
        x: xLegenda,
        y: ly - 6,
        width: 8,
        height: 8,
        color: cor(corDaParte(i)),
      });
      const rotulo = `${p.rotulo} — ${p.pct.toLocaleString('pt-BR')}%`;
      page.drawText(limparTexto(rotulo).slice(0, 80), {
        x: xLegenda + 13,
        y: ly - 5,
        size: 8.5,
        font: corpo,
        color: cor(C.tinta),
      });
      ly -= 14;
    });
    y = Math.min(topo - LADO, ly) - 14;

    // Tabela Parte · % do patrimônio · O que é.
    const xPct = MARGEM + LARGURA * 0.6;
    const xOque = MARGEM + LARGURA * 0.76;
    garantir(18 + partes.length * 18);
    page.drawText('Parte', { x: MARGEM, y: y - 9, size: 9, font: corpoNegrito, color: cor(C.bronze) });
    page.drawText('% do patrimônio', { x: xPct, y: y - 9, size: 9, font: corpoNegrito, color: cor(C.bronze) });
    page.drawText('O que é', { x: xOque, y: y - 9, size: 9, font: corpoNegrito, color: cor(C.bronze) });
    y -= 13;
    page.drawLine({
      start: { x: MARGEM, y },
      end: { x: MARGEM + LARGURA, y },
      thickness: 0.8,
      color: cor(C.fio),
    });
    y -= 4;
    for (const p of partes) {
      const linhasParte = quebrar(p.rotulo, corpo, 9, LARGURA * 0.56);
      garantir(linhasParte.length * 12 + 8);
      linhasParte.forEach((l, k) => {
        page.drawText(l, { x: MARGEM, y: y - 9 - k * 12, size: 9, font: corpo, color: cor(C.tinta) });
      });
      page.drawText(`${p.pct.toLocaleString('pt-BR')}%`, {
        x: xPct,
        y: y - 9,
        size: 9,
        font: corpoNegrito,
        color: cor(C.tinta),
      });
      page.drawText(limparTexto(p.meacao ? 'Meação (não é herança)' : 'Herança'), {
        x: xOque,
        y: y - 9,
        size: 8.5,
        font: corpo,
        color: cor(C.tinta),
      });
      y -= linhasParte.length * 12 + 3;
      page.drawLine({
        start: { x: MARGEM, y },
        end: { x: MARGEM + LARGURA, y },
        thickness: 0.5,
        color: cor(C.fio),
      });
      y -= 4;
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
