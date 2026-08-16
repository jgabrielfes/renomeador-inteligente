/**
 * COLAÇÃO (CC, arts. 2.002 a 2.012) — bens doados em vida a descendentes
 * voltam à massa de CÁLCULO para igualar as legítimas: o valor colacionado
 * soma ao monte fictício, os quinhões são recalculados sobre essa massa
 * maior e o herdeiro donatário ABATE do próprio quinhão o que já recebeu.
 *
 * Motor PURO (com testes), aplicado como PÓS-PROCESSAMENTO do resultado do
 * motor de partilha: a meação e a base do ITCMD causa mortis NÃO mudam (a
 * doação teve o próprio fato gerador quando feita); o que muda é o quinhão
 * líquido a receber de cada herdeiro. Simplificação declarada: a massa
 * fictícia é rateada na proporção dos quinhões originais (inclusive do
 * cônjuge concorrente, quando houver) — conferência do(a) advogado(a).
 */

import type { Resultado } from './types';

export interface Colacao {
  id: string;
  /** Herdeiro que recebeu a doação em vida (id do lançamento no item I). */
  herdeiroId: string;
  /** Descrição curta do bem doado (ex.: "Apartamento doado em 2019"). */
  descricao: string;
  /** Valor de colação (decimal "12345.67") — CC 2.004: valor da doação. */
  valor: string;
}

export interface QuinhaoColacionado {
  herdeiroId: string;
  nome: string;
  /** Quinhão original do espelho (R$). */
  valorOriginal: number;
  /** Quinhão recalculado sobre a massa fictícia (herança + colações). */
  valorComMassaFicticia: number;
  /** Valor colacionado por este herdeiro (0 = não colaciona). */
  colacionado: number;
  /** Quinhão líquido a receber = recalculado − colacionado (piso 0). */
  valorLiquido: number;
}

export interface ResultadoColacao {
  quinhoes: QuinhaoColacionado[];
  totalColacionado: number;
  avisos: string[];
  fundamento: string;
}

const r2 = (v: number) => Math.round(v * 100) / 100;
const fmt = (v: number) =>
  `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * Aplica as colações sobre os quinhões do resultado. Devolve null quando não
 * há colação com valor — o espelho segue intocado.
 */
export function aplicarColacoes(
  resultado: Resultado,
  colacoes: Colacao[],
): ResultadoColacao | null {
  const validas = colacoes.filter((c) => Number(c.valor) > 0);
  if (validas.length === 0) return null;

  const herancaOriginal = Number(resultado.heranca.total);
  if (!(herancaOriginal > 0)) return null;

  const totalColacionado = r2(validas.reduce((a, c) => a + Number(c.valor), 0));
  const massaFicticia = r2(herancaOriginal + totalColacionado);
  const fator = massaFicticia / herancaOriginal;

  const porHerdeiro: Record<string, number> = {};
  for (const c of validas) {
    porHerdeiro[c.herdeiroId] = r2((porHerdeiro[c.herdeiroId] ?? 0) + Number(c.valor));
  }

  const avisos: string[] = [];
  const quinhoes: QuinhaoColacionado[] = resultado.quinhoes.map((q) => {
    const original = Number(q.valor);
    const ampliado = r2(original * fator);
    const colacionado = porHerdeiro[q.herdeiroId] ?? 0;
    const liquido = r2(Math.max(0, ampliado - colacionado));
    if (colacionado > ampliado) {
      // CC 2.007: doação inoficiosa — o excesso sobre a legítima é redutível.
      avisos.push(
        `${q.nome}: o valor colacionado (${fmt(colacionado)}) EXCEDE o quinhão recalculado (${fmt(ampliado)}) — possível doação inoficiosa, sujeita a redução (CC, art. 2.007). Conferir com a disponível.`,
      );
    }
    return {
      herdeiroId: q.herdeiroId,
      nome: q.nome,
      valorOriginal: r2(original),
      valorComMassaFicticia: ampliado,
      colacionado,
      valorLiquido: liquido,
    };
  });

  // Colação apontada para herdeiro que não está no espelho (removido?).
  for (const id of Object.keys(porHerdeiro)) {
    if (!resultado.quinhoes.some((q) => q.herdeiroId === id)) {
      avisos.push(
        'Há colação lançada para herdeiro que não aparece no espelho — confira o item I.',
      );
      break;
    }
  }

  return {
    quinhoes,
    totalColacionado,
    avisos,
    fundamento:
      'CC, arts. 2.002 e 2.003 (dever de colacionar e igualação das legítimas) e 2.004 (valor da colação); massa fictícia rateada na proporção dos quinhões do espelho — a meação e a base do ITCMD causa mortis não mudam.',
  };
}
