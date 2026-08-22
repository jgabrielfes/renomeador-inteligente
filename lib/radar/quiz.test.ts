/**
 * Testes do quiz deontológico e da ordem aleatória fixa do Radar.
 *   npx tsx lib/radar/quiz.test.ts
 */

import { QUESTOES_RADAR, corrigirQuiz } from './quiz';
import { embaralharFixo } from './ordem';

let ok = 0, fail = 0;
function teste(nome: string, cond: boolean, detalhe?: string) {
  if (cond) ok++;
  else { fail++; console.error(`  ✗ ${nome}${detalhe ? `\n    ${detalhe}` : ''}`); }
}

console.log('\nRadar — quiz deontológico e ordem fixa\n');

/* ---------- quiz ---------- */

{
  teste('são 10 questões', QUESTOES_RADAR.length === 10);
  teste('ids únicos', new Set(QUESTOES_RADAR.map((q) => q.id)).size === 10);
  teste('toda questão tem 3 opções e correta válida', QUESTOES_RADAR.every(
    (q) => q.opcoes.length === 3 && q.correta >= 0 && q.correta < q.opcoes.length,
  ));

  const todasCertas = Object.fromEntries(QUESTOES_RADAR.map((q) => [q.id, q.correta]));
  const c1 = corrigirQuiz(todasCertas);
  teste('todas certas aprova', c1.aprovado && c1.acertos === 10 && c1.erradas.length === 0);

  const umaErrada = { ...todasCertas, captacao: (QUESTOES_RADAR[0].correta + 1) % 3 };
  const c2 = corrigirQuiz(umaErrada);
  teste('uma errada REPROVA (aprovação exige as 10)', !c2.aprovado && c2.acertos === 9);
  teste('a errada é apontada', c2.erradas.length === 1 && c2.erradas[0] === 'captacao');

  const c3 = corrigirQuiz({});
  teste('sem respostas reprova com todas erradas', !c3.aprovado && c3.erradas.length === 10);
}

/* ---------- ordem aleatória fixa ---------- */

{
  const itens = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
  const t1 = embaralharFixo(itens, 'token-familia-1');
  const t1b = embaralharFixo(itens, 'token-familia-1');
  const t2 = embaralharFixo(itens, 'token-familia-2');
  teste('mesma semente = MESMA ordem (recarregar não re-sorteia)', JSON.stringify(t1) === JSON.stringify(t1b));
  teste('sementes diferentes = ordens diferentes', JSON.stringify(t1) !== JSON.stringify(t2));
  teste('não perde nem duplica itens', [...t1].sort().join('') === itens.join(''));
  teste('não muta a entrada', itens[0] === 'a' && itens.length === 7);
  teste('alguma permutação de fato acontece', JSON.stringify(t1) !== JSON.stringify(itens) || JSON.stringify(t2) !== JSON.stringify(itens));
}

console.log(`\n${ok} passaram, ${fail} falharam\n`);
if (fail > 0) process.exit(1);
