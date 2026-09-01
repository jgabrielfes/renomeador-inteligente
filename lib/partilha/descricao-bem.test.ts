/**
 * Testes do helper de descrição do bem para as minutas em texto.
 *   npx tsx lib/partilha/descricao-bem.test.ts
 */

import { descricaoBemMinuta } from './descricao-bem';
import type { Bem } from './types';

let ok = 0,
  fail = 0;
function eq(nome: string, a: unknown, e: unknown) {
  if (JSON.stringify(a) === JSON.stringify(e)) ok++;
  else {
    fail++;
    console.error(`  ✗ ${nome}\n    esperado ${JSON.stringify(e)}\n    obtido   ${JSON.stringify(a)}`);
  }
}
function teste(nome: string, cond: boolean, det?: string) {
  if (cond) ok++;
  else {
    fail++;
    console.error(`  ✗ ${nome}${det ? `\n    ${det}` : ''}`);
  }
}

console.log('\nDescrição do bem para minutas (prioriza a matrícula)\n');

// Sem dados de matrícula: cai na descrição curta digitada.
eq(
  'imóvel sem matrícula lida → descrição curta',
  descricaoBemMinuta({
    id: '1',
    descricao: 'Apartamento na Rua X',
    valor: '100000.00',
    natureza: 'COMUM',
    tipo: 'IMOVEL',
  }),
  'Apartamento na Rua X',
);

// Bem não-imóvel: sempre a descrição curta.
eq(
  'veículo → descrição curta',
  descricaoBemMinuta({ id: '2', descricao: 'Corolla 2020', valor: '80000.00', natureza: 'COMUM', tipo: 'VEICULO' }),
  'Corolla 2020',
);

// Imóvel COM matrícula lida: descrição integral + registro + aquisição + cadastro.
{
  const b: Bem = {
    id: '3',
    descricao: 'Apartamento 402',
    valor: '620000.00',
    natureza: 'COMUM',
    tipo: 'IMOVEL',
    imovel: {
      descricaoMatricula:
        'APARTAMENTO nº 402, do Edifício Fatto, com área privativa de 62,000m², averbada a construção pela Av.3',
      aquisicao: 'R.4',
      matricula: '12.345',
      registroImoveis: '1º Registro de Imóveis de Guarulhos/SP',
      municipio: 'Guarulhos/SP',
      inscricaoCadastral: '084.33.20.0048.01.000',
    },
  };
  const t = descricaoBemMinuta(b);
  teste('usa a descrição INTEGRAL da matrícula (não a curta)', t.startsWith('APARTAMENTO nº 402'), t);
  teste('não usa a descrição curta do acervo', !t.includes('Apartamento 402'), t);
  teste('inclui a averbação da matrícula', t.includes('Av.3'), t);
  teste('inclui matrícula + Registro de Imóveis', t.includes('matrícula nº 12.345 do 1º Registro de Imóveis de Guarulhos/SP'), t);
  teste('inclui a forma de aquisição (R.4)', t.includes('força do R.4'), t);
  teste('inclui a inscrição municipal', t.includes('inscrição municipal nº 084.33.20.0048.01.000'), t);
}

console.log(`\n${ok} passaram, ${fail} falharam\n`);
if (fail > 0) process.exit(1);
