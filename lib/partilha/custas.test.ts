/**
 * Casos de teste da projeção de custos cartorários e judiciais.
 *
 * Roda sem dependência externa:
 *   npx tsx lib/partilha/custas.test.ts
 */

import {
  emolumentoEscritura,
  emolumentoRegistro,
  CERTIDAO_RI_2026,
  taxaJudiciaria,
  projetarCustos,
  type EntradaCustos,
} from './custas';

let ok = 0, fail = 0;
function eq(nome: string, a: unknown, e: unknown) {
  if (JSON.stringify(a) === JSON.stringify(e)) ok++;
  else { fail++; console.error(`  ✗ ${nome}\n    esperado ${JSON.stringify(e)}\n    obtido   ${JSON.stringify(a)}`); }
}

console.log('\nCustas — projeção cartorária e judicial (tabelas 2026, ISS 5%)\n');

/* faixas oficiais de notas: valores exatos da tabela CNB-SP 2026 */
eq('notas: mínimo da tabela', emolumentoEscritura(1_000), 362.98);
eq('notas: faixa de 100 mil', emolumentoEscritura(100_000), 2_303.08);
eq('notas: faixa de 500 mil', emolumentoEscritura(500_000), 5_519.9);
eq('notas: faixa de 900 mil', emolumentoEscritura(900_000), 6_129.04);
eq('notas: limite superior inclusivo', emolumentoEscritura(384_200), 4_973.32);
eq('notas: um centavo acima muda de faixa', emolumentoEscritura(384_200.01), 5_519.9);
eq('notas: acima da última faixa', emolumentoEscritura(50_000_000), 66_756.25);
eq('notas: base zero', emolumentoEscritura(0), 0);

/* faixas oficiais de registro */
eq('registro: mínimo da tabela', emolumentoRegistro(1_000), 265.0);
eq('registro: faixa de 900 mil', emolumentoRegistro(900_000), 3_962.79);
eq('registro: faixa de 2 milhões', emolumentoRegistro(2_000_000), 5_471.41);
eq('registro: acima da última faixa', emolumentoRegistro(2_000_000_000), 67_136.84);
eq('certidão de matrícula 2026', CERTIDAO_RI_2026, 77.89);

/* taxa judiciária: faixas fixas da Lei 17.785/2023 (UFESP 38,42) */
const U = 38.42;
eq('até 50k → 10 UFESPs', taxaJudiciaria(50_000, U), { valor: 384.2, ufesps: 10 });
eq('500k → 100 UFESPs', taxaJudiciaria(500_000, U), { valor: 3_842, ufesps: 100 });
eq('1,2M → 300 UFESPs', taxaJudiciaria(1_200_000, U), { valor: 11_526, ufesps: 300 });
eq('4M → 1.000 UFESPs', taxaJudiciaria(4_000_000, U), { valor: 38_420, ufesps: 1_000 });
eq('8M → 3.000 UFESPs (teto)', taxaJudiciaria(8_000_000, U), { valor: 115_260, ufesps: 3_000 });

/* partilha: cálculo POR PAGAMENTO (Nota 3.1.1) */
const BASE: EntradaCustos = {
  monteMor: 900_000,
  // meação de 450k + 3 quinhões de 150k
  pagamentos: [450_000, 150_000, 150_000, 150_000],
  imoveis: [{ descricao: 'Casa em Guarulhos', valor: 900_000 }],
  rito: 'EXTRAJUDICIAL',
  qtdHerdeiros: 3,
  temSobrevivente: true,
  transferencias: [],
  ufesp: U,
};
const partilha = projetarCustos(BASE);
const escritura = partilha.parcelas.find((p) => p.id === 'escritura')!;
// 450k → 5.519,90 · 150k → 2.728,61 (×3) = 13.705,73
eq('escritura por pagamento: soma das faixas', escritura.valor, 13_705.73);
eq('escritura por pagamento: 4 pagamentos', escritura.quantidade, 4);
eq('escritura por pagamento: cita a Nota 3.1.1', escritura.fundamento.includes('3.1.1'), true);
eq('escritura por pagamento: valor de tabela (sem asterisco)', escritura.aproximado, false);

/* adjudicação: pagamento único = ato único pelo monte-mor */
const adjudicacao = projetarCustos({ ...BASE, pagamentos: [900_000], temSobrevivente: false, qtdHerdeiros: 1 });
eq('adjudicação: faixa única do monte', adjudicacao.parcelas.find((p) => p.id === 'escritura')!.valor, 6_129.04);

/* parcelas esperadas e certidões */
const ids = partilha.parcelas.map((p) => p.id);
eq('extrajudicial: parcelas esperadas', ids, [
  'escritura',
  'registro-0',
  'certidoes-registro-civil',
  'certidoes-matricula',
  'certidao-testamento',
]);
eq('registro pela faixa oficial', partilha.parcelas.find((p) => p.id === 'registro-0')!.valor, 3_962.79);
eq('certidão de matrícula exata', partilha.parcelas.find((p) => p.id === 'certidoes-matricula')!.valor, 77.89);
// certidões RC: óbito + casamento + 3 herdeiros = 5
eq('5 certidões de registro civil', partilha.parcelas.find((p) => p.id === 'certidoes-registro-civil')!.quantidade, 5);
eq('total = soma das parcelas', partilha.total, Math.round(partilha.parcelas.reduce((a, p) => a + p.valor, 0) * 100) / 100);
eq('aviso de conferência da tabela', partilha.avisos.some((a) => a.includes('anoregsp')), true);

/* partilha diferenciada: ato notarial extra + ato de registro extra */
const diferenciada = projetarCustos({
  ...BASE,
  transferencias: [{ valor: 120_000, tributo: 'ITCMD_DOACAO' }],
});
const idsDif = diferenciada.parcelas.map((p) => p.id);
eq('ato inter vivos vira escritura a mais', idsDif.includes('escritura-intervivos-0'), true);
// 120 mil cai na faixa 115.260,01–153.680 → R$ 2.728,61
eq('ato extra pela faixa do excedente', diferenciada.parcelas.find((p) => p.id === 'escritura-intervivos-0')!.valor, 2_728.61);
eq('registro adicional por imóvel', idsDif.includes('registro-atos-extras'), true);
eq('aviso cita o usufruto acessório (1/4 sobre 1/3)', diferenciada.avisos.some((a) => a.includes('1/3')), true);

/* judicial: taxa por faixa no lugar da escritura; registro continua */
const judicial = projetarCustos({ ...BASE, rito: 'JUDICIAL' });
const idsJud = judicial.parcelas.map((p) => p.id);
eq('judicial: taxa entra, escritura sai', [idsJud.includes('taxa-judiciaria'), idsJud.includes('escritura')], [true, false]);
eq('900k → 300 UFESPs', judicial.parcelas.find((p) => p.id === 'taxa-judiciaria')!.valor, 11_526);
eq('aviso de despesas judiciais fora', judicial.avisos.some((a) => a.includes('perícias')), true);

/* sem imóvel: sem registro nem certidão de matrícula */
const semImovel = projetarCustos({ ...BASE, imoveis: [] });
eq('sem imóvel: sem registro', semImovel.parcelas.some((p) => p.id.startsWith('registro')), false);
eq('sem imóvel: sem certidão de matrícula', semImovel.parcelas.some((p) => p.id === 'certidoes-matricula'), false);

console.log(`\n${ok} passaram, ${fail} falharam\n`);
if (fail > 0) process.exit(1);
