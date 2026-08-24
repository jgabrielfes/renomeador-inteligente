/**
 * Testes do gate de candidatura do Radar Sucessório (teto 2 + plano).
 *   npx tsx lib/radar/candidatura.test.ts
 */

import {
  marcadorCandidaturas,
  podeCandidatar,
  TETO_CANDIDATURAS_POR_CASO,
} from './candidatura';

let ok = 0, fail = 0;
function teste(nome: string, cond: boolean, detalhe?: string) {
  if (cond) ok++;
  else { fail++; console.error(`  ✗ ${nome}${detalhe ? `\n    ${detalhe}` : ''}`); }
}

console.log('\nRadar — gate de candidatura (teto 2 + plano)\n');

teste('teto é 2 (decisão do escritório)', TETO_CANDIDATURAS_POR_CASO === 2);

teste(
  'caso vazio + plano ok → pode',
  podeCandidatar({ planoPermite: true, jaCandidato: false, candidaturas: 0 }).pode,
);
teste(
  '1/2 + plano ok → ainda pode',
  podeCandidatar({ planoPermite: true, jaCandidato: false, candidaturas: 1 }).pode,
);
{
  const g = podeCandidatar({ planoPermite: true, jaCandidato: false, candidaturas: 2 });
  teste('2/2 → caso completo', !g.pode && g.motivo === 'caso-completo');
}
{
  const g = podeCandidatar({ planoPermite: true, jaCandidato: false, candidaturas: 7 });
  teste('acima do teto (dado sujo) → caso completo', !g.pode && g.motivo === 'caso-completo');
}
{
  const g = podeCandidatar({ planoPermite: true, jaCandidato: true, candidaturas: 1 });
  teste('já candidato → bloqueia antes do teto', !g.pode && g.motivo === 'ja-candidato');
}
{
  const g = podeCandidatar({ planoPermite: false, jaCandidato: false, candidaturas: 0 });
  teste('sem plano → bloqueia mesmo com vaga', !g.pode && g.motivo === 'sem-plano');
}
{
  const g = podeCandidatar({ planoPermite: false, jaCandidato: true, candidaturas: 2 });
  teste('sem plano vem primeiro (mensagem certa ao usuário)', !g.pode && g.motivo === 'sem-plano');
}

teste('marcador 0', marcadorCandidaturas(0) === '0/2 advogado(a)s');
teste('marcador 1', marcadorCandidaturas(1) === '1/2 advogado(a)s');
teste('marcador 2', marcadorCandidaturas(2) === '2/2 advogado(a)s');
teste('marcador nunca passa do teto', marcadorCandidaturas(9) === '2/2 advogado(a)s');
teste('marcador nunca fica negativo', marcadorCandidaturas(-1) === '0/2 advogado(a)s');

console.log(`\n${ok} passaram, ${fail} falharam\n`);
if (fail > 0) process.exit(1);
