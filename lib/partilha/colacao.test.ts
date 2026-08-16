/**
 * Casos de teste da colação (CC, arts. 2.002–2.012).
 *
 * Roda sem dependência externa:
 *   npx tsx lib/partilha/colacao.test.ts
 */

import { aplicarColacoes, type Colacao } from './colacao';
import type { Resultado } from './types';

let ok = 0, fail = 0;
function eq(nome: string, a: unknown, e: unknown) {
  if (JSON.stringify(a) === JSON.stringify(e)) ok++;
  else { fail++; console.error(`  ✗ ${nome}\n    esperado ${JSON.stringify(e)}\n    obtido   ${JSON.stringify(a)}`); }
}

console.log('\nColação — abatimento na partilha\n');

/** Resultado mínimo: herança 300.000, dois filhos com 150.000 cada. */
const resultado = {
  heranca: { total: '300000.00' },
  quinhoes: [
    { herdeiroId: 'h1', nome: 'Ana', valor: '150000.00' },
    { herdeiroId: 'h2', nome: 'Beto', valor: '150000.00' },
  ],
} as unknown as Resultado;

// Sem colação (ou com valor zero) → null, espelho intocado.
eq('sem colação: null', aplicarColacoes(resultado, []), null);
eq('colação zerada: null', aplicarColacoes(resultado, [
  { id: 'c1', herdeiroId: 'h1', descricao: 'Doação', valor: '0' },
]), null);

// Ana recebeu 60.000 em vida: massa fictícia 360.000 → 180.000 cada;
// Ana abate os 60.000 (líquido 120.000), Beto recebe 180.000.
const colacoes: Colacao[] = [
  { id: 'c1', herdeiroId: 'h1', descricao: 'Terreno doado', valor: '60000.00' },
];
const r = aplicarColacoes(resultado, colacoes)!;
eq('total colacionado', r.totalColacionado, 60_000);
eq('quinhão recalculado (massa fictícia)', r.quinhoes.map((q) => q.valorComMassaFicticia), [180_000, 180_000]);
eq('Ana abate o colacionado', r.quinhoes[0].valorLiquido, 120_000);
eq('Beto recebe o quinhão ampliado', r.quinhoes[1].valorLiquido, 180_000);
eq('sem avisos no caso simples', r.avisos, []);
eq('fundamento cita o CC 2.002', r.fundamento.includes('2.002'), true);

// A soma dos líquidos = herança real (os 60.000 do abate ficam com quem não
// colacionou — é a igualação das legítimas).
eq('líquidos somam a herança real', r.quinhoes.reduce((a, q) => a + q.valorLiquido, 0), 300_000);

// Doação inoficiosa: colacionado maior que o quinhão recalculado → aviso.
const inoficiosa = aplicarColacoes(resultado, [
  { id: 'c1', herdeiroId: 'h1', descricao: 'Doação grande', valor: '400000.00' },
])!;
eq('inoficiosa: líquido não fica negativo', inoficiosa.quinhoes[0].valorLiquido, 0);
eq('inoficiosa: aviso do CC 2.007', inoficiosa.avisos.some((a) => a.includes('2.007')), true);

// Colação de herdeiro fora do espelho → aviso.
const orfa = aplicarColacoes(resultado, [
  { id: 'c1', herdeiroId: 'hX', descricao: 'Doação', valor: '10000.00' },
])!;
eq('herdeiro fora do espelho: aviso', orfa.avisos.some((a) => a.includes('não aparece')), true);

// Duas colações do mesmo herdeiro somam.
const duas = aplicarColacoes(resultado, [
  { id: 'c1', herdeiroId: 'h1', descricao: 'A', valor: '30000.00' },
  { id: 'c2', herdeiroId: 'h1', descricao: 'B', valor: '30000.00' },
])!;
eq('duas colações somam', duas.quinhoes[0].colacionado, 60_000);

console.log(`\n${ok} passaram, ${fail} falharam\n`);
if (fail > 0) process.exit(1);
