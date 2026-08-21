/**
 * Casos de teste da semântica de cor do prazo.
 *
 * Roda sem dependência externa:
 *   npx tsx lib/partilha/prazo.test.ts
 */

import { faixaDoPrazo, rotuloDoPrazo } from './prazo';

let ok = 0, fail = 0;
function eq(nome: string, a: unknown, e: unknown) {
  if (JSON.stringify(a) === JSON.stringify(e)) ok++;
  else { fail++; console.error(`  ✗ ${nome}\n    esperado ${JSON.stringify(e)}\n    obtido   ${JSON.stringify(a)}`); }
}

console.log('\nPrazo — faixas de cor do art. 611\n');

eq('início: ok', faixaDoPrazo(5), 'ok');
eq('dia 30 ainda ok', faixaDoPrazo(30), 'ok');
eq('31 dias: faltam ≤30 para o marco → alerta', faixaDoPrazo(31), 'alerta');
eq('dia 60: alerta (último dia sem multa)', faixaDoPrazo(60), 'alerta');
eq('61 dias: marco estourado → vencido', faixaDoPrazo(61), 'vencido');
eq('180 dias: vencido', faixaDoPrazo(180), 'vencido');
eq('um ano após o marco final: ainda vencido', faixaDoPrazo(545), 'vencido');
eq('mais de um ano do marco final: histórico', faixaDoPrazo(546), 'historico');
eq('caso antigo (3745 dias): histórico, não urgência', faixaDoPrazo(3745), 'historico');

eq('rótulo dentro do prazo', rotuloDoPrazo(10), 'dentro do prazo');
eq('rótulo do alerta com contagem', rotuloDoPrazo(45), 'multa de 10% em 15 dia(s)');
eq('rótulo multa 10%', rotuloDoPrazo(90), 'multa de 10% incidente');
eq('rótulo multa 20%', rotuloDoPrazo(200), 'multa de 20% incidente');
eq('rótulo histórico', rotuloDoPrazo(3745), 'multa já incidente');

console.log(`\n${ok} passaram, ${fail} falharam\n`);
if (fail > 0) process.exit(1);
