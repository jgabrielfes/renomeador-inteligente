/**
 * Casos de teste da fusão de imóveis multi-inscrição.
 *
 * Roda sem dependência externa:
 *   npx tsx lib/partilha/imoveis.test.ts
 */

import { baseDaInscricao, fundirImoveisPorInscricao, type BemFundivel } from './imoveis';

let ok = 0, fail = 0;
function eq(nome: string, a: unknown, e: unknown) {
  if (JSON.stringify(a) === JSON.stringify(e)) ok++;
  else { fail++; console.error(`  ✗ ${nome}\n    esperado ${JSON.stringify(e)}\n    obtido   ${JSON.stringify(a)}`); }
}

console.log('\nImóveis — fusão por inscrição municipal\n');

eq('base da inscrição de Guarulhos', baseDaInscricao('084.33.20.0048.01.000'), '084.33.20.0048');
eq('inscrições irmãs têm a mesma base', baseDaInscricao('084.33.20.0048.02.000'), '084.33.20.0048');
eq('inscrição curta não tem base', baseDaInscricao('084.33.20'), null);
eq('sem inscrição', baseDaInscricao(null), null);

// O caso de Guarulhos: um imóvel, duas inscrições → UM bem com valores somados.
const guarulhos: BemFundivel[] = [
  {
    descricao: 'R. Itapetininga, 173',
    valor: '50000.00',
    tipo: 'IMOVEL',
    imovel: { inscricaoCadastral: '084.33.20.0048.01.000', valorVenalObito: '50000.00', matricula: null },
  },
  {
    descricao: 'R. Itapetininga, 173 (inscrição 02)',
    valor: '24944.29',
    tipo: 'IMOVEL',
    imovel: { inscricaoCadastral: '084.33.20.0048.02.000', valorVenalObito: '24944.29', matricula: null },
  },
];
const fundidos = fundirImoveisPorInscricao(guarulhos);
eq('duas inscrições viram um bem', fundidos.length, 1);
eq('valores somados', fundidos[0].valor, '74944.29');
eq('venais do óbito somados', fundidos[0].imovel?.valorVenalObito, '74944.29');
eq('inscrições listadas', fundidos[0].imovel?.inscricaoCadastral, '084.33.20.0048.01.000 e 084.33.20.0048.02.000');
eq('descrição do principal mantida', fundidos[0].descricao, 'R. Itapetininga, 173');

// Frações ideais das inscrições se SOMAM na fusão (devem fechar 100%).
const comFracao = fundirImoveisPorInscricao([
  { descricao: 'Casa', valor: '50.00', tipo: 'IMOVEL', imovel: { inscricaoCadastral: '084.33.20.0048.01.000', fracaoIdeal: '60.00', matricula: null } },
  { descricao: 'Casa (02)', valor: '40.00', tipo: 'IMOVEL', imovel: { inscricaoCadastral: '084.33.20.0048.02.000', fracaoIdeal: '40.00', matricula: null } },
]);
eq('frações ideais somadas', comFracao[0].imovel?.fracaoIdeal, '100.00');

// Matrícula igual também funde (mesmo sem inscrição).
const porMatricula = fundirImoveisPorInscricao([
  { descricao: 'Apto 12', valor: '300000.00', tipo: 'IMOVEL', imovel: { matricula: '12.345', inscricaoCadastral: null } },
  { descricao: 'Vaga de garagem', valor: '40000.00', tipo: 'IMOVEL', imovel: { matricula: '12345', inscricaoCadastral: null } },
]);
eq('matrícula igual funde', porMatricula.length, 1);
eq('soma pela matrícula', porMatricula[0].valor, '340000.00');

// Bases diferentes NÃO fundem; bens não-imóveis passam intactos.
const distintos = fundirImoveisPorInscricao([
  { descricao: 'Casa A', valor: '100000.00', tipo: 'IMOVEL', imovel: { inscricaoCadastral: '084.33.20.0048.01.000', matricula: null } },
  { descricao: 'Casa B', valor: '200000.00', tipo: 'IMOVEL', imovel: { inscricaoCadastral: '099.11.22.0033.01.000', matricula: null } },
  { descricao: 'CDB', valor: '50000.00', tipo: 'FINANCEIRO' },
]);
eq('bases diferentes não fundem', distintos.length, 3);

// Campo vazio do principal é preenchido pelo fundido.
const preenche = fundirImoveisPorInscricao([
  { descricao: 'Casa', valor: '10.00', tipo: 'IMOVEL', imovel: { matricula: '777', inscricaoCadastral: null, registroImoveis: null } },
  { descricao: 'Casa 2', valor: '20.00', tipo: 'IMOVEL', imovel: { matricula: '777', inscricaoCadastral: null, registroImoveis: '1º RI de Guarulhos' } },
]);
eq('campo vazio preenchido na fusão', preenche[0].imovel?.registroImoveis, '1º RI de Guarulhos');

console.log(`\n${ok} passaram, ${fail} falharam\n`);
if (fail > 0) process.exit(1);
