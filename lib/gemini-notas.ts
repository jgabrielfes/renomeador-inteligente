// Redação assistida das peças do resolvedor de notas (lado servidor).
//
// A IA NUNCA toca nos templates: ela só redige o conteúdo dos campos
// variáveis (teor da retificação, blocos de lapso/correção, objeto do
// requerimento…), que o fillDocxTemplate injeta nos placeholders. As mesmas
// travas do módulo valem aqui: campo sem base no contexto volta null (o
// placeholder segue visível), e a saída é rascunho para conferência humana.

import { GeminiError, geminiJson } from "./gemini";

export type PecaIa = "ata" | "requerimento" | "rerratificacao";

export interface ContextoPeca {
  exigencia: string; // texto integral do item da nota devolutiva
  serventia?: string;
  prenotacao?: string;
  traslado?: {
    especie?: string;
    data?: string;
    livro?: string;
    fls?: string;
    partes?: string;
    sintese?: string;
    qualificacoes?: string;
    confiavel?: boolean;
  };
  documentos?: Array<{ nome: string; tipo: string | null }>;
  camposAtuais?: Record<string, string>;
}

// Campo -> o que a IA deve redigir nele. As descrições espelham o papel do
// placeholder no template correspondente.
const CAMPOS: Record<PecaIa, Record<string, string>> = {
  ata: {
    teorRetificacao:
      'o teor da retificação, no padrão "onde constou X, deve constar Y" ou "para constar que…", derivado do que a exigência aponta',
    naturezaErro:
      'a natureza do erro, curta, para completar "face …" (ex.: "o erro material", "ao erro de redação")',
    especieEscritura:
      "a espécie da escritura retificada (ex.: Escritura de Venda e Compra), se o contexto disser",
    amparoDocumental:
      "o documento arquivado que ampara a retificação — SOMENTE um documento presente na lista da pasta do caso",
  },
  requerimento: {
    objeto: "o que se requer, em uma frase objetiva, no infinitivo",
    blocoExtra:
      "parágrafo(s) de esclarecimento (DOS FATOS) quando a exigência pedir explicação; senão null",
    referencia:
      'referência à nota, começando com vírgula (ex.: ", em resposta à nota devolutiva…"), se os dados existirem',
    verbo: 'o verbo do pedido: "requerer", "solicitar" ou "expor"',
  },
  rerratificacao: {
    sintese:
      "a síntese do ato original (item I), no padrão “o primeiro nomeado, vendeu ao segundo nomeado pelo valor de…, [imóvel], melhor descrito e caracterizado na matrícula…”",
    blocoLapso:
      'o item II — o que constou errado: "Entretanto, por um lapso, constou erroneamente naquela escritura que: a) …" com alíneas',
    blocoCorrecao:
      'o item III — a correção, pareada alínea a alínea com o item II: "RETIFICAM aquela escritura, para constar que: a) …"',
  },
};

const NOME_PECA: Record<PecaIa, string> = {
  ata: "ata retificativa (erro material, corrigível de ofício pelo tabelião)",
  requerimento: "requerimento dirigido à serventia de registro de imóveis",
  rerratificacao: "escritura pública de rerratificação",
};

function schemaDe(peca: PecaIa) {
  return {
    type: "OBJECT",
    properties: Object.fromEntries(
      Object.keys(CAMPOS[peca]).map((k) => [
        k,
        { type: "STRING", nullable: true },
      ])
    ),
  } as const;
}

function prompt(peca: PecaIa, ctx: ContextoPeca): string {
  const linhas: string[] = [];
  linhas.push(
    `Você redige minutas em tabelionato de notas brasileiro (São Paulo). A peça é uma ${NOME_PECA[peca]}, que responde à exigência de uma nota devolutiva do Registro de Imóveis.`,
    "",
    "EXIGÊNCIA DA NOTA (transcrição):",
    ctx.exigencia.slice(0, 6000),
    ""
  );
  if (ctx.serventia) linhas.push(`Serventia: ${ctx.serventia}`);
  if (ctx.prenotacao) linhas.push(`Prenotação nº: ${ctx.prenotacao}`);
  const tr = ctx.traslado;
  if (tr) {
    linhas.push("", "ATO NOTARIAL (extraído do traslado):");
    if (tr.especie) linhas.push(`- Espécie: ${tr.especie}`);
    if (tr.data) linhas.push(`- Data da lavratura: ${tr.data}`);
    if (tr.livro) linhas.push(`- Livro ${tr.livro}, fls. ${tr.fls ?? "?"}`);
    if (tr.partes) linhas.push(`- Partes: ${tr.partes}`);
    if (tr.sintese) linhas.push(`- Síntese do negócio: ${tr.sintese}`);
    if (tr.qualificacoes) {
      linhas.push(
        `- Qualificações das partes: ${tr.qualificacoes.slice(0, 4000)}`
      );
    }
    if (tr.confiavel === false) {
      linhas.push(
        "- ATENÇÃO: o traslado veio de OCR — números e datas podem estar corrompidos; não os reproduza em campo nenhum."
      );
    }
  }
  const docs = (ctx.documentos ?? []).slice(0, 60);
  if (docs.length > 0) {
    linhas.push("", "DOCUMENTOS NA PASTA DO CASO:");
    for (const d of docs) {
      linhas.push(`- ${d.nome}${d.tipo ? ` (${d.tipo})` : ""}`);
    }
  }
  const atuais = Object.entries(ctx.camposAtuais ?? {}).filter(
    ([, v]) => v.trim() !== ""
  );
  if (atuais.length > 0) {
    linhas.push(
      "",
      "CAMPOS JÁ PREENCHIDOS PELO OPERADOR (não os reescreva — devolva null neles; use-os como contexto):"
    );
    for (const [k, v] of atuais) linhas.push(`- ${k}: ${v.slice(0, 800)}`);
  }
  linhas.push(
    "",
    "Redija APENAS os campos abaixo (o template da peça é fixo e não muda):",
    ...Object.entries(CAMPOS[peca]).map(([k, desc]) => `- "${k}": ${desc}`),
    "",
    "Regras invioláveis:",
    "- Estilo cartorial brasileiro, sóbrio e direto; sem markdown, sem aspas decorativas.",
    "- NUNCA invente nome, número, data, matrícula ou qualificação que não esteja no contexto acima. Campo sem base suficiente = null (o placeholder ficará visível para o operador preencher).",
    "- Não escreva placeholders, colchetes ou lacunas do tipo [NOME] — se falta o dado, o campo inteiro é null.",
    "- A minuta é um rascunho que será conferido por humano antes de qualquer lavratura."
  );
  return linhas.join("\n");
}

// Sugere o conteúdo dos campos variáveis de uma peça. Devolve só os campos
// que a IA conseguiu redigir com base no contexto; os demais ficam de fora.
export async function geminiRedigirPeca(
  apiKey: string,
  peca: PecaIa,
  ctx: ContextoPeca
): Promise<Record<string, string>> {
  const parsed = await geminiJson(
    apiKey,
    [{ text: prompt(peca, ctx) }],
    schemaDe(peca),
    // Redação corrida (não classificação): um pouco de variação ajuda a prosa.
    0.2
  );
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new GeminiError("Resposta do Gemini fora do formato esperado.", 502);
  }
  const campos: Record<string, string> = {};
  for (const k of Object.keys(CAMPOS[peca])) {
    const v = (parsed as Record<string, unknown>)[k];
    if (typeof v === "string" && v.trim() !== "" && !/[[\]{}]/.test(v)) {
      campos[k] = v.trim();
    }
  }
  return campos;
}

export function pecaIaValida(v: unknown): v is PecaIa {
  return v === "ata" || v === "requerimento" || v === "rerratificacao";
}
