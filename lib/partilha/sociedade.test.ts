/**
 * Casos de teste da avaliação de quotas societárias.
 *
 * Roda sem dependência externa:
 *   npx tsx lib/partilha/sociedade.test.ts
 */

import { avaliarQuotas, mesclarSociedade, chaveSociedade, type SociedadeExtraida } from './sociedade';

let ok = 0, fail = 0;
function eq(nome: string, a: unknown, e: unknown) {
  if (JSON.stringify(a) === JSON.stringify(e)) ok++;
  else { fail++; console.error(`  ✗ ${nome}\n    esperado ${JSON.stringify(e)}\n    obtido   ${JSON.stringify(a)}`); }
}

console.log('\nSociedade — avaliação de quotas\n');

const brazilianColor: SociedadeExtraida = {
  empresa: 'Brazilian Color Ltda',
  cnpj: '12.345.678/0001-90',
  capitalSocial: '100000.00',
  patrimonioLiquido: '480000.00',
  socios: [
    { nome: 'Luzia Margareth Pummer Carvalho', percentual: 50 },
    { nome: 'Clair José de Carvalho', percentual: 50 },
  ],
};

// Comunhão parcial: quotas do CASAL (50+50 = 100%) sobre o PL (maior que o capital).
const casal = avaliarQuotas(brazilianColor, 'Luzia Margareth Pummer Carvalho', 'Clair José de Carvalho', 'COMUNHAO_PARCIAL')!;
eq('casal em comunhão: percentual somado', casal.percentual, 100);
eq('base = PL (maior)', casal.fonteBase, 'PATRIMONIO_LIQUIDO');
eq('valor = 100% do PL', casal.valor, '480000.00');
eq('natureza comum', casal.natureza, 'COMUM');
eq('aviso da presunção da parcial', casal.avisos.some((a) => a.includes('constância')), true);

// Separação convencional: só as quotas da falecida (50%), natureza particular.
const separacao = avaliarQuotas(brazilianColor, 'Luzia Margareth Pummer Carvalho', 'Clair José de Carvalho', 'SEPARACAO_CONVENCIONAL')!;
eq('separação: só o percentual da falecida', separacao.percentual, 50);
eq('valor = 50% do PL', separacao.valor, '240000.00');
eq('natureza particular', separacao.natureza, 'PARTICULAR');

// Capital maior que o PL: base fica no capital, com aviso.
const plBaixo = avaliarQuotas(
  { ...brazilianColor, capitalSocial: '600000.00', patrimonioLiquido: '480000.00' },
  'Luzia Margareth Pummer Carvalho', '', 'SEPARACAO_CONVENCIONAL',
)!;
eq('capital vence quando maior', plBaixo.fonteBase, 'CAPITAL_SOCIAL');
eq('valor = 50% do capital', plBaixo.valor, '300000.00');
eq('aviso PL < capital', plBaixo.avisos.some((a) => a.includes('menor que o capital')), true);

// Sem balanço: base pelo capital, com aviso pedindo o balanço.
const semPl = avaliarQuotas(
  { ...brazilianColor, patrimonioLiquido: null },
  'Luzia Margareth Pummer Carvalho', '', 'SEPARACAO_OBRIGATORIA',
)!;
eq('sem PL: base capital', semPl.fonteBase, 'CAPITAL_SOCIAL');
eq('aviso pedindo balanço', semPl.avisos.some((a) => a.includes('balanço')), true);

// Nome com variação (sem acento, sobrenome parcial) ainda casa.
const variacao = avaliarQuotas(brazilianColor, 'LUZIA MARGARETH PUMMER CARVALHO', '', 'SEPARACAO_CONVENCIONAL');
eq('nome em caixa alta casa', variacao !== null, true);

// Falecido que não é sócio: nada a lançar.
eq('não sócio → null', avaliarQuotas(brazilianColor, 'Antonio Cabral', '', 'COMUNHAO_PARCIAL'), null);
// Sem falecido informado: null.
eq('sem falecido → null', avaliarQuotas(brazilianColor, '', 'Clair', 'COMUNHAO_PARCIAL'), null);

// Mesclagem de lotes: contrato (sócios + capital) num lote, balanço (PL) noutro.
const contrato: SociedadeExtraida = {
  empresa: 'Brazilian Color Ltda', cnpj: null, capitalSocial: '100000.00', patrimonioLiquido: null,
  socios: [{ nome: 'Luzia M. P. Carvalho', percentual: 50 }],
};
const balanco: SociedadeExtraida = {
  empresa: 'BRAZILIAN COLOR LTDA', cnpj: '12.345.678/0001-90', capitalSocial: null, patrimonioLiquido: '480000.00',
  socios: [],
};
const mesclada = mesclarSociedade(contrato, balanco);
eq('mescla mantém capital', mesclada.capitalSocial, '100000.00');
eq('mescla traz PL', mesclada.patrimonioLiquido, '480000.00');
eq('mescla traz CNPJ', mesclada.cnpj, '12.345.678/0001-90');
eq('mescla não duplica sócios', mesclada.socios.length, 1);
eq('chave igual para variações', chaveSociedade('Brazilian Color Ltda'), chaveSociedade('BRAZILIAN COLOR LTDA'));

console.log(`\n${ok} passaram, ${fail} falharam\n`);
if (fail > 0) process.exit(1);
