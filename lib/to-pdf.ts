// Conversão de imagens (JPG, PNG, WEBP, BMP) em PDF, para montar um processo
// em que todas as peças são PDF.
//
// Duas decisões que valem explicação:
//
// 1) Quando o arquivo JÁ é JPEG ou PNG, os bytes originais são embutidos como
//    estão. Recodificar seria perda de qualidade gratuita — o PDF é só um
//    invólucro. Só formatos que o PDF não suporta (WEBP, BMP) passam pelo
//    canvas, e aí viram JPEG.
// 2) A página é A4, na orientação da imagem, com a imagem encaixada
//    preservando a proporção. Um processo é feito para ser impresso e
//    paginado; página do tamanho exato de cada foto daria um documento com
//    folhas de tamanhos diferentes.

import { IMAGE_EXTS } from "./ocr";
import { getExtension } from "./renamer";

// A4 em pontos (72 dpi), a unidade do PDF.
const A4_LARGURA = 595.28;
const A4_ALTURA = 841.89;

export function isImageFile(fileName: string): boolean {
  const lower = fileName.toLowerCase();
  return IMAGE_EXTS.some((ext) => lower.endsWith(ext));
}

/** Troca a extensão do arquivo por .pdf. */
export function pdfNameFor(fileName: string): string {
  const ext = getExtension(fileName);
  return ext ? `${fileName.slice(0, -ext.length)}.pdf` : `${fileName}.pdf`;
}

async function recodeToJpeg(file: File): Promise<ArrayBuffer> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error("Não foi possível decodificar a imagem.");
  }
  try {
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext("2d")!;
    // Imagens com transparência (PNG/WEBP) ficariam pretas sem o fundo branco.
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.92)
    );
    if (!blob) throw new Error("Não foi possível converter a imagem.");
    return blob.arrayBuffer();
  } finally {
    bitmap.close();
  }
}

/** Gera um PDF de uma página com a imagem. Nunca altera o arquivo original. */
export async function imageFileToPdfBlob(file: File): Promise<Blob> {
  const { PDFDocument, rgb } = await import("pdf-lib");
  const doc = await PDFDocument.create();
  const lower = file.name.toLowerCase();
  const bytes = await file.arrayBuffer();

  let image: Awaited<ReturnType<typeof doc.embedJpg>> | undefined;
  try {
    if (file.type === "image/jpeg" || /\.jpe?g$/.test(lower)) {
      image = await doc.embedJpg(bytes);
    } else if (file.type === "image/png" || lower.endsWith(".png")) {
      image = await doc.embedPng(bytes);
    }
  } catch {
    // JPEG progressivo/CMYK e PNG fora do padrão fazem o embed direto falhar;
    // o recode abaixo normaliza e resolve.
    image = undefined;
  }
  if (!image) image = await doc.embedJpg(await recodeToJpeg(file));

  const paisagem = image.width > image.height;
  const pageW = paisagem ? A4_ALTURA : A4_LARGURA;
  const pageH = paisagem ? A4_LARGURA : A4_ALTURA;
  const page = doc.addPage([pageW, pageH]);
  page.drawRectangle({
    x: 0,
    y: 0,
    width: pageW,
    height: pageH,
    color: rgb(1, 1, 1),
  });

  const escala = Math.min(pageW / image.width, pageH / image.height);
  const w = image.width * escala;
  const h = image.height * escala;
  page.drawImage(image, {
    x: (pageW - w) / 2,
    y: (pageH - h) / 2,
    width: w,
    height: h,
  });

  const saved = await doc.save();
  return new Blob([saved as BlobPart], { type: "application/pdf" });
}
