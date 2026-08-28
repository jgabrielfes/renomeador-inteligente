/**
 * Índice de COMPLEXIDADE do caso — MOTOR PURO da área "Para famílias".
 *
 * Pontuação somada sobre as respostas do questionário (nada de dado novo):
 * +2 herdeiro menor/incapaz · +2 testamento · +2 desacordo declarado ·
 * +1 família ainda não conversou · +1 empresa · +1 imóvel fora da UF do
 * inventário · +1 herdeiro no exterior · +1 dívidas · +1 patrimônio grande
 * (ponto médio das faixas acima de R$ 2 milhões).
 * 0–1 = SIMPLES · 2–3 = MEDIO · 4+ = COMPLEXO.
 *
 * É régua de PREPARO da família (o que deixa o caso mais trabalhoso), nunca
 * juízo sobre o profissional — os fatores saem em linguagem leiga.
 *
 * Testes: npx tsx lib/familias/familias.test.ts
 */

import { faixaDoAcervo } from './triagem';
import type { RespostasFamilia } from './tipos';

export type NivelComplexidade = 'SIMPLES' | 'MEDIO' | 'COMPLEXO';

export interface Complexidade {
  nivel: NivelComplexidade;
  pontos: number;
  /** O que pesa no caso, em frases leigas (a mais pesada primeiro). */
  fatores: string[];
}

export const ROTULO_COMPLEXIDADE: Record<NivelComplexidade, string> = {
  SIMPLES: 'Simples',
  MEDIO: 'Médio',
  COMPLEXO: 'Complexo',
};

export function calcularComplexidade(r: RespostasFamilia): Complexidade {
  let pontos = 0;
  const fatores: string[] = [];
  const somar = (p: number, fator: string) => {
    pontos += p;
    fatores.push(fator);
  };

  if (r.menorOuIncapaz === 'sim')
    somar(
      2,
      'Há herdeiro menor de idade ou incapaz — a lei acrescenta etapas de proteção (juiz e Ministério Público acompanham a parte dele).',
    );
  if (r.testamento === 'sim')
    somar(2, 'Havia testamento — ele precisa ser aberto e cumprido antes da divisão.');
  if (r.consenso === 'nao')
    somar(2, 'Nem todos concordam com a divisão — o desacordo alonga e encarece o caminho.');
  else if (r.consenso === 'nao-conversamos')
    somar(
      1,
      'A família ainda não conversou sobre a divisão — o consenso é o que destrava o caminho mais rápido.',
    );
  if (r.bens.empresa)
    somar(1, 'Há participação em empresa — quotas pedem avaliação e cuidados societários próprios.');
  if (r.bens.imoveisUfs.some((uf) => uf && uf !== r.ufFalecido))
    somar(
      1,
      'Há imóvel em outro estado — o imposto dele é pago lá, com guia e regras próprias.',
    );
  if (r.herdeiroExterior === 'sim')
    somar(
      1,
      'Há herdeiro fora do país ou difícil de localizar — procurações e prazos entram na conta.',
    );
  if (r.dividas === 'sim')
    somar(1, 'Há dívidas relevantes — elas são acertadas pelo espólio antes da divisão.');
  const acervo = faixaDoAcervo(r);
  if ((acervo.min + acervo.max) / 2 > 2_000_000)
    somar(1, 'O patrimônio declarado é grande — mais bens, mais documentos e mais conferências.');

  const nivel: NivelComplexidade = pontos <= 1 ? 'SIMPLES' : pontos <= 3 ? 'MEDIO' : 'COMPLEXO';
  if (fatores.length === 0)
    fatores.push(
      'Nenhum fator de complicação apareceu nas respostas — com os documentos em mãos, o caso tende a andar bem.',
    );
  return { nivel, pontos, fatores };
}
