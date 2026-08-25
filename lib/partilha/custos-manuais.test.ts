/**
 * Custos manuais (caso fora de SP) — total, parcelas e detecção de UF.
 *
 *   npx tsx lib/partilha/custos-manuais.test.ts
 */

import {
  CUSTOS_MANUAIS_VAZIOS,
  parcelasManuais,
  totalCustosManuais,
  ufDoTexto,
  ufsForaDeSp,
} from './custos-manuais';

let ok = 0, fail = 0;
function teste(nome: string, cond: boolean, detalhe?: string) {
  if (cond) ok++;
  else { fail++; console.error(`  ✗ ${nome}${detalhe ? `\n    ${detalhe}` : ''}`); }
}
function eq(nome: string, a: unknown, e: unknown) {
  teste(nome, JSON.stringify(a) === JSON.stringify(e), `esperado ${JSON.stringify(e)}, obtido ${JSON.stringify(a)}`);
}

console.log('\nCustos manuais — caso fora de SP\n');

/* ---------- total e parcelas ---------- */

eq('total de vazio é 0', totalCustosManuais(CUSTOS_MANUAIS_VAZIOS), 0);
eq('total de null é 0', totalCustosManuais(null), 0);
eq(
  'total soma os quatro campos',
  totalCustosManuais({
    ...CUSTOS_MANUAIS_VAZIOS,
    itcmd: '10000.50',
    cartorioJustica: '2500',
    registros: '1200.25',
    certidoes: '300',
  }),
  14000.75,
);
eq(
  'campo ilegível/negativo conta como 0',
  totalCustosManuais({ ...CUSTOS_MANUAIS_VAZIOS, itcmd: 'abc', registros: '-50', certidoes: '100' }),
  100,
);
eq(
  'parcelas só com valor > 0, na ordem fixa',
  parcelasManuais({ ...CUSTOS_MANUAIS_VAZIOS, itcmd: '5000', certidoes: '250' }).map((p) => p.id),
  ['manual-itcmd', 'manual-certidoes'],
);

/* ---------- detecção de UF ---------- */

eq('ufDoTexto barra', ufDoTexto('Guarulhos/SP'), 'SP');
eq('ufDoTexto hífen com espaços', ufDoTexto('Niterói - RJ'), 'RJ');
eq('ufDoTexto travessão', ufDoTexto('Belo Horizonte – MG'), 'MG');
eq('ufDoTexto espaço', ufDoTexto('Comarca de Curitiba PR'), 'PR');
eq('ufDoTexto minúsculas', ufDoTexto('salvador/ba'), 'BA');
eq('ufDoTexto ponto final', ufDoTexto('Vitória/ES.'), 'ES');
eq('texto sem UF não casa', ufDoTexto('Guarulhos'), null);
eq('sigla inexistente não casa', ufDoTexto('Cidade/XX'), null);
// "DA" de "Boa Vista DA Aparecida" não é UF — o token precisa ser sigla real.
eq('conectivo de duas letras não vira UF', ufDoTexto('Sítio do Pomar da'), null);
eq('vazio/null', [ufDoTexto(''), ufDoTexto(null)], [null, null]);

eq(
  'domicílio fora de SP dispara',
  ufsForaDeSp({ ultimoDomicilio: 'Belo Horizonte/MG', registrosImoveis: [] }),
  ['MG'],
);
eq(
  'domicílio em SP não dispara',
  ufsForaDeSp({ ultimoDomicilio: 'Guarulhos/SP', registrosImoveis: [] }),
  [],
);
eq(
  'imóvel registrado fora dispara; SP e vazio não',
  ufsForaDeSp({
    ultimoDomicilio: 'Guarulhos/SP',
    registrosImoveis: ['1º Registro de Imóveis de Niterói/RJ', '2º RI de Guarulhos/SP', '', null],
  }),
  ['RJ'],
);
eq(
  'várias UFs, únicas e ordenadas',
  ufsForaDeSp({
    ultimoDomicilio: 'Curitiba/PR',
    registrosImoveis: ['RI de Florianópolis/SC', 'RI de Curitiba/PR', 'RI de Niterói/RJ'],
  }),
  ['PR', 'RJ', 'SC'],
);
eq(
  'texto livre sem sigla não dispara (melhor-esforço, nunca trava)',
  ufsForaDeSp({ ultimoDomicilio: 'residia em Minas Gerais', registrosImoveis: ['registro antigo'] }),
  [],
);

console.log(`\n${ok} passaram, ${fail} falharam\n`);
if (fail > 0) process.exit(1);
