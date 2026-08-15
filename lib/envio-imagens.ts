/**
 * Preparo de arquivos NO NAVEGADOR antes do envio às rotas internas de IA —
 * o corpo das funções serverless tem teto de ~4,5 MB, então o que passa
 * disso é reduzido AQUI, na máquina do usuário (fronteira de dados intacta):
 *
 *  - fotos/scans grandes viram JPEG comprimido (lado maior limitado);
 *  - PDF pesado (matrícula escaneada de muitas páginas) vira uma imagem
 *    JPEG POR PÁGINA via pdfjs — o lote segue dentro do limite e a leitura
 *    recebe as páginas nomeadas em sequência para agrupar o documento.
 */

/** Comprime foto/scan (JPEG, lado maior limitado). Falha devolve o original. */
export async function comprimirImagem(
  file: File,
  opts: { ladoMax?: number; qualidade?: number; minBytes?: number } = {},
): Promise<File> {
  const { ladoMax = 1800, qualidade = 0.72, minBytes = 350 * 1024 } = opts;
  if (file.size <= minBytes && !/\.bmp$/i.test(file.name)) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const escala = Math.min(1, ladoMax / Math.max(bitmap.width, bitmap.height));
    const largura = Math.max(1, Math.round(bitmap.width * escala));
    const altura = Math.max(1, Math.round(bitmap.height * escala));
    const canvas = document.createElement('canvas');
    canvas.width = largura;
    canvas.height = altura;
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, largura, altura);
    bitmap.close();
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', qualidade));
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], `${file.name.replace(/\.\w+$/, '')}.jpg`, { type: 'image/jpeg' });
  } catch {
    return file;
  }
}

export interface PdfParaImagensResultado {
  paginas: File[];
  /** Total de páginas do PDF (pode ser maior que o convertido, pelo teto). */
  totalPaginas: number;
}

/**
 * Converte um PDF em uma imagem JPEG por página (pdfjs, sempre via
 * loadPdfjs). As páginas saem nomeadas "<nome> — página N.jpg" para a
 * leitura por IA agrupar o mesmo documento.
 */
export async function pdfParaImagens(
  file: File,
  opts: { ladoMax?: number; qualidade?: number; maxPaginas?: number } = {},
): Promise<PdfParaImagensResultado> {
  const { ladoMax = 1700, qualidade = 0.66, maxPaginas = 30 } = opts;
  const { loadPdfjs } = await import('./ocr');
  const pdfjs = await loadPdfjs();
  const loadingTask = pdfjs.getDocument({ data: await file.arrayBuffer() });
  const doc = await loadingTask.promise;
  const total = doc.numPages;
  const paginas: File[] = [];
  const base = file.name.replace(/\.pdf$/i, '');
  try {
    for (let n = 1; n <= Math.min(total, maxPaginas); n++) {
      const page = await doc.getPage(n);
      const vp1 = page.getViewport({ scale: 1 });
      const escala = Math.min(2.4, ladoMax / Math.max(vp1.width, vp1.height));
      const viewport = page.getViewport({ scale: escala });
      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const ctx = canvas.getContext('2d');
      if (!ctx) break;
      await page.render({ canvas, canvasContext: ctx, viewport }).promise;
      const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', qualidade));
      if (!blob) break;
      paginas.push(
        new File([blob], `${base} — página ${n}.jpg`, { type: 'image/jpeg' }),
      );
      page.cleanup();
    }
  } finally {
    await loadingTask.destroy();
  }
  return { paginas, totalPaginas: total };
}
