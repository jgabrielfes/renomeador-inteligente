/**
 * Ordem aleatória FIXA por família — as respostas dos(as) advogados(as)
 * aparecem embaralhadas SEM ranking, mas sempre na MESMA ordem para o mesmo
 * token (recarregar a página não re-sorteia; famílias diferentes veem ordens
 * diferentes). Motor puro: semente de string → Fisher–Yates determinístico.
 */

/** Hash simples e estável (FNV-1a 32 bits) da semente. */
function hashSemente(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** PRNG determinístico (mulberry32). */
function prng(semente: number): () => number {
  let a = semente;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Embaralha SEM mutar a entrada, deterministicamente pela semente. */
export function embaralharFixo<T>(itens: readonly T[], semente: string): T[] {
  const saida = [...itens];
  const rnd = prng(hashSemente(semente));
  for (let i = saida.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [saida[i], saida[j]] = [saida[j], saida[i]];
  }
  return saida;
}
