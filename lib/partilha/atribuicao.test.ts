import { partilhar } from './engine';
import { apurarAtribuicao, TABELA_SP_2026 } from './atribuicao';
import type { Caso } from './types';

let ok = 0;
let fail = 0;

function eq(nome: string, atual: unknown, esperado: unknown) {
  const a = JSON.stringify(atual);
  const e = JSON.stringify(esperado);
  if (a === e) ok += 1;
  else {
    fail += 1;
    console.error(`  ✗ ${nome}\n      esperado: ${e}\n      obtido:   ${a}`);
  }
}

/** Viúva + 2 filhos, imóvel comum de R$ 900.000. */
const caso: Caso = {
  falecido: { dataObito: '2026-03-14' },
  sobrevivente: { vinculo: 'CASAMENTO', regime: 'COMUNHAO_PARCIAL', nome: 'Viúva' },
  herdeiros: [
    { id: 'f1', nome: 'Filho A', classe: 'DESCENDENTE', grau: 1, status: 'ATIVO', filhoDoSobrevivente: true },
    { id: 'f2', nome: 'Filho B', classe: 'DESCENDENTE', grau: 1, status: 'ATIVO', filhoDoSobrevivente: true },
  ],
  bens: [{ id: 'imovel', descricao: 'Imóvel mat. 12.345', valor: '900000.00', natureza: 'COMUM' }],
};

console.log('\nCamada de atribuição — usufruto sobre o bem inteiro\n');

const r = partilhar(caso);
eq('direito · meação', r.meacao?.valor, '450000.00');
eq('direito · quinhões', r.quinhoes.map((q) => [q.herdeiroId, q.valor]), [
  ['f1', '225000.00'],
  ['f2', '225000.00'],
]);

// Viúva reserva usufruto do bem inteiro; filhos ficam com a nua-propriedade.
const a = apurarAtribuicao(caso, r, {
  titularidades: [
    { bemId: 'imovel', titularId: '__sobrevivente__', direito: 'USUFRUTO', fracao: '1' },
    { bemId: 'imovel', titularId: 'f1', direito: 'NUA_PROPRIEDADE', fracao: '1/2' },
    { bemId: 'imovel', titularId: 'f2', direito: 'NUA_PROPRIEDADE', fracao: '1/2' },
  ],
});

eq('sem bloqueios', a.bloqueios, []);
eq(
  'posições',
  a.posicoes.map((p) => [p.nome, p.valorDeDireito, p.valorAtribuido, p.delta]),
  [
    ['Viúva', '450000.00', '300000.00', '-150000.00'],
    ['Filho A', '225000.00', '300000.00', '75000.00'],
    ['Filho B', '225000.00', '300000.00', '75000.00'],
  ],
);
eq('torna total', a.totalTorna, '150000.00');
eq(
  'transferências (cessão gratuita)',
  a.transferencias.map((t) => [t.cessionarioNome, t.valor, t.tributo, t.imposto]),
  [
    ['Filho A', '75000.00', 'ITCMD_DOACAO', '3000.00'],
    ['Filho B', '75000.00', 'ITCMD_DOACAO', '3000.00'],
  ],
);

// Mesma partilha, mas com reposição em dinheiro: muda o tributo e a competência.
const b = apurarAtribuicao(caso, r, {
  titularidades: [
    { bemId: 'imovel', titularId: '__sobrevivente__', direito: 'USUFRUTO', fracao: '1' },
    { bemId: 'imovel', titularId: 'f1', direito: 'NUA_PROPRIEDADE', fracao: '1/2' },
    { bemId: 'imovel', titularId: 'f2', direito: 'NUA_PROPRIEDADE', fracao: '1/2' },
  ],
  titulosPorCedente: { __sobrevivente__: 'ONEROSO' },
});
eq(
  'cessão onerosa vira ITBI municipal',
  b.transferencias.map((t) => [t.tributo, t.competencia, t.imposto]),
  [
    ['ITBI', 'MUNICIPAL', null],
    ['ITBI', 'MUNICIPAL', null],
  ],
);

// Partilha sem desvio: usufruto na proporção do direito não gera torna.
const semTorna = apurarAtribuicao(caso, r, {
  titularidades: [
    { bemId: 'imovel', titularId: '__sobrevivente__', direito: 'PLENA', fracao: '1/2' },
    { bemId: 'imovel', titularId: 'f1', direito: 'PLENA', fracao: '1/4' },
    { bemId: 'imovel', titularId: 'f2', direito: 'PLENA', fracao: '1/4' },
  ],
});
eq('partilha proporcional · sem torna', semTorna.totalTorna, '0.00');
eq('partilha proporcional · sem fato gerador', semTorna.transferencias.length, 0);

// Invariante: titularidades que não esgotam o bem bloqueiam.
const errada = apurarAtribuicao(caso, r, {
  titularidades: [
    { bemId: 'imovel', titularId: '__sobrevivente__', direito: 'USUFRUTO', fracao: '1' },
    { bemId: 'imovel', titularId: 'f1', direito: 'NUA_PROPRIEDADE', fracao: '1/2' },
  ],
});
eq('bloqueio de bem não esgotado', errada.bloqueios.length > 0, true);

// Alerta de teto anual de isenção.
const comTeto = apurarAtribuicao(caso, r, {
  titularidades: [
    { bemId: 'imovel', titularId: '__sobrevivente__', direito: 'USUFRUTO', fracao: '1' },
    { bemId: 'imovel', titularId: 'f1', direito: 'NUA_PROPRIEDADE', fracao: '1/2' },
    { bemId: 'imovel', titularId: 'f2', direito: 'NUA_PROPRIEDADE', fracao: '1/2' },
  ],
  tabela: { ...TABELA_SP_2026, isencaoDoacaoAnualPorDonatario: '92500.00' },
});
eq(
  'dentro do teto: observação de isento',
  comTeto.transferencias[0].observacao?.includes('Isento'),
  true,
);
eq('dentro do teto: ITCMD zerado por cabeça', comTeto.transferencias[0].imposto, '0.00');

console.log(`\n${ok} passaram, ${fail} falharam\n`);
if (fail > 0) process.exit(1);
