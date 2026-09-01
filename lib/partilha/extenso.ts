/**
 * Valor monetário por extenso, em português — para preencher os parênteses
 * "R$ 1.234,56 (mil, duzentos e trinta e quatro reais e cinquenta e seis
 * centavos)" das minutas (escritura e petições), no lugar da lacuna que ficava
 * ali. Puro; testes: npx tsx lib/partilha/extenso.test.ts
 */

const UNIDADES = [
  'zero', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove',
  'dez', 'onze', 'doze', 'treze', 'quatorze', 'quinze', 'dezesseis', 'dezessete',
  'dezoito', 'dezenove',
];
const DEZENAS = ['', '', 'vinte', 'trinta', 'quarenta', 'cinquenta', 'sessenta', 'setenta', 'oitenta', 'noventa'];
const CENTENAS = ['', 'cento', 'duzentos', 'trezentos', 'quatrocentos', 'quinhentos', 'seiscentos', 'setecentos', 'oitocentos', 'novecentos'];
const ESCALAS: [string, string][] = [
  ['', ''],
  ['mil', 'mil'],
  ['milhão', 'milhões'],
  ['bilhão', 'bilhões'],
  ['trilhão', 'trilhões'],
];

/** Número inteiro de 0 a 999 por extenso (sem escala). */
function ate999(n: number): string {
  if (n === 0) return '';
  if (n === 100) return 'cem';
  const partes: string[] = [];
  const c = Math.floor(n / 100);
  const resto = n % 100;
  if (c > 0) partes.push(CENTENAS[c]);
  if (resto > 0) {
    if (resto < 20) partes.push(UNIDADES[resto]);
    else {
      const d = Math.floor(resto / 10);
      const u = resto % 10;
      partes.push(u > 0 ? `${DEZENAS[d]} e ${UNIDADES[u]}` : DEZENAS[d]);
    }
  }
  return partes.join(' e ');
}

/** Inteiro >= 0 por extenso. */
export function inteiroPorExtenso(n: number): string {
  if (n === 0) return 'zero';
  // Grupos de 3 dígitos, do menos para o mais significativo.
  const grupos: number[] = [];
  let resto = Math.floor(n);
  while (resto > 0) {
    grupos.push(resto % 1000);
    resto = Math.floor(resto / 1000);
  }
  const partes: string[] = [];
  for (let i = grupos.length - 1; i >= 0; i--) {
    const g = grupos[i];
    if (g === 0) continue;
    const [sing, plur] = ESCALAS[i] ?? ['', ''];
    if (i === 1) {
      // "mil" não leva "um": 1000 = "mil", não "um mil".
      partes.push(g === 1 ? 'mil' : `${ate999(g)} mil`);
    } else if (i >= 2) {
      partes.push(`${ate999(g)} ${g === 1 ? sing : plur}`);
    } else {
      partes.push(ate999(g));
    }
  }
  // Junção: "e" entre a penúltima e a última quando a última é < 100 ou
  // centena redonda; senão vírgula. Simplificação fiel ao uso do balcão:
  // vírgula entre grupos, "e" só antes do último grupo pequeno.
  return juntar(partes, grupos);
}

function juntar(partes: string[], grupos: number[]): string {
  if (partes.length <= 1) return partes.join('');
  // O último grupo (unidades, grupos[0]) liga com "e" quando é < 100 ou
  // centena exata (100, 200…); os demais grupos separam-se por vírgula.
  const ultimoGrupo = grupos[0];
  const ligaComE = ultimoGrupo > 0 && (ultimoGrupo < 100 || ultimoGrupo % 100 === 0);
  if (ligaComE) {
    return `${partes.slice(0, -1).join(', ')} e ${partes[partes.length - 1]}`;
  }
  return partes.join(', ');
}

/**
 * "12345.67" | 12345.67 → "doze mil, trezentos e quarenta e cinco reais e
 * sessenta e sete centavos". Um centavo/real no singular; centavos sozinhos
 * quando não há reais.
 */
export function valorPorExtenso(valor: string | number): string {
  const num = typeof valor === 'number' ? valor : Number(valor);
  if (!Number.isFinite(num)) return '';
  const negativo = num < 0;
  const cents = Math.round(Math.abs(num) * 100);
  const reais = Math.floor(cents / 100);
  const centavos = cents % 100;

  const partes: string[] = [];
  if (reais > 0) partes.push(`${inteiroPorExtenso(reais)} ${reais === 1 ? 'real' : 'reais'}`);
  if (centavos > 0) partes.push(`${inteiroPorExtenso(centavos)} ${centavos === 1 ? 'centavo' : 'centavos'}`);
  if (partes.length === 0) return 'zero reais';

  const texto = partes.join(' e ');
  return negativo ? `${texto} negativos` : texto;
}
