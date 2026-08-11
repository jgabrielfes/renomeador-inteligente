import { triagem } from './triagem';
import { montarChecklistAcervo, CATALOGO_ACERVO } from './acervo';
import { gerarPosEscritura } from './posescritura';
import { partilhar } from './engine';
import { apurarAtribuicao } from './atribuicao';
import type { Caso } from './types';

let ok = 0, fail = 0;
function eq(nome: string, a: unknown, e: unknown) {
  if (JSON.stringify(a) === JSON.stringify(e)) ok++;
  else { fail++; console.error(`  ✗ ${nome}\n    esperado ${JSON.stringify(e)}\n    obtido   ${JSON.stringify(a)}`); }
}

console.log('\nMódulos — triagem, acervo, pós-escritura\n');

// triagem: caso limpo -> extrajudicial
const limpa = triagem({ todosMaioresECapazes: true, consensoEntreHerdeiros: true, existeTestamento: false, herdeiroNoExterior: false, bemNoExterior: false, falecidoDeixouDividasRelevantes: false, uf: 'SP' });
eq('triagem limpa', limpa.via, 'EXTRAJUDICIAL');
eq('triagem limpa sem impedimentos', limpa.impedimentos.length, 0);

// incapaz -> judicial, fatal
const incapaz = triagem({ todosMaioresECapazes: false, consensoEntreHerdeiros: true, existeTestamento: false, herdeiroNoExterior: false, bemNoExterior: false, falecidoDeixouDividasRelevantes: false, uf: 'SP' });
eq('incapaz -> judicial', incapaz.via, 'JUDICIAL');
eq('incapaz é fatal', incapaz.impedimentos[0].contornavel, false);

// testamento não cumprido -> condicionada
const test = triagem({ todosMaioresECapazes: true, consensoEntreHerdeiros: true, existeTestamento: true, testamentoCumpridoJudicialmente: false, herdeiroNoExterior: false, bemNoExterior: false, falecidoDeixouDividasRelevantes: false, uf: 'SP' });
eq('testamento -> condicionada', test.via, 'EXTRAJUDICIAL_CONDICIONADA');

// testamento cumprido + herdeiro no exterior -> extrajudicial com condição
const ext = triagem({ todosMaioresECapazes: true, consensoEntreHerdeiros: true, existeTestamento: true, testamentoCumpridoJudicialmente: true, herdeiroNoExterior: true, bemNoExterior: false, falecidoDeixouDividasRelevantes: false, uf: 'SP' });
eq('cumprido + exterior -> extrajudicial', ext.via, 'EXTRAJUDICIAL');
eq('condição de procuração emitida', ext.condicoes.length, 1);

// acervo: testamento em primeiro, ids únicos
const chk = montarChecklistAcervo();
eq('acervo: testamento primeiro', chk[0].fonte.id, 'censec-testamento');
eq('acervo: ids únicos', new Set(CATALOGO_ACERVO.map(f => f.id)).size, CATALOGO_ACERVO.length);

// pós-escritura: caso com imóvel + veículo + torna gratuita
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
const tarefas = gerarPosEscritura(caso, r, at);
const ids = tarefas.map(t => t.id);
eq('pós: registro do imóvel', ids.some(i => i.startsWith('imovel')), true);
eq('pós: transferência do veículo', ids.some(i => i.startsWith('veiculo')), true);
eq('pós: ITCMD da doação gerado pela torna', ids.includes('itcmd-doacao'), true);
eq('pós: final de espólio sempre presente', ids.includes('ir-espolio-final'), true);
eq('pós: sem ITBI quando gratuito', ids.includes('itbi-torna'), false);
eq('pós: prioridade 1 primeiro', tarefas[0].prioridade, 1);

console.log(`\n${ok} passaram, ${fail} falharam\n`);
if (fail > 0) process.exit(1);
