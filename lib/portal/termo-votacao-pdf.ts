/**
 * "Termo de deliberação da família" — PDF montado no NAVEGADOR do advogado
 * (pdf-lib), nas cores do módulo. Documenta uma votação formal do Espaço do
 * Espólio: a pergunta, as opções, o voto válido de cada herdeiro (o mais
 * recente), a apuração e o histórico integral — prova da deliberação em
 * eventual questionamento. Segue o padrão do relatorio-pdf.ts.
 */

import type { VotacaoDados } from './espolio';

export interface VotoDoTermo {
  autor: string;
  opcaoId: string;
  comentario: string | null;
  /** ISO com hora. */
  em: string;
  /** true = o voto que vale (mais recente daquele herdeiro). */
  atual: boolean;
}

export interface VotacaoDoTermo {
  dados: VotacaoDados;
  /** ISO de abertura e de encerramento (null = ainda aberta). */
  abertaEm: string;
  encerradaEm: string | null;
  votos: VotoDoTermo[];
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

const dataHoraBr = (iso: string) =>
  new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

export async function montarTermoVotacaoPdf({
  nomeFalecido,
  nomeAdvogado,
  agora,
  votacao,
  advogadosDoCaso = [],
}: {
  nomeFalecido: string;
  nomeAdvogado: string;
  /** ISO de geração — vem de fora (o motor não olha o relógio). */
  agora: string;
  votacao: VotacaoDoTermo;
  /** Camada 4 — advogados CONSTITUÍDOS no caso (ciência registrada no termo). */
  advogadosDoCaso?: { nome: string; oab?: string; representa?: string[] }[];
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
  const titulo = (texto: string) => {
    y -= 6;
    garantir(24);
    escrever(texto, corpoNegrito, 11, C.bronze, MARGEM, LARGURA);
    y -= 2;
  };
  const fioFino = () => {
    garantir(10);
    page.drawLine({
      start: { x: MARGEM, y },
      end: { x: MARGEM + LARGURA, y },
      thickness: 0.5,
      color: cor(C.fio),
    });
    y -= 8;
  };

  const { dados } = votacao;
  const textoDaOpcao = (id: string) =>
    dados.opcoes.find((o) => o.id === id)?.texto ?? id;

  /* Cabeçalho. */
  escrever('TERMO DE DELIBERAÇÃO DA FAMÍLIA', serif, 16, C.tinta, MARGEM, LARGURA);
  y -= 2;
  escrever(`Inventário de ${nomeFalecido || '—'}`, corpoNegrito, 11, C.tintaMedia, MARGEM, LARGURA);
  escrever(
    `Conduzido por ${nomeAdvogado || '—'} · termo gerado em ${dataHoraBr(agora)}`,
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

  /* A deliberação. */
  titulo('QUESTÃO DELIBERADA');
  escrever(dados.pergunta, corpoNegrito, 12, C.tinta, MARGEM, LARGURA);
  if (dados.descricao) escrever(dados.descricao, corpo, 10, C.tintaMedia, MARGEM, LARGURA);
  escrever(
    `Votação aberta em ${dataHoraBr(votacao.abertaEm)}${
      votacao.encerradaEm ? ` e encerrada em ${dataHoraBr(votacao.encerradaEm)}` : ' — AINDA ABERTA na geração deste termo'
    }, pelo portal individual de cada herdeiro (link pessoal do cofre do caso).`,
    corpo,
    9.5,
    C.tintaMedia,
    MARGEM,
    LARGURA,
  );

  /* Apuração: só o voto mais recente de cada herdeiro vale. */
  const validos = votacao.votos.filter((v) => v.atual);
  titulo('APURAÇÃO (vale o voto mais recente de cada herdeiro)');
  for (const opcao of dados.opcoes) {
    const n = validos.filter((v) => v.opcaoId === opcao.id).length;
    escrever(`${opcao.texto} — ${n} voto(s)`, corpoNegrito, 10.5, C.tinta, MARGEM, LARGURA);
  }
  if (validos.length === 0) {
    escrever('Nenhum voto registrado.', corpo, 10, C.tintaMedia, MARGEM, LARGURA);
  }

  /* Votos válidos, um por herdeiro. */
  titulo('VOTOS VÁLIDOS');
  for (const v of validos) {
    fioFino();
    escrever(
      `${v.autor} — "${textoDaOpcao(v.opcaoId)}" em ${dataHoraBr(v.em)}${
        v.comentario ? ` — comentário: "${v.comentario}"` : ''
      }`,
      corpo,
      10,
      C.tinta,
      MARGEM,
      LARGURA,
    );
  }

  /* Histórico integral (auditoria): inclui votos substituídos. */
  const substituidos = votacao.votos.filter((v) => !v.atual);
  if (substituidos.length > 0) {
    titulo('HISTÓRICO INTEGRAL (votos substituídos pelo próprio herdeiro)');
    for (const v of substituidos) {
      escrever(
        `${v.autor} — "${textoDaOpcao(v.opcaoId)}" em ${dataHoraBr(v.em)}${
          v.comentario ? ` — comentário: "${v.comentario}"` : ''
        } (substituído)`,
        corpo,
        9,
        C.tintaMedia,
        MARGEM,
        LARGURA,
      );
    }
  }

  if (advogadosDoCaso.length > 0) {
    titulo('CIÊNCIA DOS ADVOGADOS CONSTITUÍDOS');
    for (const a of advogadosDoCaso) {
      escrever(
        `${a.nome}${a.oab ? ` (${a.oab})` : ''}${
          (a.representa?.length ?? 0) > 0 ? ` — representa ${a.representa!.join(', ')}` : ''
        } — com acesso a esta deliberação pelo portal do caso.`,
        corpo,
        9,
        C.tinta,
        MARGEM,
        LARGURA,
      );
    }
  }

  y -= 10;
  fioFino();
  escrever(
    'A deliberação registrada neste termo orienta os trabalhos do inventário e documenta a manifestação da família pelo portal do caso; não substitui a escritura pública, o formal de partilha ou a decisão judicial, nem a assinatura das partes nos atos próprios. Cada herdeiro pode constituir advogado(a) próprio(a) a qualquer momento (Provimento 205/2021 da OAB). Horários no fuso do computador que gerou o termo.',
    corpo,
    8,
    C.tintaMedia,
    MARGEM,
    LARGURA,
  );

  const bytes = await doc.save();
  return new Blob([bytes as unknown as BlobPart], { type: 'application/pdf' });
}
