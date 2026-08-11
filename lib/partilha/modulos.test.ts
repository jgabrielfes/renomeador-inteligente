import { montarChecklistAcervo, CATALOGO_ACERVO } from './acervo';
import { partilhar } from './engine';
import { apurarAtribuicao } from './atribuicao';
import type { Caso } from './types';

let ok = 0, fail = 0;
function eq(nome: string, a: unknown, e: unknown) {
  if (JSON.stringify(a) === JSON.stringify(e)) ok++;
  else { fail++; console.error(`  ✗ ${nome}\n    esperado ${JSON.stringify(e)}\n    obtido   ${JSON.stringify(a)}`); }
}

console.log('\nMódulos — acervo e atribuição\n');

// acervo: testamento em primeiro, ids únicos
const chk = montarChecklistAcervo();
eq('acervo: testamento primeiro', chk[0].fonte.id, 'censec-testamento');
eq('acervo: ids únicos', new Set(CATALOGO_ACERVO.map(f => f.id)).size, CATALOGO_ACERVO.length);

// atribuição: caso com imóvel + veículo, usufruto ao sobrevivente
const caso: Caso = {
  falecido: { dataObito: '2026-03-14' },
  sobrevivente: { vinculo: 'CASAMENTO', regime: 'COMUNHAO_PARCIAL', nome: 'Viúva' },
  herdeiros: [
    { id: 'f1', nome: 'A', classe: 'DESCENDENTE', grau: 1, status: 'ATIVO', filhoDoSobrevivente: true },
    { id: 'f2', nome: 'B', classe: 'DESCENDENTE', grau: 1, status: 'ATIVO', filhoDoSobrevivente: true },
  ],
  bens: [
    { id: 'im', descricao: 'Imóvel mat. 12.345', valor: '900000.00', natureza: 'COMUM' },
    { id: 'car', descricao: 'Veículo Corolla placa ABC1D23', valor: '90000.00', natureza: 'COMUM' },
  ],
};
const r = partilhar(caso);
eq('partilha sem bloqueios', r.bloqueios.length, 0);
const at = apurarAtribuicao(caso, r, {
  titularidades: [
    { bemId: 'im', titularId: '__sobrevivente__', direito: 'USUFRUTO', fracao: '1' },
    { bemId: 'im', titularId: 'f1', direito: 'NUA_PROPRIEDADE', fracao: '1/2' },
    { bemId: 'im', titularId: 'f2', direito: 'NUA_PROPRIEDADE', fracao: '1/2' },
    { bemId: 'car', titularId: '__sobrevivente__', direito: 'USUFRUTO', fracao: '1' },
    { bemId: 'car', titularId: 'f1', direito: 'NUA_PROPRIEDADE', fracao: '1/2' },
    { bemId: 'car', titularId: 'f2', direito: 'NUA_PROPRIEDADE', fracao: '1/2' },
  ],
});
eq('atribuição sem bloqueios', at.bloqueios.length, 0);
eq('atribuição tem transferências (torna)', at.transferencias.length > 0, true);

console.log(`\n${ok} passaram, ${fail} falharam\n`);
if (fail > 0) process.exit(1);
