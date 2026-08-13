/**
 * Casos de teste da projeção de custos cartorários e judiciais.
 *
 * Roda sem dependência externa:
 *   npx tsx lib/partilha/custas.test.ts
 */

import {
  estimarEscritura,
  estimarRegistro,
  taxaJudiciaria,
  projetarCustos,
  type EntradaCustos,
} from './custas';

let ok = 0, fail = 0;
function eq(nome: string, a: unknown, e: unknown) {
  if (JSON.stringify(a) === JSON.stringify(e)) ok++;
  else { fail++; console.error(`  ✗ ${nome}\n    esperado ${JSON.stringify(e)}\n    obtido   ${JSON.stringify(a)}`); }
}

console.log('\nCustas — projeção cartorária e judicial\n');

/* estimadores: piso, curva crescente, teto e degrau de R$ 10 */
eq('escritura tem piso', estimarEscritura(10_000), 1_200);
eq('escritura 500k na ordem de grandeza (4–5 mil)', estimarEscritura(500_000), 5_600);
eq('escritura cresce com a base', estimarEscritura(1_000_000) > estimarEscritura(500_000), true);
eq('escritura capada no teto', estimarEscritura(50_000_000), 18_000);
eq('registro menor que escritura', estimarRegistro(500_000) < estimarEscritura(500_000), true);
eq('registro capado no teto', estimarRegistro(50_000_000), 14_000);
eq('degrau de R$ 10 (nunca para menos)', estimarEscritura(123_456) % 10, 0);
eq('base zero: sem emolumento', estimarEscritura(0), 0);

/* taxa judiciária: faixas fixas da Lei 17.785/2023 (UFESP 38,42) */
const U = 38.42;
eq('até 50k → 10 UFESPs', taxaJudiciaria(50_000, U), { valor: 384.2, ufesps: 10 });
eq('500k → 100 UFESPs', taxaJudiciaria(500_000, U), { valor: 3_842, ufesps: 100 });
eq('1,2M → 300 UFESPs', taxaJudiciaria(1_200_000, U), { valor: 11_526, ufesps: 300 });
eq('4M → 1.000 UFESPs', taxaJudiciaria(4_000_000, U), { valor: 38_420, ufesps: 1_000 });
eq('8M → 3.000 UFESPs (teto)', taxaJudiciaria(8_000_000, U), { valor: 115_260, ufesps: 3_000 });

/* projeção extrajudicial simples: escritura + registro + certidões */
const BASE: EntradaCustos = {
  monteMor: 900_000,
  imoveis: [{ descricao: 'Casa em Guarulhos', valor: 900_000 }],
  rito: 'EXTRAJUDICIAL',
  qtdHerdeiros: 3,
  temSobrevivente: true,
  transferencias: [],
  ufesp: U,
};
const simples = projetarCustos(BASE);
const ids = simples.parcelas.map((p) => p.id);
eq('extrajudicial: parcelas esperadas', ids, [
  'escritura',
  'registro-0',
  'certidoes-registro-civil',
  'certidoes-matricula',
  'certidao-testamento',
]);
eq('sem taxa judiciária no extrajudicial', ids.includes('taxa-judiciaria'), false);
// certidões RC: óbito + casamento + 3 herdeiros = 5
eq('5 certidões de registro civil', simples.parcelas[2].quantidade, 5);
eq('total = soma das parcelas', simples.total, simples.parcelas.reduce((a, p) => a + p.valor, 0));
eq('aviso de conferência da tabela', simples.avisos.some((a) => a.includes('anoregsp')), true);

/* partilha diferenciada: ato notarial extra + ato de registro extra */
const diferenciada = projetarCustos({
  ...BASE,
  transferencias: [{ valor: 120_000, tributo: 'ITCMD_DOACAO' }],
});
const idsDif = diferenciada.parcelas.map((p) => p.id);
eq('ato inter vivos vira escritura a mais', idsDif.includes('escritura-intervivos-0'), true);
eq('registro adicional por imóvel', idsDif.includes('registro-atos-extras'), true);
eq('ato extra pela faixa do excedente', diferenciada.parcelas.find((p) => p.id === 'escritura-intervivos-0')!.valor, estimarEscritura(120_000));
eq('aviso sobre número de atos', diferenciada.avisos.some((a) => a.includes('tabelionato')), true);

/* judicial: taxa por faixa no lugar da escritura; registro continua */
const judicial = projetarCustos({ ...BASE, rito: 'JUDICIAL' });
const idsJud = judicial.parcelas.map((p) => p.id);
eq('judicial: taxa entra, escritura sai', [idsJud.includes('taxa-judiciaria'), idsJud.includes('escritura')], [true, false]);
eq('taxa judicial exata (não aproximada)', judicial.parcelas.find((p) => p.id === 'taxa-judiciaria')!.aproximado, false);
eq('900k → 300 UFESPs', judicial.parcelas.find((p) => p.id === 'taxa-judiciaria')!.valor, 11_526);
eq('aviso de despesas judiciais fora', judicial.avisos.some((a) => a.includes('perícias')), true);

/* sem imóvel: sem registro nem certidão de matrícula */
const semImovel = projetarCustos({ ...BASE, imoveis: [] });
eq('sem imóvel: sem registro', semImovel.parcelas.some((p) => p.id.startsWith('registro')), false);
eq('sem imóvel: sem certidão de matrícula', semImovel.parcelas.some((p) => p.id === 'certidoes-matricula'), false);

console.log(`\n${ok} passaram, ${fail} falharam\n`);
if (fail > 0) process.exit(1);
