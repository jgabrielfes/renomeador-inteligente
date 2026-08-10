// POST /api/notas — redação assistida das peças do resolvedor de notas.
// Recebe { peca, contexto } e devolve { campos } com o conteúdo sugerido para
// os campos variáveis da peça. A chave fica em GEMINI_API_KEY, só no servidor.
// Os templates .docx nunca passam por aqui — a IA só redige campos.

import {
  GeminiError,
} from "@/lib/gemini";
import { registrarErro } from "@/lib/error-log";
import {
  geminiRedigirPeca,
  pecaIaValida,
  type ContextoPeca,
} from "@/lib/gemini-notas";

export const maxDuration = 60;

const MAX_BODY = 64 * 1024;

export async function POST(request: Request) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return Response.json(
      { error: "GEMINI_API_KEY não configurada no servidor." },
      { status: 503 }
    );
  }

  let body: unknown;
  try {
    const raw = await request.text();
    if (raw.length > MAX_BODY) {
      return Response.json(
        { error: "Contexto grande demais." },
        { status: 413 }
      );
    }
    body = JSON.parse(raw);
  } catch {
    return Response.json(
      { error: "Corpo inválido: esperado JSON." },
      { status: 400 }
    );
  }

  const { peca, contexto } = (body ?? {}) as {
    peca?: unknown;
    contexto?: ContextoPeca;
  };
  if (!pecaIaValida(peca)) {
    return Response.json(
      { error: "peca deve ser ata, requerimento ou rerratificacao." },
      { status: 400 }
    );
  }
  if (!contexto || typeof contexto.exigencia !== "string" || !contexto.exigencia.trim()) {
    return Response.json(
      { error: "contexto.exigencia é obrigatório." },
      { status: 400 }
    );
  }

  try {
    const campos = await geminiRedigirPeca(apiKey, peca, contexto);
    return Response.json({ campos });
  } catch (err) {
    if (err instanceof GeminiError) {
      await registrarErro({
        origem: "api/notas",
        mensagem: err.message,
        status: err.status,
      });
      return Response.json(
        {
          error: err.message,
          geminiStatus: err.status,
          retryDelaySeconds: err.retryDelaySeconds ?? null,
          dailyQuota: err.dailyQuota,
        },
        { status: 502 }
      );
    }
    const mensagem = err instanceof Error ? err.message : String(err);
    await registrarErro({ origem: "api/notas", mensagem, status: 500 });
    return Response.json({ error: mensagem }, { status: 500 });
  }
}
