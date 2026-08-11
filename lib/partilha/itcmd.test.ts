/**
 * Casos de teste da provisão do ITCMD-SP.
 *
 * Roda sem dependência externa:
 *   node --experimental-strip-types lib/partilha/itcmd.test.ts
 */

import { provisionarItcmd, jurosArt20, UFESP_POR_ANO } from './itcmd';

let ok = 0, fail = 0;
function eq(nome: string, a: unknown, e: unknown) {
  if (JSON.stringify(a) === JSON.stringify(e)) ok++;
  else { fail++; console.error(`  ✗ ${nome}\n    esperado ${JSON.stringify(e)}\n    obtido   ${JSON.stringify(a)}`); }
}
function aprox(nome: string, a: number, e: number, tol = 0.01) {
  if (Math.abs(a - e) <= tol) ok++;
  else { fail++; console.error(`  ✗ ${nome}\n    esperado ~${e}\n    obtido   ${a}`); }
}

console.log('\nITCMD-SP — provisão causa mortis\n');

// Dentro de 90 dias, mesmo ano: sem atualização, com desconto de 5%.
const emDia = provisionarItcmd({
  dataObito: '2026-05-10',
  dataReferencia: '2026-07-01', // 52 dias
  baseCalculo: 1_000_000,
});
aprox('base sem atualização no mesmo ano', emDia.baseAtualizada, 1_000_000);
aprox('imposto = 4%', emDia.imposto, 40_000);
eq('desconto presente', emDia.parcelas.some((p) => p.id === 'desconto'), true);
aprox('desconto = 5% do imposto', emDia.parcelas.find((p) => p.id === 'desconto')!.valor, -2_000);
eq('sem multa de abertura', emDia.parcelas.some((p) => p.id === 'multa-abertura'), false);
eq('sem mora', emDia.diasDeAtraso, 0);
aprox('total = imposto − desconto', emDia.total, 38_000);
eq('vencimento = óbito + 180 dias', emDia.vencimento, '2026-11-06');

// Protocolo entre 60 e 180 dias: multa de 10%, sem desconto (após 90 dias).
const tardio10 = provisionarItcmd({
  dataObito: '2026-01-10',
  dataReferencia: '2026-06-01',
  baseCalculo: 500_000,
  dataProtocolo: '2026-04-01', // 82 dias
});
eq('multa de 10% presente', tardio10.parcelas.find((p) => p.id === 'multa-abertura')!.valor,
  Math.round(500_000 * 0.04 * 0.1 * 100) / 100);
eq('sem desconto após 90 dias', tardio10.parcelas.some((p) => p.id === 'desconto'), false);
eq('sem mora antes do vencimento', tardio10.parcelas.some((p) => p.id === 'multa-moratoria'), false);

// Atualização pela UFESP entre anos: óbito 2024, referência 2026.
const atualizada = provisionarItcmd({
  dataObito: '2024-03-01',
  dataReferencia: '2026-08-11',
  baseCalculo: 353_600, // 10.000 UFESPs de 2024
  dataProtocolo: '2024-04-15', // 45 dias — sem multa de abertura
});
aprox('10.000 UFESPs', atualizada.baseEmUfesps, 10_000);
aprox('base atualizada para UFESP 2026', atualizada.baseAtualizada, 384_200);
aprox('imposto sobre a base atualizada', atualizada.imposto, 15_368);
eq('sem multa de abertura (45 dias)', atualizada.parcelas.some((p) => p.id === 'multa-abertura'), false);

// Mora: óbito em 2024-03-01 → vencimento 2024-08-28; referência 2026-08-11.
eq('vencimento', atualizada.vencimento, '2024-08-28');
eq('dias de atraso > 700', atualizada.diasDeAtraso > 700, true);
const moratoria = atualizada.parcelas.find((p) => p.id === 'multa-moratoria')!;
aprox('multa moratória capada em 20%', moratoria.valor, atualizada.imposto * 0.2);
const juros = atualizada.parcelas.find((p) => p.id === 'juros')!;
eq('juros presentes', juros.valor > 0, true);

// jurosArt20: piso de 1% por fração no mês do pagamento.
const j1 = jurosArt20('2026-07-01', '2026-07-20');
aprox('fração de mês única = 1%', j1.percentual, 1);
const j2 = jurosArt20('2026-05-10', '2026-07-20');
// jun/2026 (Selic ~1,12%) + fração de jul (1%) — entre 2% e 2,3%.
eq('meses cheios + fração', j2.meses.length, 2);
eq('juros acima do piso', j2.percentual > 2 && j2.percentual < 2.4, true);
const j0 = jurosArt20('2026-07-01', '2026-07-01');
aprox('pagamento no vencimento: sem juros', j0.percentual, 0);

// Piso legal: em 2020 (Selic 2% a.a. → ~0,17% a.m.) vale o mínimo de 1% a.m.
const jPiso = jurosArt20('2020-08-31', '2020-11-15');
aprox('piso de 1% a.m. em Selic baixa', jPiso.percentual, 3); // set + out + fração nov

// Multa de abertura projetada quando o inventário ainda não foi aberto.
const semProtocolo = provisionarItcmd({
  dataObito: '2025-09-01',
  dataReferencia: '2026-08-11', // 344 dias
  baseCalculo: 200_000,
});
const ma = semProtocolo.parcelas.find((p) => p.id === 'multa-abertura')!;
aprox('projeção usa 20% após 180 dias', ma.valor, semProtocolo.imposto * 0.2);
eq('aviso da jurisprudência do TJSP', semProtocolo.avisos.some((a) => a.includes('TJSP')), true);

// Sanidade da tabela de UFESPs.
eq('UFESP 2025', UFESP_POR_ANO[2025], 37.02);
eq('UFESP 2026', UFESP_POR_ANO[2026], 38.42);

console.log(`\n${ok} passaram, ${fail} falharam\n`);
if (fail > 0) process.exit(1);
