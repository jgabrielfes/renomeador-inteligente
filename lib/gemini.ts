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

const PROMPT = `Você nomeia arquivos de documentos brasileiros (RG, CNH, CPF, passaporte, certidões de nascimento/casamento/óbito, comprovante de residência, matrícula de imóvel, IPTU, ITBI, escritura, procuração, contratos etc.).

Analise o documento e responda APENAS o JSON pedido:
- "tipo": tipo do documento, curto e capitalizado. Exemplos: "CNH", "RG", "CPF", "Certidão de Casamento", "Contrato de Compra e Venda", "Contrato de Locação", "Matrícula de Imóvel", "IPTU", "Procuração", "Comprovante de Residência". Se não reconhecer o tipo, use "Documento".
- "nome": nome completo da pessoa principal do documento, em Formato de Título (ex.: "João da Silva"). No caso de contratos, a parte pessoa física (não a empresa). Em certidão de casamento, os dois cônjuges separados por " e ". Se nenhum nome legível, use null.
- "identificador": número identificador relevante quando existir — nº da matrícula (para Matrícula de Imóvel), CPF formatado (para documentos pessoais sem nome legível). Senão, null.

Regras:
- Nunca invente dados que não estejam legíveis no documento.
- Não inclua rótulos, títulos de seção ou nomes de órgãos como se fossem nome de pessoa.`;

const RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    tipo: { type: "STRING" },
    nome: { type: "STRING", nullable: true },
    identificador: { type: "STRING", nullable: true },
  },
  required: ["tipo"],
} as const;

interface AiAnswer {
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
): Promise<AiAnswer> {
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
  return JSON.parse(text) as AiAnswer;
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

// Modo "arquivo": o Gemini recebe o documento em si (imagem ou PDF).
export async function geminiProposeFromFile(
  apiKey: string,
  fileName: string,
  data: ArrayBuffer
): Promise<{ name: string; docType: string }> {
  const mimeType = AI_MIME_TYPES[getExtension(fileName)];
  if (!mimeType) {
    throw new GeminiError("Formato de arquivo não suportado pela IA.", 415);
  }
  const answer = await callGemini(apiKey, [
    {
      inline_data: {
        mime_type: mimeType,
        data: Buffer.from(data).toString("base64"),
      },
    },
    { text: PROMPT },
  ]);
  return assembleProposal(fileName, answer);
}

// Modo "texto": recebe apenas o texto extraído pelo OCR local do navegador.
export async function geminiProposeFromText(
  apiKey: string,
  fileName: string,
  text: string
): Promise<{ name: string; docType: string }> {
  const answer = await callGemini(apiKey, [
    {
      text: `${PROMPT}\n\nTexto extraído do documento (via OCR, pode conter erros):\n\n${text.slice(0, 30000)}`,
    },
  ]);
  return assembleProposal(fileName, answer);
}
