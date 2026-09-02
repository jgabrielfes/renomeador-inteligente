/**
 * "Relatório de comunicação com a família" — PDF montado no NAVEGADOR do
 * advogado (pdf-lib), nas cores do módulo. É o registro de atendimento do
 * Painel do Cliente em papel: convites, acessos, dados e documentos
 * recebidos, aprovações/recusas com motivo, fases e publicações — com data
 * e hora. Serve de prova da comunicação em eventual questionamento.
 */

import { ROTULO_EVENTO, type DetalheEventoPortal } from './eventos';

export interface EventoDoRelatorio {
  /** ISO com hora (createdAt do evento). */
  quando: string;
  tipo: string;
  detalhe: DetalheEventoPortal | null;
}

/* Paleta do módulo (sucessorista.css) em RGB 0–1 para o pdf-lib. */
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

function linhaDoEvento(e: EventoDoRelatorio): string {
  const rotulo = ROTULO_EVENTO[e.tipo] ?? e.tipo;
  const partes = [rotulo];
  if (e.detalhe?.herdeiro) partes.push(`herdeiro(a): ${e.detalhe.herdeiro}`);
  if (e.detalhe?.documento) partes.push(`documento: ${e.detalhe.documento}`);
  if (e.detalhe?.fase) partes.push(`fase: ${e.detalhe.fase}`);
  if (e.detalhe?.cenario) partes.push(`cenário: ${e.detalhe.cenario}`);
  if (e.detalhe?.votacao) partes.push(`votação: ${e.detalhe.votacao}`);
  if (e.detalhe?.meio) partes.push(`meio: ${e.detalhe.meio}`);
  if (e.detalhe?.motivo) partes.push(`motivo: "${e.detalhe.motivo}"`);
  return partes.join(' — ');
}

export async function montarRelatorioComunicacaoPdf({
  nomeFalecido,
  nomeAdvogado,
  agora,
  eventos,
}: {
  nomeFalecido: string;
  nomeAdvogado: string;
  /** ISO de geração — vem de fora (o motor não olha o relógio). */
  agora: string;
  eventos: EventoDoRelatorio[];
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
    x: number,
    largura: number,
    entrelinha = 1.35,
  ) => {
    for (const linha of quebrar(texto, fonte, tamanho, largura)) {
      garantir(tamanho * entrelinha);
      page.drawText(linha, { x, y: y - tamanho, size: tamanho, font: fonte, color: cor(corTexto) });
      y -= tamanho * entrelinha;
    }
  };

  /* Cabeçalho. */
  escrever('RELATÓRIO DE COMUNICAÇÃO COM A FAMÍLIA', serif, 16, C.tinta, MARGEM, LARGURA);
  y -= 2;
  escrever(`Inventário de ${nomeFalecido || '—'}`, corpoNegrito, 11, C.tintaMedia, MARGEM, LARGURA);
  escrever(
    `Conduzido por ${nomeAdvogado || '—'} · gerado em ${new Date(agora).toLocaleString('pt-BR')} · ${eventos.length} registro(s)`,
    corpo,
    9,
    C.tintaMedia,
    MARGEM,
    LARGURA,
  );
  y -= 6;
  page.drawLine({
    start: { x: MARGEM, y },
    end: { x: MARGEM + LARGURA, y },
    thickness: 1.4,
    color: cor(C.tinta),
  });
  y -= 12;

  /* Linhas do registro: data/hora à esquerda, o fato à direita. */
  const LARG_DATA = 96;
  for (const e of eventos) {
    const dataHora = new Date(e.quando).toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
    const texto = linhaDoEvento(e);
    const linhas = quebrar(texto, corpo, 9.5, LARGURA - LARG_DATA - 8);
    const altura = Math.max(1, linhas.length) * 9.5 * 1.35 + 6;
    garantir(altura);
    page.drawText(dataHora, {
      x: MARGEM,
      y: y - 9.5,
      size: 9,
      font: corpoNegrito,
      color: cor(C.bronze),
    });
    for (const linha of linhas) {
      page.drawText(linha, {
        x: MARGEM + LARG_DATA + 8,
        y: y - 9.5,
        size: 9.5,
        font: corpo,
        color: cor(C.tinta),
      });
      y -= 9.5 * 1.35;
    }
    y -= 4;
    page.drawLine({
      start: { x: MARGEM, y },
      end: { x: MARGEM + LARGURA, y },
      thickness: 0.5,
      color: cor(C.fio),
    });
    y -= 8;
  }

  if (eventos.length === 0) {
    escrever(
      'Nenhum registro até o momento — os eventos passam a ser gravados com o uso do cofre e do painel da família.',
      corpo,
      10,
      C.tintaMedia,
      MARGEM,
      LARGURA,
    );
  }

  y -= 6;
  escrever(
    'Registro gerado pelo LexCausa a partir dos eventos do cofre e do Painel do Cliente. Horários no fuso do computador que gerou o relatório.',
    corpo,
    8,
    C.tintaMedia,
    MARGEM,
    LARGURA,
  );

  const bytes = await doc.save();
  return new Blob([bytes as unknown as BlobPart], { type: 'application/pdf' });
}
