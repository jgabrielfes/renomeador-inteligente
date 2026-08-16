/**
 * Casos de teste do checklist da Declaração Final de Espólio (Módulo 2).
 *
 * Roda sem dependência externa:
 *   npx tsx lib/partilha/declaracao-final.test.ts
 */

import {
  planejarDeclaracaoFinal,
  ultimoDiaUtilDeAbril,
  type EntradaDeclaracaoFinal,
} from './declaracao-final';

let ok = 0, fail = 0;
function eq(nome: string, a: unknown, e: unknown) {
  if (JSON.stringify(a) === JSON.stringify(e)) ok++;
  else { fail++; console.error(`  ✗ ${nome}\n    esperado ${JSON.stringify(e)}\n    obtido   ${JSON.stringify(a)}`); }
}

console.log('\nDeclaração Final de Espólio\n');

const base: EntradaDeclaracaoFinal = {
  dataObito: '2024-03-10',
  dataMarcoPartilha: '2026-06-01',
  declaracoesEntregues: [],
  haviaBens: true,
  dataReferencia: '2026-08-14',
};

// último dia útil de abril: 2027-04-30 é sexta-feira.
eq('último dia útil de abril/2027', ultimoDiaUtilDeAbril(2027), '2027-04-30');
// 2021-04-30 foi sexta; 2023-04-30 foi domingo → recua para 28 (sexta).
eq('abril/2023 recua para dia útil', ultimoDiaUtilDeAbril(2023), '2023-04-28');

// DF-01: óbito 03/2024, escritura 06/2026 → inicial 2024, intermediária 2025, final 2026.
const df01 = planejarDeclaracaoFinal(base);
eq('DF-01: três anos-base', df01.itens.map((i) => i.anoBase), [2024, 2025, 2026]);
eq('DF-01: tipos inicial/intermediária/final', df01.itens.map((i) => i.tipo), ['INICIAL', 'INTERMEDIARIA', 'FINAL']);
eq('DF-01: prazo da final abril/2027', df01.prazoFinal, '2027-04-30');

// DF-02: óbito e escritura no mesmo ano → sem intermediárias; a única é a FINAL.
const df02 = planejarDeclaracaoFinal({
  ...base,
  dataObito: '2025-02-01',
  dataMarcoPartilha: '2025-11-20',
});
eq('DF-02: um único item', df02.itens.length, 1);
eq('DF-02: é a FINAL do ano do óbito', [df02.itens[0].tipo, df02.itens[0].anoBase], ['FINAL', 2025]);

// DF-03: intermediária de 2025 não entregue, hoje 08/2026 → ATRASADO (prazo abr/2026).
const df03 = planejarDeclaracaoFinal(base);
const inter2025 = df03.itens.find((i) => i.anoBase === 2025)!;
eq('DF-03: intermediária de 2025 atrasada', inter2025.status, 'ATRASADO');
eq('DF-03: alerta de intermediária em atraso', df03.alertas.some((a) => a.includes('atraso')), true);
// A entregue vira OK.
const df03ok = planejarDeclaracaoFinal({ ...base, declaracoesEntregues: [2024, 2025] });
eq('DF-03: entregues viram OK', df03ok.itens.filter((i) => i.status === 'OK').map((i) => i.anoBase), [2024, 2025]);

// DF-04: sem bens → sem final obrigatória, checklist reduzido.
const df04 = planejarDeclaracaoFinal({ ...base, haviaBens: false });
eq('DF-04: não obrigatória', df04.obrigatoria, false);
eq('DF-04: sem itens de checklist', df04.itens.length, 0);
eq('DF-04: alerta explica a dispensa', df04.alertas[0].includes('não há Declaração Final'), true);

// Sem marco ainda: intermediárias em curso, sem a final; alerta de marco indefinido.
const semMarco = planejarDeclaracaoFinal({ ...base, dataMarcoPartilha: null });
eq('sem marco: sem prazo final', semMarco.prazoFinal, null);
eq('sem marco: nenhum item FINAL', semMarco.itens.some((i) => i.tipo === 'FINAL'), false);
eq('sem marco: alerta de marco indefinido', semMarco.alertas.some((a) => a.includes('ainda não definido')), true);

// Herdeiros/quinhões da etapa III chegam ao resultado; DARF 4600.
const comHerdeiros = planejarDeclaracaoFinal({
  ...base,
  herdeiros: [{ nome: 'Ana', cpf: '111', quinhao: 50_000 }],
});
eq('herdeiros repassados', comHerdeiros.herdeiros[0].nome, 'Ana');
eq('DARF 4600', comHerdeiros.darf.codigo, '4600');

console.log(`\n${ok} passaram, ${fail} falharam\n`);
if (fail > 0) process.exit(1);
