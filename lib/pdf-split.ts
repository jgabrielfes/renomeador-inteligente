// Separação de um PDF que junta vários documentos (matrícula + RG + CNH +
// certidão…) em PDFs individuais, cada um já com o nome sugerido.
//
// O ponto difícil não é fatiar o PDF — é descobrir ONDE um documento termina e
// o outro começa. A regra está em `groupPages` abaixo.

import {
  aiProposeBatch,
  AI_BATCH_MAX_ITEMS,
  getAiSettingsSnapshot,
  type AiLessons,
  type AiProposal,
} from "./ai";
import { loadPdfjs, readPdfPageTexts } from "./ocr";
import { ensureExtension, proposeName, uniqueName } from "./renamer";

/** Um documento identificado dentro do PDF, com o intervalo de páginas que ocupa. */
export interface PdfSegment {
  /** 1-based, inclusivo. */
  startPage: number;
  endPage: number;
  docType: string;
  name: string;
  source: "ia" | "local";
}

/** Acima disso a análise (OCR por página) demora demais para ser útil na tela. */
export const SPLIT_MAX_PAGES = 40;

export class PdfSplitError extends Error {}

/**
 * Agrupa páginas em documentos.
 *
 * A regra que faz isto funcionar na prática: uma página só ABRE um documento
 * novo quando ela própria se identifica (tipo reconhecido) E essa identidade
 * difere da do documento corrente. Páginas sem tipo reconhecido — o verso de um
 * RG, a segunda folha de uma matrícula, a continuação de um contrato — são
 * tratadas como CONTINUAÇÃO, não como documento novo. Sem isso, todo documento
 * de várias páginas seria estilhaçado.
 *
 * A identidade compara tipo + nome proposto: dois RGs seguidos, de pessoas
 * diferentes, viram dois documentos; duas páginas do RG da mesma pessoa, um só.
 */
function groupPages(proposals: Array<AiProposal & { source: "ia" | "local" }>): PdfSegment[] {
  const segments: PdfSegment[] = [];
  for (let i = 0; i < proposals.length; i++) {
    const p = proposals[i];
    const current = segments[segments.length - 1];
    const identified = p.docType && p.docType !== "Documento";

    if (!current) {
      segments.push({
        startPage: i + 1,
        endPage: i + 1,
        docType: p.docType,
        name: p.name,
        source: p.source,
      });
      continue;
    }

    const novoDocumento =
      identified && (p.docType !== current.docType || p.name !== current.name);

    if (novoDocumento) {
      segments.push({
        startPage: i + 1,
        endPage: i + 1,
        docType: p.docType,
        name: p.name,
        source: p.source,
      });
    } else {
      current.endPage = i + 1;
      // A primeira página do bloco costuma ser a folha de rosto, mas se ela não
      // se identificou e uma página seguinte se identificou, é essa que nomeia
      // o documento.
      if (identified && (!current.docType || current.docType === "Documento")) {
        current.docType = p.docType;
        current.name = p.name;
        current.source = p.source;
      }
    }
  }
  return segments;
}

/** Nomes finais, únicos entre si e com extensão .pdf. */
function dedupeNames(segments: PdfSegment[], originalName: string): PdfSegment[] {
  const used = new Set<string>();
  return segments.map((s) => {
    const name = uniqueName(used, ensureExtension(s.name.trim() || "Documento", originalName));
    used.add(name.toLowerCase());
    return { ...s, name };
  });
}

export interface SplitAnalysisProgress {
  stage: "lendo" | "classificando";
  page?: number;
  total?: number;
}

/**
 * Lê o PDF página a página e devolve os documentos encontrados. Não modifica
 * nada — só propõe; quem aplica é o chamador, depois da revisão do usuário.
 */
export async function analyzePdfSegments(
  file: File,
  lessons?: AiLessons,
  onProgress?: (p: SplitAnalysisProgress) => void
): Promise<PdfSegment[]> {
  const pdfjs = await loadPdfjs();
  const loadingTask = pdfjs.getDocument({ data: await file.arrayBuffer() });
  const numPages = await loadingTask.promise.then((d) => {
    const n = d.numPages;
    return loadingTask.destroy().then(() => n);
  });

  if (numPages < 2) {
    throw new PdfSplitError(
      "Este PDF tem uma página só — não há o que separar."
    );
  }
  if (numPages > SPLIT_MAX_PAGES) {
    throw new PdfSplitError(
      `Este PDF tem ${numPages} páginas (o limite da separação é ${SPLIT_MAX_PAGES}).`
    );
  }

  const texts = await readPdfPageTexts(file, SPLIT_MAX_PAGES, (page, total) =>
    onProgress?.({ stage: "lendo", page, total })
  );

  onProgress?.({ stage: "classificando" });

  // Cada página é classificada isoladamente, como se fosse um documento —
  // é isso que permite detectar a troca de documento entre páginas.
  const { mode } = getAiSettingsSnapshot();
  const local = () =>
    texts.map((text, i) => ({
      ...proposeName(`pagina-${i + 1}.pdf`, text),
      source: "local" as const,
    }));

  let proposals: Array<AiProposal & { source: "ia" | "local" }>;
  if (mode === "local") {
    proposals = local();
  } else {
    try {
      const results: Array<AiProposal | null> = [];
      for (let i = 0; i < texts.length; i += AI_BATCH_MAX_ITEMS) {
        const slice = texts.slice(i, i + AI_BATCH_MAX_ITEMS);
        results.push(
          ...(await aiProposeBatch(
            slice.map((text, j) => ({ fileName: `pagina-${i + j + 1}.pdf`, text })),
            lessons
          ))
        );
      }
      proposals = results.map((r, i) =>
        r
          ? { ...r, source: "ia" as const }
          : { ...proposeName(`pagina-${i + 1}.pdf`, texts[i]), source: "local" as const }
      );
    } catch {
      // Qualquer falha da IA (cota, rede) cai na análise local, como no resto
      // do app — separar o PDF é útil mesmo com nomes menos precisos.
      proposals = local();
    }
  }

  return dedupeNames(groupPages(proposals), file.name);
}

/**
 * Extrai os segmentos como PDFs independentes. Copia as páginas originais
 * (`copyPages`), então um PDF digital continua digital: o texto não vira imagem.
 */
export async function extractSegments(
  file: File,
  segments: PdfSegment[]
): Promise<Array<{ segment: PdfSegment; blob: Blob }>> {
  const { PDFDocument } = await import("pdf-lib");
  const bytes = await file.arrayBuffer();
  const src = await PDFDocument.load(bytes, { ignoreEncryption: true });

  const out: Array<{ segment: PdfSegment; blob: Blob }> = [];
  for (const segment of segments) {
    const doc = await PDFDocument.create();
    const indices = [];
    for (let p = segment.startPage; p <= segment.endPage; p++) indices.push(p - 1);
    const pages = await doc.copyPages(src, indices);
    for (const page of pages) doc.addPage(page);
    const saved = await doc.save();
    out.push({
      segment,
      blob: new Blob([saved as BlobPart], { type: "application/pdf" }),
    });
  }
  return out;
}
