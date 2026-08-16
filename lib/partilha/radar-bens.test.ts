/**
 * Casos de teste do Radar de bens fora do inventário (Módulo 4).
 *
 * Roda sem dependência externa:
 *   npx tsx lib/partilha/radar-bens.test.ts
 */

import { analisarRadarBens, type EntradaRadar } from './radar-bens';

let ok = 0, fail = 0;
function eq(nome: string, a: unknown, e: unknown) {
  if (JSON.stringify(a) === JSON.stringify(e)) ok++;
  else { fail++; console.error(`  ✗ ${nome}\n    esperado ${JSON.stringify(e)}\n    obtido   ${JSON.stringify(a)}`); }
}

console.log('\nRadar de bens fora do inventário\n');

const rodar = (e: EntradaRadar) => analisarRadarBens(e);

// RB-01: VGBL R$ 300 mil com beneficiários → fora do monte-mor, ITCMD sem os 300k.
const rb01 = rodar({ respostas: [{ item: 'vgbl', presente: true, valor: 300_000 }] });
eq('RB-01: VGBL fora do monte-mor', rb01.cards[0].foraDoMonteMor, true);
eq('RB-01: 300k fora do ITCMD', rb01.cards[0].valorForaItcmd, 300_000);
eq('RB-01: economia 4% = 12k', rb01.economiaItcmdEstimada, 12_000);
eq('RB-01: fundamento cita Tema 1214', rb01.cards[0].fundamento.includes('1214'), true);

// RB-02: conta conjunta 80k → 40k espólio, 40k cotitular; alerta de prova.
const rb02 = rodar({ respostas: [{ item: 'conta_conjunta', presente: true, valor: 80_000 }] });
eq('RB-02: metade do cotitular fora do ITCMD', rb02.cards[0].valorForaItcmd, 40_000);
eq('RB-02: a metade do espólio ENTRA (não fora do monte-mor)', rb02.cards[0].foraDoMonteMor, false);
eq('RB-02: alerta de prova em contrário', rb02.cards[0].alertas.some((a) => a.includes('prova em contrário')), true);

// RB-03: seguro de vida SEM beneficiário → art. 792, entra no inventário.
const rb03 = rodar({ respostas: [{ item: 'seguro_vida', presente: true, valor: 100_000, temBeneficiario: false }] });
eq('RB-03: sem beneficiário entra no monte-mor', rb03.cards[0].foraDoMonteMor, false);
eq('RB-03: nada sai do ITCMD', rb03.cards[0].valorForaItcmd, 0);
eq('RB-03: alerta do art. 792', rb03.cards[0].alertas.some((a) => a.includes('792')), true);
// Com beneficiário, o seguro sai por inteiro.
const seguroComBenef = rodar({ respostas: [{ item: 'seguro_vida', presente: true, valor: 100_000, temBeneficiario: true }] });
eq('seguro com beneficiário: fora do monte-mor', seguroComBenef.cards[0].foraDoMonteMor, true);
eq('seguro com beneficiário: 100k fora do ITCMD', seguroComBenef.cards[0].valorForaItcmd, 100_000);

// RB-04: só pensão por morte → nada no monte-mor, sem base de ITCMD.
const rb04 = rodar({ respostas: [{ item: 'pensao_morte', presente: true }] });
eq('RB-04: pensão fora do monte-mor', rb04.cards[0].foraDoMonteMor, true);
eq('RB-04: pensão não é acervo (0 no ITCMD)', rb04.cards[0].valorForaItcmd, 0);
eq('RB-04: sem economia quantificada', rb04.economiaItcmdEstimada, 0);

// Só os itens PRESENTES viram card.
const misto = rodar({
  respostas: [
    { item: 'vgbl', presente: true, valor: 100_000 },
    { item: 'pgbl', presente: false, valor: 50_000 },
    { item: 'fgts_pis_verbas', presente: true, valor: 20_000 },
  ],
});
eq('só presentes viram card', misto.cards.map((c) => c.item), ['vgbl', 'fgts_pis_verbas']);
eq('base fora soma os presentes', misto.totalForaDoInventario, 120_000);

// Alíquota configurável (reforma futura).
const outraAliquota = rodar({
  respostas: [{ item: 'vgbl', presente: true, valor: 100_000 }],
  aliquotaItcmd: 0.08,
});
eq('economia com alíquota 8%', outraAliquota.economiaItcmdEstimada, 8_000);

console.log(`\n${ok} passaram, ${fail} falharam\n`);
if (fail > 0) process.exit(1);
