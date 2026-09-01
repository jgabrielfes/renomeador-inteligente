/**
 * Testes do valor por extenso — valores reais do balcão (modelos DORALBA e
 * THEODORINA). npx tsx lib/partilha/extenso.test.ts
 */

import { valorPorExtenso, inteiroPorExtenso } from './extenso';

let ok = 0,
  fail = 0;
function eq(nome: string, a: unknown, e: unknown) {
  if (a === e) ok++;
  else {
    fail++;
    console.error(`  ✗ ${nome}\n    esperado: ${JSON.stringify(e)}\n    obtido:   ${JSON.stringify(a)}`);
  }
}

console.log('\nValor por extenso — modelos do balcão\n');

/* inteiros */
eq('zero', inteiroPorExtenso(0), 'zero');
eq('cem', inteiroPorExtenso(100), 'cem');
eq('cento e um', inteiroPorExtenso(101), 'cento e um');
eq('mil', inteiroPorExtenso(1000), 'mil');
eq('mil e um', inteiroPorExtenso(1001), 'mil e um');
eq('dois mil', inteiroPorExtenso(2000), 'dois mil');

/* valores dos modelos (DORALBA / THEODORINA) */
eq('496.251,00', valorPorExtenso('496251.00'), 'quatrocentos e noventa e seis mil, duzentos e cinquenta e um reais');
eq('165.333,67', valorPorExtenso('165333.67'), 'cento e sessenta e cinco mil, trezentos e trinta e três reais e sessenta e sete centavos');
eq('681.187,91', valorPorExtenso('681187.91'), 'seiscentos e oitenta e um mil, cento e oitenta e sete reais e noventa e um centavos');
eq('34.189,29', valorPorExtenso('34189.29'), 'trinta e quatro mil, cento e oitenta e nove reais e vinte e nove centavos');
eq('100.459,00 (centena redonda)', valorPorExtenso('100459.00'), 'cem mil, quatrocentos e cinquenta e nove reais');
eq('406,89', valorPorExtenso('406.89'), 'quatrocentos e seis reais e oitenta e nove centavos');
eq('812,93', valorPorExtenso('812.93'), 'oitocentos e doze reais e noventa e três centavos');
eq('1.790.322,30', valorPorExtenso('1790322.30'), 'um milhão, setecentos e noventa mil, trezentos e vinte e dois reais e trinta centavos');
eq('1.702.969,77', valorPorExtenso('1702969.77'), 'um milhão, setecentos e dois mil, novecentos e sessenta e nove reais e setenta e sete centavos');

/* singulares e centavos sozinhos */
eq('um real', valorPorExtenso('1.00'), 'um real');
eq('um centavo', valorPorExtenso('0.01'), 'um centavo');
eq('só centavos', valorPorExtenso('0.50'), 'cinquenta centavos');
eq('zero', valorPorExtenso('0.00'), 'zero reais');
eq('dois reais e um centavo', valorPorExtenso('2.01'), 'dois reais e um centavo');

console.log(`\n${ok} passaram, ${fail} falharam\n`);
if (fail > 0) process.exit(1);
