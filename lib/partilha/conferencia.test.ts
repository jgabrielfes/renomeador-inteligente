/**
 * Casos de teste do conferidor de qualificação cruzada.
 *
 * Roda sem dependência externa:
 *   npx tsx lib/partilha/conferencia.test.ts
 */

import {
  conferirQualificacoes,
  type CertidaoCivilLida,
  type PessoaConferencia,
} from './conferencia';

let ok = 0, fail = 0;
function eq(nome: string, a: unknown, e: unknown) {
  if (JSON.stringify(a) === JSON.stringify(e)) ok++;
  else { fail++; console.error(`  ✗ ${nome}\n    esperado ${JSON.stringify(e)}\n    obtido   ${JSON.stringify(a)}`); }
}

console.log('\nConferidor de qualificação cruzada\n');

const pedro: PessoaConferencia = {
  id: 'h1',
  nome: 'Pedro da Silva',
  papel: 'HERDEIRO',
  estadoCivil: 'casado',
  conjugeNome: 'Joana Souza',
  casamentoRegime: 'comunhão parcial de bens',
  dataNascimento: '1980-05-10',
};

const casamentoPedro: CertidaoCivilLida = {
  tipo: 'CASAMENTO',
  pessoa: 'Pedro da Silva',
  conjuge: 'Joana Souza',
  dataCasamento: '2005-03-12',
  regime: 'comunhão parcial de bens',
  pactoAntenupcial: false,
  averbacaoDivorcio: false,
};

// Tudo confere → nenhuma divergência.
eq('sem divergência quando confere', conferirQualificacoes({
  pessoas: [pedro],
  certidoes: [casamentoPedro],
}).length, 0);

// Divórcio averbado × declarado casado → ALTA.
const divorcio = conferirQualificacoes({
  pessoas: [pedro],
  certidoes: [{ ...casamentoPedro, averbacaoDivorcio: true }],
});
eq('divórcio averbado: ALTA', divorcio[0]?.nivel, 'ALTA');
eq('divórcio averbado: mensagem', divorcio[0]?.mensagem.includes('AVERBAÇÃO DE DIVÓRCIO'), true);

// Declarado divorciado sem averbação → ALTA (trava a escritura).
const semAverbacao = conferirQualificacoes({
  pessoas: [{ ...pedro, estadoCivil: 'divorciado', conjugeNome: '' }],
  certidoes: [casamentoPedro],
});
eq('sem averbação: ALTA', semAverbacao.some((d) => d.nivel === 'ALTA' && d.mensagem.includes('NÃO tem averbação')), true);

// Casamento pré-1977 declarado como comunhão parcial → ALTA (universal legal).
const pre77 = conferirQualificacoes({
  pessoas: [pedro],
  certidoes: [{ ...casamentoPedro, dataCasamento: '1975-06-01', regime: null }],
});
eq('pré-77: regime legal era universal', pre77.some((d) => d.mensagem.includes('COMUNHÃO UNIVERSAL')), true);

// Regime da certidão diferente do declarado → ALTA.
const regimeDiverge = conferirQualificacoes({
  pessoas: [pedro],
  certidoes: [{ ...casamentoPedro, regime: 'comunhão universal de bens' }],
});
eq('regime divergente: ALTA', regimeDiverge.some((d) => d.nivel === 'ALTA' && d.mensagem.includes('Regime de bens divergente')), true);

// Regime que exige pacto, certidão sem menção → ATENÇÃO.
const semPacto = conferirQualificacoes({
  pessoas: [{ ...pedro, casamentoRegime: 'separação convencional' }],
  certidoes: [{ ...casamentoPedro, regime: null }],
});
eq('separação sem pacto: ATENÇÃO', semPacto.some((d) => d.nivel === 'ATENCAO' && d.mensagem.includes('PACTO')), true);

// Cônjuge declarado diferente do da certidão → ALTA.
const conjugeErrado = conferirQualificacoes({
  pessoas: [{ ...pedro, conjugeNome: 'Maria Oliveira' }],
  certidoes: [casamentoPedro],
});
eq('cônjuge divergente: ALTA', conjugeErrado.some((d) => d.mensagem.includes('não confere')), true);

// Grafia divergente (acento não conta; letra trocada conta) → ATENÇÃO.
const grafia = conferirQualificacoes({
  pessoas: [{ ...pedro, nome: 'Pedro da Silva Santos' }],
  certidoes: [casamentoPedro],
});
eq('grafia: ATENÇÃO', grafia.some((d) => d.nivel === 'ATENCAO' && d.mensagem.includes('Grafia')), true);

// Data de nascimento divergente na certidão de nascimento → ALTA.
const nascimento = conferirQualificacoes({
  pessoas: [pedro],
  certidoes: [{ tipo: 'NASCIMENTO', pessoa: 'Pedro da Silva', dataNascimento: '1980-05-11' }],
});
eq('nascimento divergente: ALTA', nascimento.some((d) => d.mensagem.includes('Data de nascimento divergente')), true);

// Óbito com data diferente da folha → ALTA.
const obito = conferirQualificacoes({
  pessoas: [{ id: '__falecido__', nome: 'João da Silva', papel: 'FALECIDO', estadoCivil: 'casado' }],
  certidoes: [{ tipo: 'OBITO', pessoa: 'João da Silva', dataObito: '2025-01-02' }],
  dataObitoInventario: '2025-01-01',
});
eq('óbito divergente: ALTA', obito.some((d) => d.mensagem.includes('Data do óbito divergente')), true);

// Solteiro com cônjuge preenchido e sem união estável → ATENÇÃO interna.
const solteiroComConjuge = conferirQualificacoes({
  pessoas: [{ ...pedro, estadoCivil: 'solteiro', uniaoEstavel: false }],
  certidoes: [],
});
eq('solteiro com cônjuge: ATENÇÃO', solteiroComConjuge.some((d) => d.mensagem.includes('sem união estável')), true);

// Com união estável marcada, convivente preenchido é coerente.
eq('união estável coerente', conferirQualificacoes({
  pessoas: [{ ...pedro, estadoCivil: 'solteiro', uniaoEstavel: true }],
  certidoes: [],
}).length, 0);

// ALTA vem antes de ATENÇÃO na ordenação.
const mista = conferirQualificacoes({
  pessoas: [{ ...pedro, nome: 'Pedro da Silva Santos' }],
  certidoes: [{ ...casamentoPedro, averbacaoDivorcio: true }],
});
eq('ALTA primeiro', mista[0]?.nivel, 'ALTA');

console.log(`\n${ok} passaram, ${fail} falharam\n`);
if (fail > 0) process.exit(1);
