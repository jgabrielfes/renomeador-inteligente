/**
 * Casos de teste do motor de honorários (complexidade + sugestão).
 *
 * Roda sem dependência externa:
 *   npx tsx lib/partilha/honorarios.test.ts
 */

import {
  avaliarComplexidade,
  sugerirHonorarios,
  valorContratado,
  PISO_SUGERIDO,
  type EntradaComplexidade,
} from './honorarios';

let ok = 0, fail = 0;
function eq(nome: string, a: unknown, e: unknown) {
  if (JSON.stringify(a) === JSON.stringify(e)) ok++;
  else { fail++; console.error(`  ✗ ${nome}\n    esperado ${JSON.stringify(e)}\n    obtido   ${JSON.stringify(a)}`); }
}

console.log('\nHonorários — complexidade e sugestão\n');

const BASE: EntradaComplexidade = {
  qtdHerdeiros: 2,
  temPreMorto: false,
  temRenunciante: false,
  temMenorOuIncapaz: false,
  temSobrevivente: true,
  qtdBens: 2,
  qtdImoveis: 1,
  temQuotasSocietarias: false,
  temDividas: false,
  temPartilhaDiferenciada: false,
  monteMor: 500_000,
};

// Caso simples: viúva + 2 filhos, 1 imóvel + saldo — baixa, 3%.
const simples = avaliarComplexidade(BASE);
eq('caso simples: sem fatores', simples.fatores.length, 0);
eq('caso simples: nível baixo', simples.nivel, 'BAIXA');
eq('caso simples: 3%', simples.percentualSugerido, 3);
eq('caso simples: sem parecer do MP', simples.exigeParecerMp, false);

// Menor/incapaz sozinho já leva a médio e exige o parecer do MP na
// extrajudicial (Res. CNJ 571/2024 — não veda mais a escritura).
const comMenor = avaliarComplexidade({ ...BASE, temMenorOuIncapaz: true });
eq('menor: 3 pontos', comMenor.pontos, 3);
eq('menor: nível médio', comMenor.nivel, 'MEDIA');
eq('menor: exige parecer do MP', comMenor.exigeParecerMp, true);

// Caso carregado: pré-morto + quotas + partilha diferenciada + monte alto = alta.
const carregado = avaliarComplexidade({
  ...BASE,
  temPreMorto: true,
  temQuotasSocietarias: true,
  temPartilhaDiferenciada: true,
  monteMor: 6_000_000,
});
eq('carregado: 8 pontos', carregado.pontos, 8);
eq('carregado: nível alto', carregado.nivel, 'ALTA');
eq('carregado: 6%', carregado.percentualSugerido, 6);

// Faixas de herdeiros e de bens não se acumulam entre si.
const seisHerdeiros = avaliarComplexidade({ ...BASE, qtdHerdeiros: 6 });
eq('6 herdeiros: 1 ponto', seisHerdeiros.pontos, 1);
const dezoito = avaliarComplexidade({ ...BASE, qtdHerdeiros: 18 });
eq('18 herdeiros: 2 pontos (faixa única)', dezoito.pontos, 2);
const seteBens = avaliarComplexidade({ ...BASE, qtdBens: 7 });
eq('7 bens: 1 ponto', seteBens.pontos, 1);
const dozeBens = avaliarComplexidade({ ...BASE, qtdBens: 12 });
eq('12 bens: 2 pontos (faixa única)', dozeBens.pontos, 2);

// Monte-mor: faixas exclusivas; null não pontua nem quebra.
const monteMedio = avaliarComplexidade({ ...BASE, monteMor: 2_000_000 });
eq('monte 2M: 1 ponto', monteMedio.pontos, 1);
const semMonte = avaliarComplexidade({ ...BASE, monteMor: null });
eq('sem monte: 0 pontos', semMonte.pontos, 0);

// Urgência fiscal: mora acumulada pesa mais que a janela do prazo.
const mora = avaliarComplexidade({ ...BASE, dataObito: '2025-06-01', dataReferencia: '2026-08-13' });
eq('óbito > 180 dias: 2 pontos', mora.pontos, 2);
const janela = avaliarComplexidade({ ...BASE, dataObito: '2026-05-01', dataReferencia: '2026-08-13' });
eq('óbito 60–180 dias: 1 ponto', janela.pontos, 1);
const recente = avaliarComplexidade({ ...BASE, dataObito: '2026-08-01', dataReferencia: '2026-08-13' });
eq('óbito recente: 0 pontos', recente.pontos, 0);

// Cônjuges anuentes e diversidade de classes valorizam o trabalho.
const anuentes = avaliarComplexidade({ ...BASE, temConjugesDeHerdeiros: true, qtdClassesDeBens: 4 });
eq('cônjuges + 3 classes: 2 pontos', anuentes.pontos, 2);

// Caso carregadíssimo alcança o nível MUITO ALTA (7%).
const extremo = avaliarComplexidade({
  ...BASE,
  temPreMorto: true,
  temQuotasSocietarias: true,
  temPartilhaDiferenciada: true,
  monteMor: 6_000_000,
  dataObito: '2025-01-01',
  dataReferencia: '2026-08-13',
});
eq('extremo: nível muito alto', extremo.nivel, 'MUITO_ALTA');
eq('extremo: 7%', extremo.percentualSugerido, 7);

console.log('\nSugestão de valor\n');

// 3% de 500k = 15.000 — acima do piso.
const sugestao = sugerirHonorarios(simples, 500_000)!;
eq('3% de 500k', sugestao.valor, '15000.00');
eq('sem piso aplicado', sugestao.pisoAplicado, false);
eq('memória cita a OAB', sugestao.memoria.some((m) => m.includes('OAB')), true);

// Monte pequeno: piso segura o valor.
const pequena = sugerirHonorarios(simples, 50_000)!;
eq('piso aplicado em monte pequeno', pequena.pisoAplicado, true);
eq('valor = piso', pequena.valor, PISO_SUGERIDO.toFixed(2));

// Sem monte calculado, não há sugestão de valor (só o percentual do nível).
eq('sem monte: sem sugestão', sugerirHonorarios(simples, null), null);
eq('monte zero: sem sugestão', sugerirHonorarios(simples, 0), null);

console.log('\nValor contratado\n');

eq('percentual 4% de 1M', valorContratado({ forma: 'PERCENTUAL', percentual: '4', valorFixo: '', condicoesPagamento: '' }, 1_000_000), 40_000);
eq('percentual com vírgula', valorContratado({ forma: 'PERCENTUAL', percentual: '4,5', valorFixo: '', condicoesPagamento: '' }, 1_000_000), 45_000);
eq('percentual sem monte = null', valorContratado({ forma: 'PERCENTUAL', percentual: '4', valorFixo: '', condicoesPagamento: '' }, null), null);
eq('percentual inválido = null', valorContratado({ forma: 'PERCENTUAL', percentual: '120', valorFixo: '', condicoesPagamento: '' }, 1_000_000), null);
eq('fixo ignora o monte', valorContratado({ forma: 'FIXO', percentual: '', valorFixo: '25000.00', condicoesPagamento: '' }, null), 25_000);
eq('fixo vazio = null', valorContratado({ forma: 'FIXO', percentual: '', valorFixo: '', condicoesPagamento: '' }, 1_000_000), null);

console.log(`\n${ok} passaram, ${fail} falharam\n`);
if (fail > 0) process.exit(1);
