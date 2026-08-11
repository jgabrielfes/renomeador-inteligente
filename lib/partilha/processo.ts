/**
 * Montagem do processo a partir dos documentos anexados no acervo.
 *
 * Tudo roda no navegador (pdf-lib + jszip); nenhum arquivo sai da máquina.
 * Imagens viram página A4 via lib/to-pdf (mesmo caminho do renomeador);
 * PDFs entram como estão. Formato não suportado não derruba a montagem —
 * vira aviso (no unificado) ou segue no formato original (no ZIP).
 */

import { imageFileToPdfBlob, isImageFile, pdfNameFor } from '@/lib/to-pdf';

export interface ItemProcesso {
  titulo: string;
  arquivos: File[];
}

export interface ResultadoMontagem {
  blob: Blob;
  avisos: string[];
}

function ehPdf(nome: string): boolean {
  return nome.toLowerCase().endsWith('.pdf');
}

async function comoPdfBytes(arquivo: File): Promise<Uint8Array | null> {
  if (ehPdf(arquivo.name)) return new Uint8Array(await arquivo.arrayBuffer());
  if (isImageFile(arquivo.name)) {
    const blob = await imageFileToPdfBlob(arquivo);
    return new Uint8Array(await blob.arrayBuffer());
  }
  return null;
}

/** Um único PDF com todos os documentos, na ordem do catálogo. */
export async function montarPdfUnificado(itens: ItemProcesso[]): Promise<ResultadoMontagem> {
  const { PDFDocument } = await import('pdf-lib');
  const doc = await PDFDocument.create();
  const avisos: string[] = [];

  for (const item of itens) {
    for (const arquivo of item.arquivos) {
      const bytes = await comoPdfBytes(arquivo);
      if (!bytes) {
        avisos.push(`${item.titulo} — ${arquivo.name}: formato não suportado; anexe PDF ou imagem.`);
        continue;
      }
      try {
        const origem = await PDFDocument.load(bytes, { ignoreEncryption: true });
        const paginas = await doc.copyPages(origem, origem.getPageIndices());
        for (const p of paginas) doc.addPage(p);
      } catch {
        avisos.push(`${item.titulo} — ${arquivo.name}: PDF ilegível ou protegido; ficou fora do unificado.`);
      }
    }
  }

  if (doc.getPageCount() === 0) {
    throw new Error('Nenhum documento anexado pôde entrar no PDF unificado.');
  }
  const salvo = await doc.save();
  return { blob: new Blob([salvo as BlobPart], { type: 'application/pdf' }), avisos };
}

/**
 * ZIP com um PDF por documento, numerado na ordem do processo
 * ("01 - Certidão de óbito - arquivo.pdf"). Arquivo que não converte
 * entra no formato original, com aviso.
 */
export async function montarZipIndividualizado(itens: ItemProcesso[]): Promise<ResultadoMontagem> {
  const { default: JSZip } = await import('jszip');
  const zip = new JSZip();
  const avisos: string[] = [];

  const total = itens.reduce((acc, i) => acc + i.arquivos.length, 0);
  const largura = Math.max(2, String(total).length);
  let n = 0;

  for (const item of itens) {
    for (const arquivo of item.arquivos) {
      n += 1;
      const prefixo = `${String(n).padStart(largura, '0')} - ${item.titulo}`;
      if (ehPdf(arquivo.name)) {
        zip.file(`${prefixo} - ${arquivo.name}`, await arquivo.arrayBuffer());
      } else if (isImageFile(arquivo.name)) {
        const pdf = await imageFileToPdfBlob(arquivo);
        zip.file(`${prefixo} - ${pdfNameFor(arquivo.name)}`, await pdf.arrayBuffer());
      } else {
        avisos.push(`${arquivo.name}: formato não convertido para PDF — entrou no ZIP como está.`);
        zip.file(`${prefixo} - ${arquivo.name}`, await arquivo.arrayBuffer());
      }
    }
  }

  if (n === 0) throw new Error('Nenhum documento anexado para individualizar.');
  const bytes = await zip.generateAsync({ type: 'uint8array' });
  return { blob: new Blob([bytes as BlobPart], { type: 'application/zip' }), avisos };
}
