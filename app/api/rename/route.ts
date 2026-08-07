// POST /api/rename — proxy autenticado para o Gemini. O navegador envia o
// documento (ou o texto extraído por OCR) e recebe { name, docType } no padrão
// "{Tipo} - {Nome}.{ext}". A chave fica em GEMINI_API_KEY, só no servidor.

import {
  GeminiError,
  geminiProposeFromFile,
  geminiProposeFromText,
} from "@/lib/gemini";

// Margem sob o limite de corpo das funções serverless (Vercel: ~4,5 MB).
const MAX_FILE_BYTES = 4 * 1024 * 1024;

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

  const fileName = form.get("fileName");
  const file = form.get("file");
  const text = form.get("text");

  if (typeof fileName !== "string" || !fileName) {
    return Response.json({ error: "Campo fileName ausente." }, { status: 400 });
  }

  try {
    if (file instanceof File) {
      if (file.size > MAX_FILE_BYTES) {
        return Response.json(
          { error: "Arquivo grande demais — envie o texto extraído." },
          { status: 413 }
        );
      }
      const proposal = await geminiProposeFromFile(
        apiKey,
        fileName,
        await file.arrayBuffer()
      );
      return Response.json(proposal);
    }

    if (typeof text === "string" && text.trim()) {
      const proposal = await geminiProposeFromText(apiKey, fileName, text);
      return Response.json(proposal);
    }

    return Response.json(
      { error: "Envie o campo file ou o campo text." },
      { status: 400 }
    );
  } catch (err) {
    if (err instanceof GeminiError) {
      // 429 (cota) e 4xx/5xx do Gemini viram 502 para o cliente decidir o fallback.
      return Response.json({ error: err.message }, { status: 502 });
    }
    return Response.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
