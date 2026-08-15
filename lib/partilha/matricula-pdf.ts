/**
 * Relatório em PDF do Analisador de Matrícula (item IX) — montado no
 * NAVEGADOR com pdf-lib, vestindo as cores do módulo (papel, tinta, bronze,
 * lacre, verde-registro). A Tabela Consolidada de Situação Dominial sai como
 * tabela de verdade (colunas e linhas com filetes); alertas [ALTA] em lacre,
 * checklist do resumo, análise jurídica, pontos de atenção e confiabilidade.
 */

import type { AnaliseMatricula } from '../gemini-matricula';

/* Paleta do módulo (sucessorista.css) em RGB 0–1 para o pdf-lib. */
const C = {
  papel: [0.965, 0.957, 0.933] as const, // #f6f4ee
  papelAlto: [0.992, 0.988, 0.976] as const, // #fdfcf9
  tinta: [0.102, 0.137, 0.125] as const, // #1a2320
  tintaMedia: [0.29, 0.329, 0.31] as const, // #4a544f
  lacre: [0.62, 0.169, 0.145] as const, // #9e2b25
  bronze: [0.541, 0.427, 0.231] as const, // #8a6d3b
  verde: [0.18, 0.369, 0.306] as const, // #2e5e4e
  fio: [0.867, 0.847, 0.792] as const, // #ddd8ca
  fioForte: [0.725, 0.698, 0.612] as const, // #b9b29c
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
    .replace(/[^\x20-\x7E -ÿ–—]/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .trim();
}

export async function montarRelatorioMatriculaPdf(analise: AnaliseMatricula): Promise<Blob> {
  const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib');
  const doc = await PDFDocument.create();
  const serif = await doc.embedFont(StandardFonts.TimesRomanBold);
  const corpo = await doc.embedFont(StandardFonts.Helvetica);
  const corpoNegrito = await doc.embedFont(StandardFonts.HelveticaBold);

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
        // Palavra maior que a coluna: corta no braço.
        let resto = palavra;
        while (fonte.widthOfTextAtSize(resto, tamanho) > largura && resto.length > 1) {
          let corte = resto.length - 1;
          while (corte > 1 && fonte.widthOfTextAtSize(resto.slice(0, corte), tamanho) > largura) {
            corte--;
          }
          linhas.push(resto.slice(0, corte));
          resto = resto.slice(corte);
        }
        atual = resto;
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
      largura?: number;
      recuo?: number;
      espacoDepois?: number;
    } = {},
  ) => {
    const fonte = opts.fonte ?? corpo;
    const tamanho = opts.tamanho ?? 9.5;
    const largura = (opts.largura ?? LARGURA) - (opts.recuo ?? 0);
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

  const linhaChaveValor = (chave: string, valor: string | null) => {
    if (!valor) return;
    const tamanho = 9.5;
    const larguraChave = 150;
    garantir(tamanho * 1.4);
    page.drawText(limparTexto(chave), {
      x: MARGEM,
      y: y - tamanho,
      size: tamanho,
      font: corpoNegrito,
      color: cor(C.tintaMedia),
    });
    const linhas = quebrar(valor, corpo, tamanho, LARGURA - larguraChave);
    for (const [i, linha] of linhas.entries()) {
      if (i > 0) garantir(tamanho * 1.4);
      page.drawText(linha, {
        x: MARGEM + larguraChave,
        y: y - tamanho,
        size: tamanho,
        font: corpo,
        color: cor(C.tinta),
      });
      y -= tamanho * 1.4;
    }
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
  page.drawText('Análise de Matrícula de Imóvel', {
    x: MARGEM,
    y: A4.h - 58,
    size: 20,
    font: serif,
    color: cor(C.papelAlto),
  });
  const sub = [
    analise.identificacao.numeroMatricula ? `Matrícula ${analise.identificacao.numeroMatricula}` : null,
    analise.identificacao.comarca,
  ]
    .filter(Boolean)
    .join(' — ');
  if (sub) {
    page.drawText(limparTexto(sub), {
      x: MARGEM,
      y: A4.h - 76,
      size: 10,
      font: corpo,
      color: cor(C.fio),
    });
  }
  y = A4.h - 92 - 18;

  if (analise.descricaoImovel) {
    paragrafo(analise.descricaoImovel, { fonte: corpoNegrito, tamanho: 10, espacoDepois: 6 });
  }

  /* ---------- identificação ---------- */
  tituloSecao('Identificação da Matrícula');
  linhaChaveValor('Tipo de documento', analise.identificacao.tipoDocumento);
  linhaChaveValor('Número da matrícula', analise.identificacao.numeroMatricula);
  linhaChaveValor('Livro', analise.identificacao.livro);
  linhaChaveValor('Cartório', analise.identificacao.cartorio);
  linhaChaveValor('Comarca', analise.identificacao.comarca);
  linhaChaveValor('Data de abertura', analise.identificacao.dataAbertura);
  linhaChaveValor('Emissão da certidão', analise.identificacao.dataEmissaoCertidao);
  linhaChaveValor('Selo digital', analise.identificacao.seloDigital);
  linhaChaveValor('CNM', analise.identificacao.cnm);

  /* ---------- tabela consolidada ---------- */
  tituloSecao('Tabela Consolidada de Situação Dominial');
  {
    const colunas = [
      { titulo: 'Nome', largura: 150 },
      { titulo: 'Fração', largura: 52 },
      { titulo: 'Part. (%)', largura: 52 },
      { titulo: 'Domínio', largura: 70 },
      { titulo: 'Origens', largura: 105 },
      { titulo: 'Cônjuge', largura: 70 },
    ];
    const tamanho = 8.5;
    const alturaLinha = tamanho * 1.35;
    const celulas = (p: (typeof analise.proprietarios)[number]) => [
      p.nome,
      p.fracao ?? '—',
      p.participacaoPct !== null ? `${p.participacaoPct}%` : '—',
      p.tipoDominio ?? '—',
      p.origens ?? '—',
      p.statusConjuge ?? '—',
    ];

    const desenharLinha = (
      valores: string[],
      fonte: Fonte,
      corTexto: readonly [number, number, number],
      fundo?: readonly [number, number, number],
    ) => {
      const linhasPorCelula = valores.map((v, i) =>
        quebrar(v, fonte, tamanho, colunas[i].largura - 10),
      );
      const linhas = Math.max(...linhasPorCelula.map((l) => l.length));
      const altura = linhas * alturaLinha + 7;
      garantir(altura);
      if (fundo) {
        page.drawRectangle({
          x: MARGEM,
          y: y - altura,
          width: LARGURA,
          height: altura,
          color: cor(fundo),
        });
      }
      let x = MARGEM;
      for (const [i, linhasCelula] of linhasPorCelula.entries()) {
        let yCelula = y - tamanho - 4;
        for (const linha of linhasCelula) {
          page.drawText(linha, {
            x: x + 5,
            y: yCelula,
            size: tamanho,
            font: fonte,
            color: cor(corTexto),
          });
          yCelula -= alturaLinha;
        }
        x += colunas[i].largura;
      }
      y -= altura;
      page.drawLine({
        start: { x: MARGEM, y },
        end: { x: MARGEM + LARGURA, y },
        thickness: 0.5,
        color: cor(C.fio),
      });
    };

    desenharLinha(colunas.map((c) => c.titulo), corpoNegrito, C.papelAlto, C.tintaMedia);
    if (analise.proprietarios.length === 0) {
      paragrafo('Nenhum titular atual identificado na certidão.', { corTexto: C.tintaMedia });
    }
    for (const p of analise.proprietarios) {
      desenharLinha(celulas(p), corpo, C.tinta);
    }
    y -= 4;
  }

  /* ---------- ônus ativos ---------- */
  tituloSecao('Ônus Ativos');
  if (analise.onusAtivos.length === 0) {
    paragrafo('Nenhum ônus vigente identificado na certidão.', { corTexto: C.verde });
  }
  for (const o of analise.onusAtivos) {
    paragrafo(o.titulo, { fonte: corpoNegrito, tamanho: 10, corTexto: C.lacre, espacoDepois: 2 });
    const linhas: Array<[string, string | null]> = [
      ['Status', o.status],
      ['Data de registro', o.dataRegistro],
      ['Credor/Beneficiário', o.credor],
      ['Valor', o.valor],
      ['Prazo', o.prazo],
    ];
    for (const [chave, valor] of linhas) linhaChaveValor(chave, valor);
    if (o.descricao) paragrafo(o.descricao, { corTexto: C.tintaMedia, recuo: 0, espacoDepois: 8 });
  }

  /* ---------- alertas ---------- */
  tituloSecao('Alertas');
  if (analise.alertas.length === 0) {
    paragrafo('Nenhum alerta — situação dominial sem apontamentos.', { corTexto: C.verde });
  }
  for (const a of analise.alertas) {
    paragrafo(`[${a.nivel}] ${a.tipo}: ${a.descricao}`, {
      fonte: a.nivel === 'ALTA' ? corpoNegrito : corpo,
      corTexto: a.nivel === 'ALTA' ? C.lacre : C.tinta,
      espacoDepois: a.acaoRecomendada ? 2 : 6,
    });
    if (a.acaoRecomendada) {
      paragrafo(`Ação recomendada: ${a.acaoRecomendada}`, {
        corTexto: C.tintaMedia,
        recuo: 14,
        espacoDepois: 6,
      });
    }
  }

  /* ---------- resumo da situação ---------- */
  tituloSecao('Resumo da Situação');
  {
    const simNao = (v: boolean | null) => (v === null ? '—' : v ? 'sim' : 'não');
    const num = (v: number | null) => (v === null ? '—' : String(v));
    const itens: Array<[string, string, boolean]> = [
      ['Imóvel livre de ônus', simNao(analise.resumo.livreDeOnus), analise.resumo.livreDeOnus === false],
      ['Ônus ativos', simNao(analise.resumo.onusAtivos), analise.resumo.onusAtivos === true],
      ['Usufruto vigente', simNao(analise.resumo.usufrutoVigente), analise.resumo.usufrutoVigente === true],
      ['Cláusulas restritivas', simNao(analise.resumo.clausulasRestritivas), analise.resumo.clausulasRestritivas === true],
      ['Indisponibilidade', simNao(analise.resumo.indisponibilidade), analise.resumo.indisponibilidade === true],
      ['Processo judicial', simNao(analise.resumo.processoJudicial), analise.resumo.processoJudicial === true],
      ['Proprietário falecido', simNao(analise.resumo.proprietarioFalecido), analise.resumo.proprietarioFalecido === true],
      ['Documento completo', simNao(analise.resumo.documentoCompleto), analise.resumo.documentoCompleto === false],
      ['Certidão vigente', simNao(analise.resumo.certidaoVigente), analise.resumo.certidaoVigente === false],
      ['Quantidade de proprietários', num(analise.resumo.qtdProprietarios), false],
      ['Quantidade de usufrutuários', num(analise.resumo.qtdUsufrutuarios), false],
      ['Quantidade de ônus ativos', num(analise.resumo.qtdOnusAtivos), false],
      ['Soma das frações fecha em 100%', simNao(analise.resumo.fracoesFecham100), analise.resumo.fracoesFecham100 === false],
    ];
    const tamanho = 9.5;
    for (const [rotulo, valor, atencao] of itens) {
      garantir(tamanho * 1.45);
      page.drawText(limparTexto(rotulo), {
        x: MARGEM,
        y: y - tamanho,
        size: tamanho,
        font: corpo,
        color: cor(C.tintaMedia),
      });
      page.drawText(valor, {
        x: MARGEM + 210,
        y: y - tamanho,
        size: tamanho,
        font: corpoNegrito,
        color: cor(atencao ? C.lacre : C.tinta),
      });
      y -= tamanho * 1.45;
    }
    y -= 4;
  }

  /* ---------- análise jurídica ---------- */
  tituloSecao('Análise Jurídica');
  for (const par of analise.analiseJuridica) {
    paragrafo(par, { espacoDepois: 7 });
  }
  if (analise.analiseJuridica.length === 0) {
    paragrafo('A leitura não produziu a análise da cadeia dominial.', { corTexto: C.tintaMedia });
  }

  /* ---------- pontos de atenção ---------- */
  tituloSecao('Pontos de Atenção');
  if (analise.pontosDeAtencao.length === 0) {
    paragrafo('Nenhum ponto pendente antes de negociar o imóvel.', { corTexto: C.verde });
  }
  for (const ponto of analise.pontosDeAtencao) {
    paragrafo(ponto.titulo, { fonte: corpoNegrito, tamanho: 10, espacoDepois: 2 });
    paragrafo(ponto.descricao, { corTexto: C.tintaMedia, espacoDepois: 8 });
  }

  /* ---------- confiabilidade + selo ---------- */
  tituloSecao('Confiabilidade da Extração');
  if (analise.confiabilidade.indicePct !== null) {
    paragrafo(`Índice: ${analise.confiabilidade.indicePct}%`, { fonte: corpoNegrito, tamanho: 11 });
  }
  if (analise.confiabilidade.justificativa) {
    paragrafo(analise.confiabilidade.justificativa, { corTexto: C.tintaMedia });
  }
  y -= 6;
  paragrafo(
    'Relatório de apoio gerado por leitura automática — a conferência com a certidão original e a validação jurídica são do(a) profissional responsável.',
    { tamanho: 8, corTexto: C.bronze },
  );

  const bytes = await doc.save();
  const copia = new Uint8Array(bytes.length);
  copia.set(bytes);
  return new Blob([copia.buffer], { type: 'application/pdf' });
}
