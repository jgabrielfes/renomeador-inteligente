/**
 * Casos de teste do Detector de Alvará Simplificado (Módulo 3).
 *
 * Roda sem dependência externa:
 *   npx tsx lib/partilha/alvara.test.ts
 */

import { detectarAlvara, type EntradaAlvara } from './alvara';

let ok = 0, fail = 0;
function eq(nome: string, a: unknown, e: unknown) {
  if (JSON.stringify(a) === JSON.stringify(e)) ok++;
  else { fail++; console.error(`  ✗ ${nome}\n    esperado ${JSON.stringify(e)}\n    obtido   ${JSON.stringify(a)}`); }
}

console.log('\nDetector de Alvará (Lei 6.858/80)\n');

const rodar = (e: EntradaAlvara) => detectarAlvara(e);
const TETO = 92_026.5;

// AL-01: só FGTS 12k, dependentes habilitados → dispensa total.
const al01 = rodar({
  itens: [{ descricao: 'FGTS', valor: 12_000, subtipo: 'fgts' }],
  existemDependentesInss: true,
});
eq('AL-01: dispensa total', al01.conclusao, 'DISPENSA_TOTAL');
eq('AL-01: parecer cita CEF', al01.parecer.join(' ').includes('Caixa'), true);

// AL-02: só saldo bancário 15k → alvará simplificado (abaixo do teto).
const al02 = rodar({
  itens: [{ descricao: 'Conta corrente', valor: 15_000, subtipo: 'saldo_bancario' }],
  existemDependentesInss: false,
});
eq('AL-02: alvará simplificado', al02.conclusao, 'ALVARA_SIMPLIFICADO');

// AL-03: saldo 15k + 1 imóvel → inventário comum (arrola tudo).
const al03 = rodar({
  itens: [
    { descricao: 'Conta corrente', valor: 15_000, subtipo: 'saldo_bancario' },
    { descricao: 'Apartamento', valor: 400_000 },
  ],
  existemDependentesInss: false,
});
eq('AL-03: inventário comum', al03.conclusao, 'INVENTARIO_COMUM');
eq('AL-03: parecer diz que o saldo é arrolado junto', al03.parecer.join(' ').includes('arrolados junto'), true);

// AL-04: só saldos, mas acima do teto → inventário/arrolamento comum.
const al04 = rodar({
  itens: [{ descricao: 'Aplicações', valor: TETO + 10_000, subtipo: 'fundo' }],
  existemDependentesInss: false,
});
eq('AL-04: acima do teto vira inventário', al04.conclusao, 'INVENTARIO_COMUM');
eq('AL-04: parecer cita ultrapassar o teto', al04.parecer.join(' ').includes('ULTRAPASSAM'), true);

// AL-05: FGTS + saldo pequeno → alvará simplificado com FGTS em paralelo.
const al05 = rodar({
  itens: [
    { descricao: 'FGTS', valor: 8_000, subtipo: 'fgts' },
    { descricao: 'Poupança', valor: 10_000, subtipo: 'poupanca' },
  ],
  existemDependentesInss: true,
});
eq('AL-05: alvará simplificado', al05.conclusao, 'ALVARA_SIMPLIFICADO');
eq('AL-05: parecer menciona o FGTS em paralelo', al05.parecer.join(' ').includes('paralelo'), true);
eq('AL-05: totais separados', [al05.totalVerbasHabilitacao, al05.totalFinanceiroArt2], [8_000, 10_000]);

// Misto com verbas: imóvel + FGTS → inventário com paralelo.
const misto = rodar({
  itens: [
    { descricao: 'Casa', valor: 300_000 },
    { descricao: 'FGTS', valor: 5_000, subtipo: 'fgts' },
  ],
  existemDependentesInss: true,
});
eq('misto com verba: inventário com paralelo', misto.conclusao, 'INVENTARIO_COM_PARALELO');

// Teto configurável por comarca.
const outroTeto = rodar({
  itens: [{ descricao: 'Aplicações', valor: 100_000, subtipo: 'fundo' }],
  existemDependentesInss: false,
  valor500Otn: 150_000,
});
eq('teto configurável deixa caber', outroTeto.conclusao, 'ALVARA_SIMPLIFICADO');
eq('teto adotado reflete o parâmetro', outroTeto.tetoAdotado, 150_000);

console.log(`\n${ok} passaram, ${fail} falharam\n`);
if (fail > 0) process.exit(1);
