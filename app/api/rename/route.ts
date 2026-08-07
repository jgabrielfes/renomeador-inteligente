// POST /api/rename — proxy autenticado para o Gemini. Recebe um LOTE de
// documentos (arquivos e/ou textos de OCR) numa única chamada e devolve
// { results: [{ name, docType } | null] } alinhado à ordem de envio, no padrão
// "{Tipo} - {Nome}.{ext}". A chave fica em GEMINI_API_KEY, só no servidor.
//
// O corpo usa a chave repetida "item" (File ou JSON {fileName, text}) — a
// ordem das partes do multipart é preservada, então o índice do resultado
// corresponde ao índice do item enviado.

import { GeminiError, geminiProposeBatch, type BatchItem } from "@/lib/gemini";

// Um lote com vários PDFs pode levar mais que os 10s padrão da Vercel.
export const maxDuration = 60;

// Margem sob o limite de corpo das funções serverless (Vercel: ~4,5 MB).
const MAX_TOTAL_BYTES = 4.3 * 1024 * 1024;
const MAX_ITEMS = 10;

export async function POST(request: Request) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return Response.json(
      { error: "GEMINI_API_KEY não configurada no servidor." },
      { status: 503 }
    );
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return Response.json(
      { error: "Corpo inválido: esperado multipart/form-data." },
      { status: 400 }
    );
  }

  const items: BatchItem[] = [];
  let totalBytes = 0;
  for (const [key, value] of form.entries()) {
    if (key !== "item") continue;
    if (value instanceof File) {
      totalBytes += value.size;
      items.push({ fileName: value.name, data: await value.arrayBuffer() });
    } else {
      try {
        const parsed = JSON.parse(value);
        if (typeof parsed?.fileName !== "string" || typeof parsed?.text !== "string") {
          throw new Error();
        }
        items.push({ fileName: parsed.fileName, text: parsed.text });
      } catch {
        return Response.json(
          { error: "Item de texto inválido: esperado JSON {fileName, text}." },
          { status: 400 }
        );
      }
    }
  }

  if (items.length === 0) {
    return Response.json(
      { error: "Envie ao menos um item (arquivo ou texto)." },
      { status: 400 }
    );
  }
  if (items.length > MAX_ITEMS) {
    return Response.json(
      { error: `Máximo de ${MAX_ITEMS} itens por lote.` },
      { status: 400 }
    );
  }
  if (totalBytes > MAX_TOTAL_BYTES) {
    return Response.json(
      { error: "Lote grande demais — reduza o tamanho total dos arquivos." },
      { status: 413 }
    );
  }

  try {
    const results = await geminiProposeBatch(apiKey, items);
    return Response.json({ results });
  } catch (err) {
    if (err instanceof GeminiError) {
      // 429 (cota) e demais erros do Gemini viram 502; o cliente decide o fallback.
      return Response.json({ error: err.message }, { status: 502 });
    }
    return Response.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
