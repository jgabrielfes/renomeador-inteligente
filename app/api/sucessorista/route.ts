// POST /api/sucessorista — proxy autenticado para a leitura do cofre do
// Sucessorista. Recebe os arquivos da pasta do caso (multipart, chave "item"
// repetida) e devolve { caso: CasoExtraido } com os campos da folha de
// trabalho + a classificação de cada arquivo no catálogo do processo.
// Mesmo desenho do /api/rename: a chave do Gemini fica em GEMINI_API_KEY,
// só no servidor; sem sessão a rota nem lê o corpo (401).

import { GeminiError } from "@/lib/gemini";
import {
  extrairCasoDoCofre,
  redigirHonorarios,
  type ArquivoCofre,
  type EntradaRedacaoHonorarios,
} from "@/lib/gemini-sucessorista";
import { analisarMatriculas } from "@/lib/gemini-matricula";
import { auth } from "@/lib/auth";
import { registrarErro } from "@/lib/error-log";

// Um lote com vários PDFs pode levar mais que os 10s padrão da Vercel.
export const maxDuration = 60;

// Margem sob o limite de corpo das funções serverless (Vercel: ~4,5 MB).
const MAX_TOTAL_BYTES = 4.3 * 1024 * 1024;
const MAX_ITEMS = 10;

export async function POST(request: Request) {
  const session = await auth();
  if (!session) {
    return Response.json({ error: "Não autenticado." }, { status: 401 });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return Response.json(
      { error: "GEMINI_API_KEY não configurada no servidor." },
      { status: 503 }
    );
  }

  // Corpo JSON = redação de honorários (proposta/contrato); multipart = leitura
  // do cofre. Nos dois casos a chave do Gemini fica só aqui no servidor.
  if (request.headers.get("content-type")?.includes("application/json")) {
    let corpo: Record<string, unknown>;
    try {
      corpo = (await request.json()) as Record<string, unknown>;
    } catch {
      return Response.json({ error: "JSON inválido." }, { status: 400 });
    }
    const tipo =
      corpo.tipo === "CONTRATO" ||
      corpo.tipo === "PROPOSTA" ||
      corpo.tipo === "PETICAO_JUDICIAL" ||
      corpo.tipo === "CLAUSULAS"
        ? corpo.tipo
        : null;
    const contexto = typeof corpo.contexto === "string" ? corpo.contexto.trim().slice(0, 20_000) : "";
    const modelo =
      typeof corpo.modeloEscritorio === "string" && corpo.modeloEscritorio.trim()
        ? corpo.modeloEscritorio.trim().slice(0, 40_000)
        : null;
    const instrucoes =
      typeof corpo.instrucoes === "string" && corpo.instrucoes.trim()
        ? corpo.instrucoes.trim().slice(0, 4_000)
        : null;
    if (!tipo || !contexto) {
      return Response.json(
        { error: "Informe tipo (PROPOSTA|CONTRATO|PETICAO_JUDICIAL|CLAUSULAS) e contexto." },
        { status: 400 }
      );
    }
    const entrada: EntradaRedacaoHonorarios = { tipo, contexto, modeloEscritorio: modelo, instrucoes };
    try {
      const secoes = await redigirHonorarios(apiKey, entrada);
      return Response.json({ secoes });
    } catch (err) {
      if (err instanceof GeminiError) {
        await registrarErro({
          origem: "api/sucessorista",
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
      await registrarErro({ origem: "api/sucessorista", mensagem, status: 500 });
      return Response.json({ error: mensagem }, { status: 500 });
    }
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

  const arquivos: ArquivoCofre[] = [];
  let totalBytes = 0;
  for (const [key, value] of form.entries()) {
    if (key !== "item" || !(value instanceof File)) continue;
    totalBytes += value.size;
    arquivos.push({ fileName: value.name, data: await value.arrayBuffer() });
  }

  if (arquivos.length === 0) {
    return Response.json({ error: "Envie ao menos um arquivo." }, { status: 400 });
  }
  if (arquivos.length > MAX_ITEMS) {
    return Response.json(
      { error: `Máximo de ${MAX_ITEMS} arquivos por leitura.` },
      { status: 400 }
    );
  }
  if (totalBytes > MAX_TOTAL_BYTES) {
    return Response.json(
      { error: "Lote grande demais — envie menos arquivos por vez." },
      { status: 413 }
    );
  }

  try {
    // Campo "tipo" do multipart: MATRICULA = Analisador de Matrícula (item
    // IX) — relatório de situação dominial; sem o campo, leitura do cofre.
    if (form.get("tipo") === "MATRICULA") {
      const matriculas = await analisarMatriculas(apiKey, arquivos);
      return Response.json({ matriculas });
    }
    const caso = await extrairCasoDoCofre(apiKey, arquivos);
    return Response.json({ caso });
  } catch (err) {
    if (err instanceof GeminiError) {
      await registrarErro({
        origem: "api/sucessorista",
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
    await registrarErro({ origem: "api/sucessorista", mensagem, status: 500 });
    return Response.json({ error: mensagem }, { status: 500 });
  }
}
