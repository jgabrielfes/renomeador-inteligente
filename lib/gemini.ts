// Lado servidor da integração com o Gemini. A chave (GEMINI_API_KEY) nunca
// chega ao navegador — só a rota /api/rename usa este módulo.

import { getExtension, normalize, safeFilename, titleCaseName } from "./renamer";

// As cotas do free tier são POR MODELO — quando a de um estoura (429), o
// próximo da cadeia ainda tem saldo próprio. O flash-lite vem primeiro porque
// tem cota diária muito maior (o flash-latest dá só ~20 requisições/dia) e é
// mais que suficiente para "leia o documento e devolva tipo + nome".
// Os aliases "-latest" evitam 404 quando a Google aposenta um modelo.
// GEMINI_MODEL (env) troca o modelo principal, mantendo os demais de reserva.
const DEFAULT_MODEL_CHAIN = ["gemini-flash-lite-latest", "gemini-flash-latest"];
const primaryModel = process.env.GEMINI_MODEL;
export const GEMINI_MODELS = primaryModel
  ? [primaryModel, ...DEFAULT_MODEL_CHAIN.filter((m) => m !== primaryModel)]
  : DEFAULT_MODEL_CHAIN;

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

// Regras e correções do escritório (enviadas pelo cliente) que calibram a
// nomeação — o "ensinar a IA" é few-shot: as lições entram em todo prompt.
export interface Lessons {
  rules?: string;
  corrections?: Array<{ tipo: string; sugerido: string; corrigido: string }>;
}

function lessonsSection(lessons: Lessons | undefined): string {
  if (!lessons) return "";
  const parts: string[] = [];
  const rules = lessons.rules?.trim().slice(0, 2000);
  if (rules) {
    parts.push(
      `\n\nREGRAS DESTE ESCRITÓRIO (prioridade máxima — sobrepõem as instruções gerais acima, exceto o formato JSON):\n${rules}`
    );
  }
  const corrections = (lessons.corrections ?? []).slice(0, 20);
  if (corrections.length > 0) {
    parts.push(
      `\n\nCORREÇÕES ANTERIORES DO USUÁRIO (aplique o mesmo padrão a documentos semelhantes):\n` +
        corrections
          .map(
            (c) =>
              `- Sugerido "${c.sugerido.slice(0, 120)}" → corrigido para "${c.corrigido.slice(0, 120)}"${c.tipo ? ` (tipo: ${c.tipo.slice(0, 60)})` : ""}`
          )
          .join("\n")
    );
  }
  return parts.join("");
}

// Vários documentos vão numa única chamada (lote), cada um precedido por um
// marcador "DOCUMENTO <índice>". A resposta é um array com o índice de volta —
// mapeamento garantido mesmo com nomes de arquivo repetidos.
function batchPrompt(count: number, lessons?: Lessons): string {
  return `Acima estão ${count} documento(s) brasileiro(s), típicos de um escritório de advocacia imobiliária (certidões, matrículas, guias, contratos, escrituras, documentos pessoais etc.), cada um precedido pelo marcador "DOCUMENTO <índice>: <nome do arquivo original>".

Para CADA documento, gere um item no array JSON de resposta:
- "indice": o número do marcador do documento (1 a ${count}).
- "tipo": o tipo ESPECÍFICO do documento, curto e capitalizado. Prefira sempre o tipo do documento ao órgão emissor: uma certidão da prefeitura sobre débitos de imóvel é "Certidão Negativa de Tributos Imobiliários", não "Certidão Prefeitura". Tipos frequentes neste contexto: "Certidão de Matrícula", "Certidão Vintenária", "Certidão Negativa de Tributos Imobiliários", "Certidão de Valor Venal", "Certidão de Dados Cadastrais (IPTU)", "Certidão Negativa de Débitos Condominiais", "Certidão de Ônus e Ações", "CND Federal", "Certidão Negativa de Débitos Trabalhistas", "Certidão de Distribuição Cível", "Certidão de Protesto", "Certidão de Casamento", "Certidão de Nascimento", "Certidão de Óbito", "Guia de ITBI", "Comprovante de Pagamento", "Comprovante de Residência", "Habite-se", "Escritura de Venda e Compra", "Contrato de Compromisso de Compra e Venda", "Contrato de Locação", "Termo de Quitação", "Procuração", "Matrícula de Imóvel", "IPTU", "RG", "CNH", "CPF". A lista não é fechada — use o tipo específico correto mesmo que não esteja nela. Se não reconhecer, use "Documento".
- "nome": nome completo da pessoa principal do documento, em Formato de Título (ex.: "João da Silva"). Em contratos, a parte pessoa física (não a empresa). Em certidão de casamento, os dois cônjuges separados por " e ". Em certidões sobre imóvel sem pessoa identificável, use null.
- "identificador": número identificador relevante quando existir — nº da matrícula (Certidão de Matrícula / Matrícula de Imóvel), nº do contribuinte (IPTU / Valor Venal), nº do processo (Certidão de Distribuição), CPF formatado (documento pessoal sem nome legível). Senão, null.
- "cartorio": SOMENTE para documentos emitidos pelo Registro de Imóveis (Matrícula de Imóvel, Certidão de Matrícula, Certidão Vintenária, Certidão de Ônus e Ações e certidões de propriedade): o cartório emissor em forma CURTA, "Nº RI de Cidade-UF" (ex.: "1º RI de Guarulhos-SP"; cartório único, sem ordinal: "RI de Bilac-SP"). Para qualquer outro documento, null.

Regras:
- O array deve ter exatamente ${count} item(ns), um por documento, sem repetir índices.
- Analise cada documento de forma independente.
- Nunca invente dados que não estejam legíveis no documento.
- Não inclua rótulos, títulos de seção ou nomes de órgãos como se fossem nome de pessoa.${lessonsSection(lessons)}`;
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
      cartorio: { type: "STRING", nullable: true },
    },
    required: ["indice", "tipo"],
  },
} as const;

interface AiAnswer {
  indice?: number;
  tipo: string;
  nome?: string | null;
  identificador?: string | null;
  cartorio?: string | null;
}

export class GeminiError extends Error {
  constructor(
    message: string,
    public status: number,
    // Extraídos do corpo do 429: quanto esperar e se a cota é a DIÁRIA
    // (aí não adianta esperar — só modo local até o reset, à meia-noite PT).
    public retryDelaySeconds?: number,
    public dailyQuota = false
  ) {
    super(message);
  }
}

async function fetchGeminiJson(
  apiKey: string,
  model: string,
  parts: Array<Record<string, unknown>>,
  responseSchema: unknown,
  temperature: number
): Promise<unknown> {
  const res = await fetch(
    `${API_BASE}/v1beta/models/${model}:generateContent`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify({
        contents: [{ parts }],
        generationConfig: {
          temperature,
          responseMimeType: "application/json",
          responseSchema,
        },
      }),
    }
  );
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    let retryDelaySeconds: number | undefined;
    let dailyQuota = false;
    try {
      const parsed = JSON.parse(detail);
      for (const det of parsed?.error?.details ?? []) {
        if (typeof det?.retryDelay === "string") {
          retryDelaySeconds = parseFloat(det.retryDelay) || undefined;
        }
        for (const violation of det?.violations ?? []) {
          if (/perday/i.test(violation?.quotaId ?? "")) dailyQuota = true;
        }
      }
    } catch {
      // corpo não-JSON: segue só com o status
    }
    throw new GeminiError(
      `Gemini HTTP ${res.status} (${model})${detail ? `: ${detail.slice(0, 200)}` : ""}`,
      res.status,
      retryDelaySeconds,
      dailyQuota
    );
  }
  const payload = await res.json();
  const text: string | undefined =
    payload?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new GeminiError("Resposta do Gemini sem conteúdo.", 502);
  return JSON.parse(text);
}

// Chamada genérica com a cadeia de modelos: 429 (cota daquele modelo) ou 404
// (modelo aposentado) e 503 (sobrecarregado, após retentativa curta) passam
// para o próximo; outros erros interrompem na hora.
// Compartilhada entre o renomeador e o resolvedor de notas.
export async function geminiJson(
  apiKey: string,
  parts: Array<Record<string, unknown>>,
  responseSchema: unknown,
  temperature = 0
): Promise<unknown> {
  const failures: GeminiError[] = [];
  for (const model of GEMINI_MODELS) {
    try {
      return await fetchGeminiJson(
        apiKey,
        model,
        parts,
        responseSchema,
        temperature
      );
    } catch (err) {
      if (!(err instanceof GeminiError)) throw err;
      // 503 = "pico temporário de demanda" (mensagem da própria Google):
      // UMA retentativa curta no MESMO modelo antes de cair para o reserva —
      // o pico costuma passar em segundos, e o modelo reserva tem cota bem
      // menor (não vale queimá-la de primeira).
      if (err.status === 503) {
        await new Promise((resolve) => setTimeout(resolve, 1500));
        try {
          return await fetchGeminiJson(
            apiKey,
            model,
            parts,
            responseSchema,
            temperature
          );
        } catch (retryErr) {
          if (!(retryErr instanceof GeminiError)) throw retryErr;
          failures.push(retryErr);
          continue;
        }
      }
      if (err.status === 429 || err.status === 404) {
        failures.push(err);
        continue;
      }
      throw err;
    }
  }
  // Prefere um erro recuperável (cota por minuto): o cliente pode esperar e
  // tentar de novo. "Cota diária" só quando TODOS os modelos esgotaram a sua.
  const recoverable = failures.find((f) => !f.dailyQuota);
  throw (
    recoverable ??
    failures.at(-1) ??
    new GeminiError("Nenhum modelo disponível.", 502)
  );
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
  const cartorio = answer.cartorio?.trim()
    ? safeFilename(answer.cartorio.trim()).slice(0, 60)
    : null;
  // Documento do Registro de Imóveis: nome = nº da matrícula + cartório
  // emissor (a matrícula só identifica o imóvel dentro de um cartório).
  const ehRegistroDeImovel = /MATRICULA|VINTENARIA|\bONUS\b|PROPRIEDADE|INTEIRO TEOR/.test(
    normalize(tipo)
  );

  let base: string;
  if (ehRegistroDeImovel && id) {
    base = /MATRICULA/.test(normalize(tipo))
      ? `${tipo === "Matrícula de Imóvel" ? "Matrícula" : tipo} ${id}`
      : `${tipo} - Matrícula ${id}`;
    if (cartorio) base += ` - ${cartorio}`;
  } else if (nome) base = `${tipo} - ${nome}`;
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
  items: BatchItem[],
  lessons?: Lessons
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
  parts.push({ text: batchPrompt(items.length, lessons) });

  const parsed = await geminiJson(apiKey, parts, RESPONSE_SCHEMA);
  if (!Array.isArray(parsed)) {
    throw new GeminiError("Resposta do Gemini fora do formato esperado.", 502);
  }
  const answers = parsed as AiAnswer[];

  return items.map((item, i) => {
    const answer = answers.find((a) => a.indice === i + 1);
    return answer ? assembleProposal(item.fileName, answer) : null;
  });
}
