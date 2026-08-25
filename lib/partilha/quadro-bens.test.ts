/**
 * Casos de teste do quadro da partilha POR BEM.
 *
 * Roda sem dependência externa:
 *   npx tsx lib/partilha/quadro-bens.test.ts
 */

import { montarQuadroPorBem } from './quadro-bens';
import type { Caso, Resultado } from './types';

let ok = 0, fail = 0;
function eq(nome: string, a: unknown, e: unknown) {
  if (JSON.stringify(a) === JSON.stringify(e)) ok++;
  else { fail++; console.error(`  ✗ ${nome}\n    esperado ${JSON.stringify(e)}\n    obtido   ${JSON.stringify(a)}`); }
}

console.log('\nQuadro da partilha por bem\n');

/** Viúva meeira + 3 filhos. Um bem comum de 600.000 e um particular de 90.000. */
const caso = {
  herdeiros: [
    { id: 'h1', nome: 'Ana' },
    { id: 'h2', nome: 'Beto' },
    { id: 'h3', nome: 'Caio' },
  ],
  sobrevivente: { nome: 'Marta' },
  bens: [
    { id: 'b1', descricao: 'Apartamento', valor: '600000.00', natureza: 'COMUM' },
    { id: 'b2', descricao: 'Terreno herdado', valor: '90000.00', natureza: 'PARTICULAR' },
  ],
} as unknown as Caso;

const resultado = {
  meacao: { beneficiario: 'Marta', fracao: '1/2', valor: '300000.00', fundamento: '' },
  quinhoes: [
    { herdeiroId: 'h1', nome: 'Ana', fracaoHeranca: '1/3', fracaoBemComum: '1/6', fracaoBemParticular: '1/3', valor: '130000.00' },
    { herdeiroId: 'h2', nome: 'Beto', fracaoHeranca: '1/3', fracaoBemComum: '1/6', fracaoBemParticular: '1/3', valor: '130000.00' },
    { herdeiroId: 'h3', nome: 'Caio', fracaoHeranca: '1/3', fracaoBemComum: '1/6', fracaoBemParticular: '1/3', valor: '130000.00' },
  ],
} as unknown as Resultado;

/* ---------- fração ideal (sem matriz) ---------- */

const q = montarQuadroPorBem(caso, resultado);

// O bem COMUM abre 4 linhas: a meação e os três quinhões de 1/6.
const doApto = q.linhas.filter((l) => l.bemId === 'b1');
eq('bem comum: 4 linhas', doApto.length, 4);
eq('meação vem primeiro e é marcada', [doApto[0].nome, doApto[0].meacao, doApto[0].proporcao], ['Marta', true, '1/2']);
eq('meação vale metade do bem', doApto[0].valor, 300_000);
eq('herdeiro fica com 1/6 do bem comum', [doApto[1].nome, doApto[1].proporcao, doApto[1].valor], ['Ana', '1/6', 100_000]);
eq('o bem comum fecha', doApto.reduce((a, l) => a + l.valor, 0), 600_000);

// O PARTICULAR não tem meação: 1/3 para cada filho.
const doTerreno = q.linhas.filter((l) => l.bemId === 'b2');
eq('bem particular: 3 linhas, sem meação', [doTerreno.length, doTerreno.some((l) => l.meacao)], [3, false]);
eq('herdeiro fica com 1/3 do particular', [doTerreno[0].proporcao, doTerreno[0].valor], ['1/3', 30_000]);
eq('o bem particular fecha', doTerreno.reduce((a, l) => a + l.valor, 0), 90_000);

eq('sem avisos quando tudo fecha', q.avisos, []);
eq('total do quadro', q.total, 690_000);

/* ---------- matriz da partilha diferenciada ---------- */

// O apartamento inteiro para Ana; o terreno dividido 33,33 entre os três —
// a normalização pela própria soma tem de dar 1/3 exato para cada.
const comMatriz = montarQuadroPorBem(caso, resultado, {
  b1: { h1: '100' },
  b2: { h1: '33,33', h2: '33,33', h3: '33,33' },
});
const aptoMatriz = comMatriz.linhas.filter((l) => l.bemId === 'b1');
eq('matriz manda: uma linha só no apartamento', [aptoMatriz.length, aptoMatriz[0].nome, aptoMatriz[0].valor], [1, 'Ana', 600_000]);
eq('matriz: a meação não é reinventada', aptoMatriz.some((l) => l.meacao), false);

const terrenoMatriz = comMatriz.linhas.filter((l) => l.bemId === 'b2');
eq('33,33 × 3 vira 1/3 cada', terrenoMatriz.map((l) => l.proporcao), ['1/3', '1/3', '1/3']);
eq('e o bem fecha sem centavo sobrando', terrenoMatriz.reduce((a, l) => a + l.valor, 0), 90_000);
eq('matriz completa não gera aviso', comMatriz.avisos, []);

/* ---------- matriz incompleta: avisa, não inventa ---------- */

const incompleta = montarQuadroPorBem(caso, resultado, { b1: { h1: '100' }, b2: { h1: '50' } });
// Uma célula sozinha normaliza para 100% do bem — o que avisa é a matriz que
// não esgota entre VÁRIOS: aqui o aviso não aparece, e é o certo.
eq('célula única normaliza para o bem inteiro', incompleta.linhas.filter((l) => l.bemId === 'b2')[0].valor, 90_000);

/* ---------- sem meação (solteiro) ---------- */

const semMeacao = montarQuadroPorBem(
  { ...caso, sobrevivente: undefined } as unknown as Caso,
  {
    meacao: null,
    quinhoes: [
      { herdeiroId: 'h1', nome: 'Ana', fracaoBemComum: '1/3', fracaoBemParticular: '1/3' },
      { herdeiroId: 'h2', nome: 'Beto', fracaoBemComum: '1/3', fracaoBemParticular: '1/3' },
      { herdeiroId: 'h3', nome: 'Caio', fracaoBemComum: '1/3', fracaoBemParticular: '1/3' },
    ],
  } as unknown as Resultado,
);
eq('sem meação: nenhuma linha de meação', semMeacao.linhas.some((l) => l.meacao), false);
eq('sem meação: os bens fecham', semMeacao.total, 690_000);

/* ---------- acervo vazio ---------- */

eq(
  'sem bens: quadro vazio, sem aviso',
  montarQuadroPorBem({ ...caso, bens: [] } as unknown as Caso, resultado),
  { linhas: [], avisos: [], total: 0 },
);

console.log(`\n${ok} passaram, ${fail} falharam\n`);
process.exit(fail === 0 ? 0 : 1);
