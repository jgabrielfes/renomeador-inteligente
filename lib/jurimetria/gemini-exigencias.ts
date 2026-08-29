/**
 * Chamada ao Gemini para EXTRAIR exigências — roda SÓ no worker (Action) ou
 * em servidor; a chave nunca chega ao navegador. O texto enviado JÁ está
 * anonimizado (princípio: nada de dado pessoal sai para serviço externo).
 *
 * Mesma disciplina de lib/gemini.ts: cadeia de modelos (as cotas do free
 * tier são POR MODELO), GEMINI_API_BASE apontável para mock em teste, e
 * falha de parse tenta UMA vez de novo com temperatura 0 antes de desistir.
 */

import { esquemaExtracao, daRespostaLLM, montarPromptExtracao } from './extrair';
import type { ExtracaoDocumento } from './tipos';

const MODELOS = [
  process.env.GEMINI_MODEL,
  'gemini-flash-lite-latest',
  'gemini-flash-latest',
].filter((m): m is string => Boolean(m));

const API_BASE = process.env.GEMINI_API_BASE ?? 'https://generativelanguage.googleapis.com';

async function chamar(modelo: string, prompt: string, temperatura: number): Promise<string> {
  const r = await fetch(`${API_BASE}/v1beta/models/${modelo}:generateContent`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-goog-api-key': process.env.GEMINI_API_KEY ?? '',
    },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: temperatura, responseMimeType: 'application/json' },
    }),
  });
  if (!r.ok) throw new Error(`Gemini ${modelo}: HTTP ${r.status}`);
  const dados = (await r.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  const texto = dados.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
  if (!texto.trim()) throw new Error(`Gemini ${modelo}: resposta vazia`);
  return texto;
}

function analisar(texto: string): ExtracaoDocumento | null {
  try {
    const semCerca = texto.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '');
    const v = esquemaExtracao.safeParse(JSON.parse(semCerca));
    return v.success ? daRespostaLLM(v.data) : null;
  } catch {
    return null;
  }
}

export function geminiDisponivel(): boolean {
  return Boolean(process.env.GEMINI_API_KEY);
}

/** null = todas as tentativas falharam (o worker cai no extrator local). */
export async function extrairComGemini(
  textoAnonimizado: string,
  contexto: { tipoFonte: string; temas: { id: string; rotulo: string }[] },
): Promise<ExtracaoDocumento | null> {
  if (!geminiDisponivel()) return null;
  const prompt = montarPromptExtracao(textoAnonimizado, contexto);
  for (const modelo of MODELOS) {
    try {
      const r1 = analisar(await chamar(modelo, prompt, 0.2));
      if (r1) return r1;
      // Falha de parse: UMA nova tentativa com temperatura 0 (contrato do desenho).
      const r2 = analisar(await chamar(modelo, prompt, 0));
      if (r2) return r2;
    } catch {
      // Cota/indisponibilidade deste modelo: o próximo da cadeia tem saldo próprio.
    }
  }
  return null;
}
