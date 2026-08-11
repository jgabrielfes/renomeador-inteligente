// Leitura do cofre do Sucessorista: o Gemini lê os documentos da pasta do caso
// (certidão de óbito, certidão de casamento, RG/CPF, matrículas, extratos…) e
// devolve os campos da folha de trabalho já estruturados + a classificação de
// cada arquivo no catálogo do processo. Reusa a cadeia de modelos e o desenho
// de segurança do renomeador (lib/gemini.ts): a chave vive só no servidor e
// documento nenhum sai da máquina fora da rota interna /api/sucessorista.
//
// Regra de honestidade da extração: campo sem base clara no documento volta
// null — a folha continua em branco para o advogado preencher, nunca chutada.

import { AI_MIME_TYPES, GeminiError, geminiJson } from "./gemini";
import { getExtension } from "./renamer";
import { CATALOGO_DOCUMENTOS } from "./partilha/documentos";

export interface ArquivoCofre {
  fileName: string;
  data: ArrayBuffer;
}

export type RegimeExtraido =
  | "COMUNHAO_PARCIAL"
  | "COMUNHAO_UNIVERSAL"
  | "SEPARACAO_CONVENCIONAL"
  | "SEPARACAO_OBRIGATORIA";

export type TipoBemExtraido = "IMOVEL" | "VEICULO" | "FINANCEIRO" | "QUOTAS" | "OUTRO";

export interface CasoExtraido {
  falecido: {
    nome: string | null;
    cpf: string | null;
    dataObito: string | null;
    dataCasamento: string | null;
    ultimoDomicilio: string | null;
  };
  sobrevivente: {
    existe: boolean | null;
    nome: string | null;
    vinculo: "CASAMENTO" | "UNIAO_ESTAVEL" | null;
    regime: RegimeExtraido | null;
  };
  herdeiros: Array<{
    nome: string;
    filhoDoSobrevivente: boolean | null;
    /** Qualificação quando constar (planilha do escritório, minutas): apoio, nunca verdade. */
    qualificacao: {
      rg: string | null;
      cpf: string | null;
      dataNascimento: string | null;
      profissao: string | null;
      estadoCivil: string | null;
      email: string | null;
      endereco: string | null;
      cidade: string | null;
      uf: string | null;
      cep: string | null;
    } | null;
  }>;
  bens: Array<{
    descricao: string;
    tipo: TipoBemExtraido | null;
    valor: string | null;
    natureza: "COMUM" | "PARTICULAR" | null;
  }>;
  /** Um por arquivo enviado, alinhado por índice (1-based). */
  arquivos: Array<{
    indice: number;
    tipoDetectado: string | null;
    /** id do CATALOGO_DOCUMENTOS em que o arquivo se encaixa (ou null). */
    documentoId: string | null;
  }>;
}

const IDS_CATALOGO = CATALOGO_DOCUMENTOS.map((d) => d.id);

const texto = { type: "string", nullable: true } as const;

const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    falecido: {
      type: "object",
      properties: {
        nome: texto,
        cpf: texto,
        dataObito: texto,
        dataCasamento: texto,
        ultimoDomicilio: texto,
      },
    },
    sobrevivente: {
      type: "object",
      properties: {
        existe: { type: "boolean", nullable: true },
        nome: texto,
        vinculo: { type: "string", enum: ["CASAMENTO", "UNIAO_ESTAVEL"], nullable: true },
        regime: {
          type: "string",
          enum: [
            "COMUNHAO_PARCIAL",
            "COMUNHAO_UNIVERSAL",
            "SEPARACAO_CONVENCIONAL",
            "SEPARACAO_OBRIGATORIA",
          ],
          nullable: true,
        },
      },
    },
    herdeiros: {
      type: "array",
      items: {
        type: "object",
        properties: {
          nome: { type: "string" },
          filhoDoSobrevivente: { type: "boolean", nullable: true },
          qualificacao: {
            type: "object",
            nullable: true,
            properties: {
              rg: texto,
              cpf: texto,
              dataNascimento: texto,
              profissao: texto,
              estadoCivil: texto,
              email: texto,
              endereco: texto,
              cidade: texto,
              uf: texto,
              cep: texto,
            },
          },
        },
        required: ["nome"],
      },
    },
    bens: {
      type: "array",
      items: {
        type: "object",
        properties: {
          descricao: { type: "string" },
          tipo: {
            type: "string",
            enum: ["IMOVEL", "VEICULO", "FINANCEIRO", "QUOTAS", "OUTRO"],
            nullable: true,
          },
          valor: texto,
          natureza: { type: "string", enum: ["COMUM", "PARTICULAR"], nullable: true },
        },
        required: ["descricao"],
      },
    },
    arquivos: {
      type: "array",
      items: {
        type: "object",
        properties: {
          indice: { type: "integer" },
          tipoDetectado: texto,
          documentoId: { type: "string", enum: IDS_CATALOGO, nullable: true },
        },
        required: ["indice"],
      },
    },
  },
  required: ["falecido", "sobrevivente", "herdeiros", "bens", "arquivos"],
} as const;

function prompt(total: number): string {
  const catalogo = CATALOGO_DOCUMENTOS.map((d) => `- ${d.id}: ${d.titulo}`).join("\n");
  return `Você é assistente de um escritório de direito sucessório no Brasil. Acima estão ${total} documento(s) da pasta de um inventário, cada um precedido de "DOCUMENTO n".

Extraia APENAS o que constar dos documentos, para preencher a folha de trabalho do inventário:

1. falecido — dados do(a) autor(a) da herança: nome completo, CPF (formato 000.000.000-00), dataObito e dataCasamento em YYYY-MM-DD, ultimoDomicilio como "Cidade/UF". A certidão de óbito é a fonte principal.
2. sobrevivente — existe = true se os documentos indicarem cônjuge ou companheiro(a) vivo(a) na data do óbito (false apenas com indicação clara em contrário, ex.: certidão de óbito dizendo viúvo/divorciado sem união posterior). vinculo e regime saem da certidão de casamento ou escritura de união estável (regime: atenção à data do casamento — antes de 1977 o regime legal era a comunhão universal).
3. herdeiros — SOMENTE pessoas que os documentos apontem como filhos(as) do falecido (certidão de óbito costuma listar; certidões de nascimento provam). filhoDoSobrevivente = true quando a filiação indicar que também é filho(a) do(a) sobrevivente; null em dúvida. Planilhas e minutas do escritório (qualificação, partilha) frequentemente trazem RG, CPF, data de nascimento, profissão, estado civil, e-mail e endereço de cada herdeiro — quando constarem, preencha qualificacao (dataNascimento em YYYY-MM-DD; campo ausente = null; sem qualquer dado, qualificacao = null).
4. bens — um por bem identificado (matrícula de imóvel, CRLV, extrato, contrato social). descricao curta e útil (ex.: "Apartamento — matrícula 12.345 do 1º RI de Guarulhos/SP"); valor numérico em reais com ponto decimal (ex.: "620000.00") apenas se o documento trouxer valor; natureza COMUM/PARTICULAR só quando a origem do bem deixar claro (herança/doação/aquisição anterior ao casamento = PARTICULAR).
5. arquivos — para CADA documento (indice 1 a ${total}): tipoDetectado (rótulo curto, ex.: "Certidão de Óbito") e documentoId = o id do catálogo abaixo em que o arquivo deve ser arquivado (null se nenhum servir).

Catálogo do processo:
${catalogo}

REGRAS: não invente nada — campo sem base clara volta null (ou lista vazia); não deduza herdeiros de sobrenomes; datas sempre YYYY-MM-DD; responda apenas o JSON.`;
}

function limpar(v: unknown, max = 160): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim().slice(0, max);
  return t || null;
}

function dataIso(v: unknown): string | null {
  const t = limpar(v, 10);
  return t && /^\d{4}-\d{2}-\d{2}$/.test(t) ? t : null;
}

function valorDecimal(v: unknown): string | null {
  if (typeof v !== "string" && typeof v !== "number") return null;
  const n = Number(String(v).replace(/[^\d.]/g, ""));
  return Number.isFinite(n) && n > 0 ? n.toFixed(2) : null;
}

function umDe<T extends string>(v: unknown, opcoes: readonly T[]): T | null {
  return typeof v === "string" && (opcoes as readonly string[]).includes(v) ? (v as T) : null;
}

/** Lê o lote de documentos e devolve o caso extraído, já saneado. */
export async function extrairCasoDoCofre(
  apiKey: string,
  arquivos: ArquivoCofre[]
): Promise<CasoExtraido> {
  const parts: Array<Record<string, unknown>> = [];
  arquivos.forEach((arq, i) => {
    const ext = getExtension(arq.fileName);
    // .txt: texto já extraído no navegador (planilhas .xlsx e documentos
    // .docx viram texto plano no cliente) — segue como parte de texto.
    if (ext === ".txt") {
      const conteudo = Buffer.from(arq.data).toString("utf-8").slice(0, 60_000);
      parts.push({ text: `DOCUMENTO ${i + 1}: ${arq.fileName}\n${conteudo}` });
      return;
    }
    const mimeType = AI_MIME_TYPES[ext];
    if (!mimeType) {
      throw new GeminiError(`Formato não suportado pela IA: ${arq.fileName}`, 415);
    }
    parts.push({ text: `DOCUMENTO ${i + 1}: ${arq.fileName}` });
    parts.push({
      inline_data: {
        mime_type: mimeType,
        data: Buffer.from(arq.data).toString("base64"),
      },
    });
  });
  parts.push({ text: prompt(arquivos.length) });

  const bruto = (await geminiJson(apiKey, parts, RESPONSE_SCHEMA)) as Record<string, unknown>;
  if (!bruto || typeof bruto !== "object") {
    throw new GeminiError("Resposta do Gemini fora do formato esperado.", 502);
  }

  const f = (bruto.falecido ?? {}) as Record<string, unknown>;
  const s = (bruto.sobrevivente ?? {}) as Record<string, unknown>;
  const herdeiros = Array.isArray(bruto.herdeiros) ? bruto.herdeiros : [];
  const bens = Array.isArray(bruto.bens) ? bruto.bens : [];
  const arquivosSaida = Array.isArray(bruto.arquivos) ? bruto.arquivos : [];

  return {
    falecido: {
      nome: limpar(f.nome),
      cpf: limpar(f.cpf, 14),
      dataObito: dataIso(f.dataObito),
      dataCasamento: dataIso(f.dataCasamento),
      ultimoDomicilio: limpar(f.ultimoDomicilio, 80),
    },
    sobrevivente: {
      existe: typeof s.existe === "boolean" ? s.existe : null,
      nome: limpar(s.nome),
      vinculo: umDe(s.vinculo, ["CASAMENTO", "UNIAO_ESTAVEL"] as const),
      regime: umDe(s.regime, [
        "COMUNHAO_PARCIAL",
        "COMUNHAO_UNIVERSAL",
        "SEPARACAO_CONVENCIONAL",
        "SEPARACAO_OBRIGATORIA",
      ] as const),
    },
    herdeiros: herdeiros
      .map((h) => {
        const item = h as Record<string, unknown>;
        const nome = limpar(item?.nome);
        if (!nome) return null;
        const filho = item?.filhoDoSobrevivente;
        const q = (item?.qualificacao ?? null) as Record<string, unknown> | null;
        const qualificacao =
          q && typeof q === "object"
            ? {
                rg: limpar(q.rg, 30),
                cpf: limpar(q.cpf, 14),
                dataNascimento: dataIso(q.dataNascimento),
                profissao: limpar(q.profissao, 60),
                estadoCivil: limpar(q.estadoCivil, 40),
                email: limpar(q.email, 120),
                endereco: limpar(q.endereco, 160),
                cidade: limpar(q.cidade, 60),
                uf: limpar(q.uf, 2),
                cep: limpar(q.cep, 10),
              }
            : null;
        const temAlgo =
          qualificacao && Object.values(qualificacao).some((v) => v !== null);
        return {
          nome,
          filhoDoSobrevivente: typeof filho === "boolean" ? filho : null,
          qualificacao: temAlgo ? qualificacao : null,
        };
      })
      .filter((h): h is NonNullable<typeof h> => h !== null)
      .slice(0, 20),
    bens: bens
      .map((b) => {
        const item = b as Record<string, unknown>;
        const descricao = limpar(item?.descricao, 200);
        if (!descricao) return null;
        return {
          descricao,
          tipo: umDe(item.tipo, ["IMOVEL", "VEICULO", "FINANCEIRO", "QUOTAS", "OUTRO"] as const),
          valor: valorDecimal(item.valor),
          natureza: umDe(item.natureza, ["COMUM", "PARTICULAR"] as const),
        };
      })
      .filter((b): b is NonNullable<typeof b> => b !== null)
      .slice(0, 40),
    arquivos: arquivosSaida
      .map((a) => {
        const item = a as Record<string, unknown>;
        const indice = Number(item?.indice);
        if (!Number.isInteger(indice) || indice < 1 || indice > arquivos.length) return null;
        const documentoId = limpar(item.documentoId, 60);
        return {
          indice,
          tipoDetectado: limpar(item.tipoDetectado, 60),
          documentoId: documentoId && IDS_CATALOGO.includes(documentoId) ? documentoId : null,
        };
      })
      .filter((a): a is NonNullable<typeof a> => a !== null),
  };
}
