/**
 * Extração de exigências — MOTOR LOCAL + contrato do LLM.
 *
 * Segue o desenho da casa: todo fluxo de IA tem FALLBACK LOCAL. O local
 * reaproveita o decompositor do Resolvedor de Notas Devolutivas
 * (lib/notas/resolvedor.ts — calibrado em notas reais do balcão) e sai com
 * confiança BAIXA (0.5), o que manda tudo à fila de revisão. O LLM (Gemini,
 * chamado só pelo worker — lib/jurimetria/gemini-exigencias.ts) devolve o
 * JSON validado pelo esquema Zod daqui.
 *
 * Instruções duras ao modelo (e ao revisor): não inventar fundamentação;
 * resultado é POR exigência; orientação de site = sem_julgamento; linguagem
 * impessoal no infinitivo, sem nenhum dado pessoal.
 */

import { z } from 'zod';

import { triar } from '@/lib/notas/resolvedor';
import type { AtoTipo, ExtracaoDocumento } from './tipos';

export const esquemaExtracao = z.object({
  cartorio_mencionado: z.string().nullable(),
  registrador_mencionado: z.string().nullable(),
  data_documento: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable(),
  ato_tipo: z.enum(['inventario', 'partilha', 'doacao', 'divorcio', 'compra_venda', 'outro']),
  exigencias: z
    .array(
      z.object({
        texto_normalizado: z.string().trim().min(10),
        fundamentacao: z.array(z.string()),
        resultado: z.enum(['mantida', 'afastada', 'parcial', 'sem_julgamento']),
        trecho_origem: z.string(),
        tema: z.string().nullable().optional(),
      }),
    )
    .max(40),
});

export type RespostaExtracao = z.infer<typeof esquemaExtracao>;

/** Prompt do extrator — o texto que chega aqui JÁ está anonimizado. */
export function montarPromptExtracao(
  textoAnonimizado: string,
  contexto: { tipoFonte: string; temas: { id: string; rotulo: string }[] },
): string {
  const listaTemas = contexto.temas.map((t) => `- ${t.id}: ${t.rotulo}`).join('\n');
  return [
    'Você lê documentos do registro de imóveis paulista (nota devolutiva, decisão de dúvida registral ou orientação publicada por cartório) e devolve SOMENTE um JSON válido, sem markdown, no formato:',
    '{"cartorio_mencionado": string|null, "registrador_mencionado": string|null, "data_documento": "YYYY-MM-DD"|null, "ato_tipo": "inventario|partilha|doacao|divorcio|compra_venda|outro", "exigencias": [{"texto_normalizado": string, "fundamentacao": string[], "resultado": "mantida|afastada|parcial|sem_julgamento", "trecho_origem": string, "tema": string|null}]}',
    '',
    'Regras DURAS:',
    '- "texto_normalizado": UMA frase impessoal, no infinitivo, sem nenhum dado pessoal. Ex.: "Apresentar certidão de casamento atualizada para averbação prévia do divórcio."',
    '- NÃO inventar fundamentação: só citar lei/norma que o texto realmente menciona.',
    '- "resultado" é POR EXIGÊNCIA: em decisão de dúvida, a que o juízo manteve = "mantida", a afastada = "afastada", parcial = "parcial". Nota devolutiva sem julgamento e orientação de site = "sem_julgamento".',
    `- Documento desta fonte: ${contexto.tipoFonte}.`,
    '- "tema": escolha UM slug da lista abaixo (ou null se nenhum servir):',
    listaTemas,
    '- Tokens como [CPF], [MATRICULA], [NOME] são anonimização: mantenha-os fora do texto_normalizado (reescreva de forma genérica).',
    '',
    'Documento:',
    '"""',
    textoAnonimizado.slice(0, 60000),
    '"""',
  ].join('\n');
}

/** Converte a resposta VALIDADA do LLM no formato interno do pipeline. */
export function daRespostaLLM(r: RespostaExtracao): ExtracaoDocumento {
  return {
    cartorioMencionado: r.cartorio_mencionado,
    registradorMencionado: r.registrador_mencionado,
    dataDocumento: r.data_documento,
    atoTipo: r.ato_tipo,
    exigencias: r.exigencias.map((e) => ({
      textoNormalizado: e.texto_normalizado,
      fundamentacao: e.fundamentacao,
      resultado: e.resultado,
      trechoOrigem: e.trecho_origem.slice(0, 400),
    })),
    temas: r.exigencias.map((e) => e.tema ?? null),
    confianca: 0.85,
  };
}

/**
 * FALLBACK LOCAL: decompõe pelo triar() do Resolvedor de Notas. Sai com
 * confiança 0.5 — abaixo do limiar de publicação: tudo passa pela revisão.
 */
export function extrairExigenciasLocal(
  textoAnonimizado: string,
  tipoFonte: string,
): ExtracaoDocumento {
  const itens = triar(textoAnonimizado);
  const semJulgamento = tipoFonte !== 'DUVIDA_1VRP' && tipoFonte !== 'DUVIDA_CGJ';
  return {
    cartorioMencionado: null,
    registradorMencionado: null,
    dataDocumento: null,
    atoTipo: 'outro' as AtoTipo,
    exigencias: itens
      .filter((i) => i.texto.trim().length >= 20)
      .slice(0, 40)
      .map((i) => ({
        textoNormalizado: i.texto.replace(/\s+/g, ' ').trim().slice(0, 400),
        fundamentacao: [],
        resultado: semJulgamento ? ('sem_julgamento' as const) : ('sem_julgamento' as const),
        trechoOrigem: i.texto.slice(0, 400),
      })),
    confianca: 0.5,
  };
}
