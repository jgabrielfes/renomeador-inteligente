// Otimização de PDFs digitalizados: renderiza cada página, passa pelo mesmo
// pipeline de imagem das fotos (lib/image-enhance.ts) e remonta um PDF novo.
//
// A decisão central aqui é NÃO otimizar todo PDF. Um PDF digital — gerado por
// um sistema, com camada de texto real — já está perfeito: rasterizá-lo
// destruiria o texto pesquisável/selecionável, engordaria o arquivo e não
// melhoraria nada visualmente. Só PDFs que são fotos/digitalizações (sem texto
// nativo relevante) passam pelo pipeline; os demais são recusados com um aviso,
// em vez de silenciosamente piorados.

import { enhanceDocumentImage } from "./image-enhance";
import { loadPdfjs, meaningfulNativeText, pageNativeText } from "./ocr";

/** Recusa esperada (PDF digital, PDF grande demais): a UI mostra a mensagem. */
export class PdfEnhanceSkipped extends Error {}

// Além disso o custo cresce por página (render + pipeline + JPEG), então um
// PDF muito longo trava a aba do usuário sem entregar valor proporcional.
const MAX_PAGES = 30;

// Resolução de render. 200 dpi (2.78x sobre os 72 dpi do PDF) é o suficiente
// para OCR e leitura; acima disso o arquivo cresce sem ganho visível.
const RENDER_SCALE = 2.78;

export interface PdfEnhanceProgress {
  page: number;
  total: number;
}

/**
 * Diz se vale otimizar o PDF, inspecionando as primeiras páginas. Um único
 * texto nativo relevante já basta para classificar como digital — nesse caso
 * rasterizar seria uma perda.
 */
async function shouldEnhance(
  doc: import("pdfjs-dist").PDFDocumentProxy
): Promise<boolean> {
  const sample = Math.min(3, doc.numPages);
  for (let i = 1; i <= sample; i++) {
    const page = await doc.getPage(i);
    if (meaningfulNativeText(await pageNativeText(page))) return false;
  }
  return true;
}

function canvasToJpeg(canvas: HTMLCanvasElement, quality = 0.85): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) =>
        blob ? resolve(blob) : reject(new Error("Falha ao codificar a página.")),
      "image/jpeg",
      quality
    )
  );
}

/**
 * Gera a versão otimizada de um PDF digitalizado. Lança PdfEnhanceSkipped
 * quando o PDF não deve ser otimizado. Nunca modifica o arquivo original.
 */
export async function enhancePdfFileToBlob(
  file: File,
  onProgress?: (p: PdfEnhanceProgress) => void
): Promise<Blob> {
  const pdfjs = await loadPdfjs();
  const loadingTask = pdfjs.getDocument({ data: await file.arrayBuffer() });
  const doc = await loadingTask.promise;

  try {
    if (doc.numPages > MAX_PAGES) {
      throw new PdfEnhanceSkipped(
        `Este PDF tem ${doc.numPages} páginas (o limite da otimização é ${MAX_PAGES}).`
      );
    }
    if (!(await shouldEnhance(doc))) {
      throw new PdfEnhanceSkipped(
        "Este PDF já é digital: tem texto de verdade, não é uma foto. Otimizar transformaria o texto em imagem e o documento perderia qualidade."
      );
    }

    // pdf-lib só entra aqui — depois de decidido que há o que fazer.
    const { PDFDocument, rgb } = await import("pdf-lib");
    const out = await PDFDocument.create();

    for (let i = 1; i <= doc.numPages; i++) {
      onProgress?.({ page: i, total: doc.numPages });

      const page = await doc.getPage(i);
      const viewport = page.getViewport({ scale: RENDER_SCALE });
      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const ctx = canvas.getContext("2d")!;
      // Páginas de PDF podem ter fundo transparente; sem pintar de branco, o
      // pipeline receberia preto onde deveria haver papel.
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvas, canvasContext: ctx, viewport }).promise;

      // A página já é retangular e ocupa todo o quadro, então a detecção de
      // perspectiva normalmente não dispara — o ganho aqui vem da remoção de
      // sombra e dos níveis. A ampliação também não se aplica: a resolução
      // já foi escolhida no render acima.
      const { canvas: enhanced } = enhanceDocumentImage(canvas, {
        targetMaxDim: 1,
      });

      const jpeg = await out.embedJpg(
        await (await canvasToJpeg(enhanced)).arrayBuffer()
      );
      // Mantém o tamanho original da página em pontos, para o PDF otimizado
      // imprimir no mesmo papel que o original.
      const size = page.getViewport({ scale: 1 });
      const outPage = out.addPage([size.width, size.height]);

      // O enquadramento por perspectiva muda a proporção da imagem, então
      // esticá-la para preencher a página distorceria o documento (texto
      // espremido). Encaixa preservando a proporção e centraliza; o que sobra
      // é margem branca, como numa digitalização de verdade.
      outPage.drawRectangle({
        x: 0,
        y: 0,
        width: size.width,
        height: size.height,
        color: rgb(1, 1, 1),
      });
      const fit = Math.min(
        size.width / enhanced.width,
        size.height / enhanced.height
      );
      const drawW = enhanced.width * fit;
      const drawH = enhanced.height * fit;
      outPage.drawImage(jpeg, {
        x: (size.width - drawW) / 2,
        y: (size.height - drawH) / 2,
        width: drawW,
        height: drawH,
      });
    }

    const bytes = await out.save();
    return new Blob([bytes as BlobPart], { type: "application/pdf" });
  } finally {
    await loadingTask.destroy();
  }
}
