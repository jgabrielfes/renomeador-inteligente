// Extração de texto 100% no navegador: Tesseract.js (WASM) para OCR
// e pdf.js para PDFs (texto nativo primeiro; se for escaneado, renderiza e faz OCR).

import { cleanSpaces } from "./renamer";

export const IMAGE_EXTS = [".jpg", ".jpeg", ".png", ".webp", ".bmp"];
export const PDF_EXTS = [".pdf"];
export const SUPPORTED_EXTS = [...IMAGE_EXTS, ...PDF_EXTS];

export function isSupported(fileName: string): boolean {
  const lower = fileName.toLowerCase();
  return SUPPORTED_EXTS.some((ext) => lower.endsWith(ext));
}

type TesseractWorker = import("tesseract.js").Worker;

let workerPromise: Promise<TesseractWorker> | null = null;

async function getTesseractWorker(): Promise<TesseractWorker> {
  if (!workerPromise) {
    workerPromise = (async () => {
      const { createWorker, PSM } = await import("tesseract.js");
      const worker = await createWorker("por+eng");
      // psm 6 funciona bem para documentos (mesmo ajuste da versão desktop).
      await worker.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_BLOCK });
      return worker;
    })().catch((err) => {
      workerPromise = null;
      throw err;
    });
  }
  return workerPromise;
}

// Pré-processamento equivalente ao da versão desktop:
// escala de cinza + autocontraste + contraste 1.6 + ampliação até 1800px.
function preprocess(source: ImageBitmap | HTMLCanvasElement): HTMLCanvasElement {
  const maxDim = Math.max(source.width, source.height);
  const scale = maxDim < 1800 ? 1800 / maxDim : 1;
  const w = Math.round(source.width * scale);
  const h = Math.round(source.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(source, 0, 0, w, h);

  const imageData = ctx.getImageData(0, 0, w, h);
  const d = imageData.data;
  const gray = new Uint8ClampedArray(w * h);
  let min = 255;
  let max = 0;
  for (let i = 0, j = 0; i < d.length; i += 4, j++) {
    const g = Math.round(0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]);
    gray[j] = g;
    if (g < min) min = g;
    if (g > max) max = g;
  }
  const range = Math.max(1, max - min);
  for (let i = 0, j = 0; i < d.length; i += 4, j++) {
    let v = ((gray[j] - min) / range) * 255;
    v = (v - 128) * 1.6 + 128;
    v = v < 0 ? 0 : v > 255 ? 255 : v;
    d[i] = d[i + 1] = d[i + 2] = v;
    d[i + 3] = 255;
  }
  ctx.putImageData(imageData, 0, 0);
  return canvas;
}

async function ocrCanvasSource(source: ImageBitmap | HTMLCanvasElement): Promise<string> {
  const worker = await getTesseractWorker();
  const canvas = preprocess(source);
  const { data } = await worker.recognize(canvas);
  return data.text;
}

async function ocrImageFile(file: File): Promise<string> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error("Não foi possível decodificar a imagem.");
  }
  try {
    return await ocrCanvasSource(bitmap);
  } finally {
    bitmap.close();
  }
}

async function extractPdfText(file: File, maxPages = 2): Promise<string> {
  const pdfjs = await import("pdfjs-dist");
  if (!pdfjs.GlobalWorkerOptions.workerSrc) {
    pdfjs.GlobalWorkerOptions.workerSrc = new URL(
      "pdfjs-dist/build/pdf.worker.min.mjs",
      import.meta.url
    ).toString();
  }

  const buf = await file.arrayBuffer();
  const loadingTask = pdfjs.getDocument({ data: buf });
  const doc = await loadingTask.promise;
  try {
    const texts: string[] = [];
    const pages = Math.min(maxPages, doc.numPages);
    for (let i = 1; i <= pages; i++) {
      const page = await doc.getPage(i);

      // Primeiro tenta o texto nativo do PDF.
      const content = await page.getTextContent();
      const native = content.items
        .map((item) => ("str" in item ? item.str + (item.hasEOL ? "\n" : " ") : ""))
        .join("");
      if (cleanSpaces(native).length > 80) {
        texts.push(native);
        continue;
      }

      // PDF escaneado: renderiza a página e faz OCR.
      const viewport = page.getViewport({ scale: 2.2 });
      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const ctx = canvas.getContext("2d")!;
      await page.render({ canvas, canvasContext: ctx, viewport }).promise;
      texts.push(await ocrCanvasSource(canvas));
    }
    return texts.join("\n");
  } finally {
    await loadingTask.destroy();
  }
}

export async function readDocument(file: File): Promise<string> {
  const lower = file.name.toLowerCase();
  if (PDF_EXTS.some((ext) => lower.endsWith(ext))) {
    return extractPdfText(file);
  }
  return ocrImageFile(file);
}
