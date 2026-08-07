// Lado servidor da integração com o Gemini. A chave (GEMINI_API_KEY) nunca
// chega ao navegador — só a rota /api/rename usa este módulo.

import { getExtension, safeFilename, titleCaseName } from "./renamer";

// "gemini-flash-latest" é um alias mantido pela Google apontando para o Flash
// estável mais recente — evita 404 quando um modelo específico é aposentado
// (o gemini-2.5-flash, por exemplo, não aceita mais usuários novos).
export const GEMINI_MODEL = process.env.GEMINI_MODEL ?? "gemini-flash-latest";

// GEMINI_API_BASE permite apontar para um proxy (ou mock em testes).
const API_BASE =
  process.env.GEMINI_API_BASE ?? "https://generativelanguage.googleapis.com";

// Tipos aceitos pelo Gemini como inline_data.
export const AI_MIME_TYPES: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".pdf": "application/pdf",
};

// Vários documentos vão numa única chamada (lote), cada um precedido por um
// marcador "DOCUMENTO <índice>". A resposta é um array com o índice de volta —
// mapeamento garantido mesmo com nomes de arquivo repetidos.
function batchPrompt(count: number): string {
  return `Acima estão ${count} documento(s) brasileiro(s) (RG, CNH, CPF, passaporte, certidões de nascimento/casamento/óbito, comprovante de residência, matrícula de imóvel, IPTU, ITBI, escritura, procuração, contratos etc.), cada um precedido pelo marcador "DOCUMENTO <índice>: <nome do arquivo original>".

Para CADA documento, gere um item no array JSON de resposta:
- "indice": o número do marcador do documento (1 a ${count}).
- "tipo": tipo do documento, curto e capitalizado. Exemplos: "CNH", "RG", "CPF", "Certidão de Casamento", "Contrato de Compra e Venda", "Contrato de Locação", "Matrícula de Imóvel", "IPTU", "Procuração", "Comprovante de Residência". Se não reconhecer o tipo, use "Documento".
- "nome": nome completo da pessoa principal do documento, em Formato de Título (ex.: "João da Silva"). No caso de contratos, a parte pessoa física (não a empresa). Em certidão de casamento, os dois cônjuges separados por " e ". Se nenhum nome legível, use null.
- "identificador": número identificador relevante quando existir — nº da matrícula (para Matrícula de Imóvel), CPF formatado (para documentos pessoais sem nome legível). Senão, null.

Regras:
- O array deve ter exatamente ${count} item(ns), um por documento, sem repetir índices.
- Analise cada documento de forma independente.
- Nunca invente dados que não estejam legíveis no documento.
- Não inclua rótulos, títulos de seção ou nomes de órgãos como se fossem nome de pessoa.`;
}

const RESPONSE_SCHEMA = {
  type: "ARRAY",
  items: {
    type: "OBJECT",
    properties: {
      indice: { type: "INTEGER" },
      tipo: { type: "STRING" },
      nome: { type: "STRING", nullable: true },
      identificador: { type: "STRING", nullable: true },
    },
    required: ["indice", "tipo"],
  },
} as const;

interface AiAnswer {
  indice?: number;
  tipo: string;
  nome?: string | null;
  identificador?: string | null;
}

export class GeminiError extends Error {
  constructor(
    message: string,
    public status: number
  ) {
    super(message);
  }
}

async function callGemini(
  apiKey: string,
  parts: Array<Record<string, unknown>>
): Promise<AiAnswer[]> {
  const res = await fetch(
    `${API_BASE}/v1beta/models/${GEMINI_MODEL}:generateContent`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify({
        contents: [{ parts }],
        generationConfig: {
          temperature: 0,
          responseMimeType: "application/json",
          responseSchema: RESPONSE_SCHEMA,
        },
      }),
    }
  );
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new GeminiError(
      `Gemini HTTP ${res.status}${detail ? `: ${detail.slice(0, 200)}` : ""}`,
      res.status
    );
  }
  const payload = await res.json();
  const text: string | undefined =
    payload?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new GeminiError("Resposta do Gemini sem conteúdo.", 502);
  const parsed = JSON.parse(text);
  if (!Array.isArray(parsed)) {
    throw new GeminiError("Resposta do Gemini fora do formato esperado.", 502);
  }
  return parsed as AiAnswer[];
}

// Monta o nome final no padrão "{Tipo} - {Nome}.{ext}" a partir da resposta.
function assembleProposal(
  fileName: string,
  answer: AiAnswer
): { name: string; docType: string } {
  const ext = getExtension(fileName);
  const tipo = safeFilename(answer.tipo || "Documento").slice(0, 60);
  const nome = answer.nome ? titleCaseName(answer.nome) : null;
  const id = answer.identificador?.trim() || null;

  let base: string;
  if (tipo === "Matrícula de Imóvel" && id) base = `Matrícula ${id}`;
  else if (nome) base = `${tipo} - ${nome}`;
  else if (id) base = `${tipo} - ${id}`;
  else if (tipo !== "Documento") base = tipo;
  else base = ext ? fileName.slice(0, -ext.length) : fileName;

  return { name: safeFilename(base) + ext, docType: tipo };
}

export interface BatchItem {
  fileName: string;
  // Um dos dois: o arquivo em si (modo "arquivo") ou o texto do OCR local.
  data?: ArrayBuffer;
  text?: string;
}

// Analisa um lote de documentos numa única chamada ao Gemini. Devolve um array
// alinhado à ordem de entrada; null quando o modelo não respondeu aquele item
// (o cliente cai no fallback local só para ele).
export async function geminiProposeBatch(
  apiKey: string,
  items: BatchItem[]
): Promise<Array<{ name: string; docType: string } | null>> {
  const parts: Array<Record<string, unknown>> = [];
  items.forEach((item, i) => {
    parts.push({ text: `DOCUMENTO ${i + 1}: ${item.fileName}` });
    if (item.data) {
      const mimeType = AI_MIME_TYPES[getExtension(item.fileName)];
      if (!mimeType) {
        throw new GeminiError(
          `Formato não suportado pela IA: ${item.fileName}`,
          415
        );
      }
      parts.push({
        inline_data: {
          mime_type: mimeType,
          data: Buffer.from(item.data).toString("base64"),
        },
      });
    } else {
      parts.push({
        text: `Texto extraído por OCR (pode conter erros):\n${(item.text ?? "").slice(0, 15000)}`,
      });
    }
  });
  parts.push({ text: batchPrompt(items.length) });

  const answers = await callGemini(apiKey, parts);
  return items.map((item, i) => {
    const answer = answers.find((a) => a.indice === i + 1);
    return answer ? assembleProposal(item.fileName, answer) : null;
  });
}
