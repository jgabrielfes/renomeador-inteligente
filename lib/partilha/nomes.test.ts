/**
 * Casos de teste da comparação de nomes.
 *
 * Roda sem dependência externa:
 *   npx tsx lib/partilha/nomes.test.ts
 */

import { nomeConstaEm, palavrasDoNome, semQualificadoresDeNome } from './nomes';

let ok = 0, fail = 0;
function eq(nome: string, a: unknown, e: unknown) {
  if (JSON.stringify(a) === JSON.stringify(e)) ok++;
  else { fail++; console.error(`  ✗ ${nome}\n    esperado ${JSON.stringify(e)}\n    obtido   ${JSON.stringify(a)}`); }
}

console.log('\nNomes — comparação por palavras e qualificadores\n');

eq('palavras sem conectivos', palavrasDoNome('Francisco Dimas da Silva'), ['FRANCISCO', 'DIMAS', 'SILVA']);
eq('acentos normalizados', palavrasDoNome('Janaína Ísis'), ['JANAINA', 'ISIS']);

// O caso real: certidão de óbito declara só o prenome; a ficha tem o completo.
eq('declarado parcial consta na ficha', nomeConstaEm('Pedro Vitor', 'Pedro Vitor Barros Silva'), true);
eq('acento não atrapalha', nomeConstaEm('Janaina Isis', 'Janaína Ísis Barros Silva'), true);
eq('pessoa diferente não consta', nomeConstaEm('Maria Souza', 'Pedro Vitor Barros Silva'), false);

// O caso real da matrícula 194.868: o falecido no MEIO do registro
// aquisitivo, com RG/CPF e qualificação entre os nomes.
eq(
  'falecido consta no registro aquisitivo',
  nomeConstaEm(
    'Francisco Dimas da Silva',
    'Por escritura de 06/11/1986, o imóvel foi VENDIDO a FRANCISCO DIMAS DA SILVA (RG nº 8.841.797-SP e CPF 858.166.048-72), brasileiro, solteiro, maior, industrial',
  ),
  true,
);
eq(
  'proprietária da abertura NÃO é o falecido',
  nomeConstaEm('Francisco Dimas da Silva', 'JOANA PONTES LANCHI, viúva, comerciante'),
  false,
);
// A sequência é obrigatória: "João" de UMA pessoa + "Silva" de OUTRA não
// formam "João da Silva" (o caso da grafia divergente do antecipador).
eq(
  'palavras de pessoas diferentes não somam',
  nomeConstaEm('João da Silva', 'Joao Silveira, casado com Maria da Silva'),
  false,
);

// Qualificadores da certidão de óbito não são nome.
eq('", Maior" sai', semQualificadoresDeNome('Pedro Vitor, Maior'), 'Pedro Vitor');
eq('"maiores" sai', semQualificadoresDeNome('Janaina Isis, maiores'), 'Janaina Isis');
eq('"menor impúbere" sai', semQualificadoresDeNome('Ana Clara, menor impúbere'), 'Ana Clara');
eq('"maior e capaz" sai', semQualificadoresDeNome('José Carlos, maior e capaz'), 'José Carlos');
eq('idade sai', semQualificadoresDeNome('Beatriz, 22 anos'), 'Beatriz');
eq('"maior de idade" sai', semQualificadoresDeNome('Lucas, maior de idade'), 'Lucas');
eq('nome limpo passa intacto', semQualificadoresDeNome('Pedro Vitor Barros Silva'), 'Pedro Vitor Barros Silva');
eq('sobrenome "Maior" no meio fica', semQualificadoresDeNome('João Maior da Silva'), 'João Maior da Silva');

console.log(`\n${ok} passaram, ${fail} falharam\n`);
if (fail > 0) process.exit(1);
