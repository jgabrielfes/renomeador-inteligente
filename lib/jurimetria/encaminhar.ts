/**
 * Encaminhamento + dedupe — MOTORES PUROS.
 *
 * Dedupe: similaridade de TRIGRAMAS (a mesma família do pg_trgm que o worker
 * usa no SQL) dentro do MESMO cartório+tema — acima do limiar, a exigência
 * nova aponta `duplicataDe` para a original e não conta duas vezes.
 *
 * Encaminhar: PUBLICAÇÃO AUTOMÁTICA (decisão do escritório, 2026-08-30 —
 * "pode tirar a fila de revisão"): tudo publica direto, com os motivos de
 * atenção (confiança baixa, titular pendente, cartório não identificado)
 * apenas ANOTADOS para curadoria posterior no admin. A ÚNICA trava que
 * segura publicação é possível dado pessoal remanescente (LGPD) — essa vai
 * à revisão, nunca ao ar sozinha.
 */

import type { MotivoRevisao } from './tipos';

export const LIMIAR_DUPLICATA = 0.62; // trigram Jaccard — calibrado nas fixtures
export const LIMIAR_PUBLICACAO = 0.8;
export const TAXA_AUDITORIA = 0.05;

const normalizar = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

function trigramas(s: string): Set<string> {
  const n = `  ${normalizar(s)} `;
  const t = new Set<string>();
  for (let i = 0; i < n.length - 2; i++) t.add(n.slice(i, i + 3));
  return t;
}

/** Similaridade de trigramas (Jaccard) — mesmo espírito do pg_trgm. */
export function similaridadeTexto(a: string, b: string): number {
  const ta = trigramas(a);
  const tb = trigramas(b);
  if (ta.size === 0 || tb.size === 0) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  return inter / (ta.size + tb.size - inter);
}

export function ehDuplicata(
  nova: { textoNormalizado: string; cartorioId: string | null; temaId: string | null },
  existente: { textoNormalizado: string; cartorioId: string | null; temaId: string | null },
): boolean {
  if (!nova.cartorioId || nova.cartorioId !== existente.cartorioId) return false;
  if ((nova.temaId ?? null) !== (existente.temaId ?? null)) return false;
  return similaridadeTexto(nova.textoNormalizado, existente.textoNormalizado) >= LIMIAR_DUPLICATA;
}

export interface DecisaoEncaminhamento {
  destino: 'publicado' | 'revisao';
  motivos: MotivoRevisao[];
}

export function encaminhar(e: {
  confianca: number;
  cartorioId: string | null;
  titularPendente: boolean;
  possivelDadoPessoal?: boolean;
}): DecisaoEncaminhamento {
  // LGPD é a única trava dura: possível dado pessoal nunca publica sozinho.
  if (e.possivelDadoPessoal) return { destino: 'revisao', motivos: ['possivel_dado_pessoal'] };
  const motivos: MotivoRevisao[] = [];
  if (!e.cartorioId) motivos.push('cartorio_nao_identificado');
  if (e.confianca < LIMIAR_PUBLICACAO) motivos.push('baixa_confianca');
  if (e.titularPendente) motivos.push('titular_pendente');
  return { destino: 'publicado', motivos };
}
