/**
 * Casos de teste do checklist de pendências da minuta.
 *
 * Roda sem dependência externa:
 *   npx tsx lib/partilha/pendencias.test.ts
 */

import { pendenciasDaMinuta, agruparPendencias, type EntradaPendencias } from './pendencias';
import { QUALIFICACAO_VAZIA, type Qualificacao } from './familia';
import type { Bem, Herdeiro } from './types';

let ok = 0, fail = 0;
function eq(nome: string, a: unknown, e: unknown) {
  if (JSON.stringify(a) === JSON.stringify(e)) ok++;
  else { fail++; console.error(`  ✗ ${nome}\n    esperado ${JSON.stringify(e)}\n    obtido   ${JSON.stringify(a)}`); }
}

console.log('\nPendências da minuta\n');

const qCompleta: Qualificacao = {
  ...QUALIFICACAO_VAZIA,
  cpf: '111', rg: '222', dataNascimento: '1970-01-01', filiacao: 'A e B',
  profissao: 'engenheiro', estadoCivil: 'solteiro', endereco: 'Rua X, 1', cidade: 'Guarulhos', uf: 'SP',
};

const herdeiro: Herdeiro = {
  id: 'h1', nome: 'Pedro', classe: 'DESCENDENTE', grau: 1, status: 'ATIVO',
};

const base: EntradaPendencias = {
  falecido: { nome: 'João', cpf: '000', dataObito: '2025-01-01', dataCasamento: '', ultimoDomicilio: '', certidaoObito: 'matrícula 1' },
  qualificacaoFalecido: qCompleta,
  temSobrevivente: false,
  nomeSobrev: '',
  herdeiros: [herdeiro],
  qualificacoes: { h1: qCompleta },
  bens: [],
};

// Caso completo (sem bens) → sem pendências.
eq('caso completo sem pendências', pendenciasDaMinuta(base).length, 0);

// Falta CPF e óbito do falecido.
const semFalecido = pendenciasDaMinuta({
  ...base,
  falecido: { ...base.falecido, cpf: '', dataObito: '' },
});
eq('falta CPF e óbito do autor', semFalecido.map((p) => p.rotulo), ['CPF', 'Data do óbito']);
eq('grupo é o autor da herança', semFalecido[0].grupo, 'Autor(a) da herança');

// Herdeiro sem qualificação → vários itens no grupo dele.
const semQualHerdeiro = pendenciasDaMinuta({
  ...base,
  qualificacoes: { h1: { ...QUALIFICACAO_VAZIA } },
});
const grupoHerdeiro = agruparPendencias(semQualHerdeiro).find((g) => g.grupo.includes('Pedro'));
eq('herdeiro sem CPF/RG/endereço', grupoHerdeiro?.itens.includes('CPF') && grupoHerdeiro?.itens.includes('Endereço completo'), true);

// Herdeiro casado sem cônjuge → pede cônjuge e casamento.
const casado = pendenciasDaMinuta({
  ...base,
  qualificacoes: { h1: { ...qCompleta, estadoCivil: 'casado' } },
});
eq('casado pede cônjuge e regime', casado.some((p) => p.rotulo === 'Nome do cônjuge') && casado.some((p) => p.rotulo === 'Regime de bens'), true);

// Imóvel sem matrícula → pendências do bem.
const imovel: Bem = { id: 'b1', descricao: 'Apartamento', valor: '400000.00', natureza: 'COMUM', tipo: 'IMOVEL' };
const comImovel = pendenciasDaMinuta({ ...base, bens: [imovel] });
const grupoBem = agruparPendencias(comImovel).find((g) => g.grupo.startsWith('Bem 1'));
eq('imóvel pede matrícula e RI', grupoBem?.itens.includes('Número da matrícula') && grupoBem?.itens.includes('Cartório de registro de imóveis'), true);
eq('imóvel com valor não pede valor', grupoBem?.itens.includes('Valor atribuído'), false);

// Sobrevivente sem certidão de casamento.
const comViuva = pendenciasDaMinuta({
  ...base,
  temSobrevivente: true,
  nomeSobrev: 'Maria',
  qualificacaoSobrevivente: qCompleta,
  falecido: { ...base.falecido, certidaoCasamento: '' },
});
eq('viúva pede certidão de casamento', comViuva.some((p) => p.rotulo === 'Certidão de casamento com o(a) falecido(a)'), true);

// Financeiro sempre pede preenchimento manual.
const financeiro: Bem = { id: 'b2', descricao: 'Conta', valor: '10000.00', natureza: 'COMUM', tipo: 'FINANCEIRO' };
const comFin = pendenciasDaMinuta({ ...base, bens: [financeiro] });
eq('financeiro pede banco/agência/conta', comFin.some((p) => p.rotulo.includes('Banco')), true);

console.log(`\n${ok} passaram, ${fail} falharam\n`);
if (fail > 0) process.exit(1);
