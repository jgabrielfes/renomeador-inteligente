/**
 * Aritmética racional exata com BigInt.
 *
 * Regra do projeto: nenhum `number` participa de cálculo de quinhão.
 * Um terço em ponto flutuante gera resíduo que não fecha na escritura.
 */

function gcd(a: bigint, b: bigint): bigint {
  let x = a < 0n ? -a : a;
  let y = b < 0n ? -b : b;
  while (y) {
    const t = x % y;
    x = y;
    y = t;
  }
  return x === 0n ? 1n : x;
}

export class Rat {
  readonly n: bigint;
  readonly d: bigint;

  private constructor(n: bigint, d: bigint) {
    if (d === 0n) throw new Error('Rat: denominador zero');
    let nn = n;
    let dd = d;
    if (dd < 0n) {
      nn = -nn;
      dd = -dd;
    }
    const g = gcd(nn, dd);
    this.n = nn / g;
    this.d = dd / g;
  }

  static make(n: bigint, d: bigint = 1n): Rat {
    return new Rat(n, d);
  }

  static int(n: number | bigint): Rat {
    return Rat.make(BigInt(n));
  }

  /** "600000.00" | "1234" | 1234 -> racional exato */
  static decimal(v: string | number): Rat {
    const s = typeof v === 'number' ? String(v) : v.trim();
    if (!/^-?\d+(\.\d+)?$/.test(s)) {
      throw new Error(`Rat.decimal: valor inválido "${v}"`);
    }
    const neg = s.startsWith('-');
    const body = neg ? s.slice(1) : s;
    const [i, f = ''] = body.split('.');
    const num = BigInt(i + f);
    const den = 10n ** BigInt(f.length);
    return Rat.make(neg ? -num : num, den);
  }

  /** "1/3" | "2/5" -> racional exato */
  static fraction(s: string): Rat {
    const m = /^\s*(-?\d+)\s*\/\s*(\d+)\s*$/.exec(s);
    if (!m) return Rat.decimal(s);
    return Rat.make(BigInt(m[1]), BigInt(m[2]));
  }

  add(o: Rat): Rat {
    return Rat.make(this.n * o.d + o.n * this.d, this.d * o.d);
  }
  sub(o: Rat): Rat {
    return Rat.make(this.n * o.d - o.n * this.d, this.d * o.d);
  }
  mul(o: Rat): Rat {
    return Rat.make(this.n * o.n, this.d * o.d);
  }
  div(o: Rat): Rat {
    if (o.n === 0n) throw new Error('Rat: divisão por zero');
    return Rat.make(this.n * o.d, this.d * o.n);
  }

  /** -1 | 0 | 1 */
  cmp(o: Rat): number {
    const l = this.n * o.d;
    const r = o.n * this.d;
    return l < r ? -1 : l > r ? 1 : 0;
  }
  lt(o: Rat) {
    return this.cmp(o) < 0;
  }
  gt(o: Rat) {
    return this.cmp(o) > 0;
  }
  eq(o: Rat) {
    return this.cmp(o) === 0;
  }
  isZero() {
    return this.n === 0n;
  }
  isNeg() {
    return this.n < 0n;
  }

  /** Piso em centavos. Só use via alocarCentavos, para não perder resíduo. */
  floorCents(): bigint {
    const num = this.n * 100n;
    const q = num / this.d;
    return num % this.d !== 0n && num < 0n ? q - 1n : q;
  }

  toString(): string {
    return this.d === 1n ? `${this.n}` : `${this.n}/${this.d}`;
  }
}

export const ZERO = Rat.make(0n);
export const ONE = Rat.make(1n);
export const UM_QUARTO = Rat.make(1n, 4n);
export const MEIO = Rat.make(1n, 2n);
export const UM_TERCO = Rat.make(1n, 3n);

/** bigint de centavos -> "1234.56" */
export function centsToStr(c: bigint): string {
  const neg = c < 0n;
  const a = neg ? -c : c;
  const i = a / 100n;
  const f = a % 100n;
  return `${neg ? '-' : ''}${i}.${f.toString().padStart(2, '0')}`;
}

export interface Alocacao {
  id: string;
  cents: bigint;
}

/**
 * Distribui `totalCents` segundo frações exatas, pelo método do maior resto.
 * Garante que a soma das partes é exatamente o total — sem centavo órfão.
 */
export function alocarCentavos(
  partes: { id: string; fr: Rat }[],
  totalCents: bigint,
): { alocacoes: Alocacao[]; ajustados: string[] } {
  if (partes.length === 0) return { alocacoes: [], ajustados: [] };

  const linhas = partes.map((p) => {
    const num = p.fr.n * totalCents;
    const den = p.fr.d;
    return { id: p.id, cents: num / den, resto: ((num % den) + den) % den, den };
  });

  const soma = linhas.reduce((a, l) => a + l.cents, 0n);
  let sobra = totalCents - soma;

  const ordem = [...linhas].sort((a, b) => {
    const l = a.resto * b.den;
    const r = b.resto * a.den;
    return l > r ? -1 : l < r ? 1 : 0;
  });

  const ajustados: string[] = [];
  let i = 0;
  while (sobra > 0n && ordem.length > 0) {
    ordem[i % ordem.length].cents += 1n;
    ajustados.push(ordem[i % ordem.length].id);
    sobra -= 1n;
    i += 1;
  }
  while (sobra < 0n && ordem.length > 0) {
    const alvo = ordem[ordem.length - 1 - (i % ordem.length)];
    alvo.cents -= 1n;
    ajustados.push(alvo.id);
    sobra += 1n;
    i += 1;
  }

  return {
    alocacoes: linhas.map((l) => ({ id: l.id, cents: l.cents })),
    ajustados,
  };
}
