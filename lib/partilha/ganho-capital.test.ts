/**
 * Casos de teste do Simulador de Ganho de Capital do Espólio (Módulo 1).
 *
 * Roda sem dependência externa:
 *   npx tsx lib/partilha/ganho-capital.test.ts
 */

import {
  simularGanhoCapital,
  impostoGanhoProgressivo,
  type BemGanhoCapital,
} from './ganho-capital';

let ok = 0, fail = 0;
function eq(nome: string, a: unknown, e: unknown) {
  if (JSON.stringify(a) === JSON.stringify(e)) ok++;
  else { fail++; console.error(`  ✗ ${nome}\n    esperado ${JSON.stringify(e)}\n    obtido   ${JSON.stringify(a)}`); }
}
function aprox(nome: string, a: number, e: number, tol = 1) {
  if (Math.abs(a - e) <= tol) ok++;
  else { fail++; console.error(`  ✗ ${nome}\n    esperado ~${e}\n    obtido   ${a}`); }
}

console.log('\nGanho de Capital do Espólio\n');

const TRANSF = '2026-06-01';
const um = (b: Partial<BemGanhoCapital>): BemGanhoCapital => ({
  bemId: 'b1',
  tipo: 'imovel',
  custoDeclarado: 0,
  dataAquisicao: '2010-01-01',
  valorMercado: 0,
  ...b,
});
const rodar = (b: Partial<BemGanhoCapital>) =>
  simularGanhoCapital({ bens: [um(b)], dataTransferencia: TRANSF }).porBem[0];

// Tabela progressiva (GC-06): ganho 12M → 750k + 875k + 400k = 2.025M.
eq('progressivo 12M', impostoGanhoProgressivo(12_000_000), 2_025_000);
eq('progressivo até 5M = 15%', impostoGanhoProgressivo(5_000_000), 750_000);

// GC-01: declarado 100k, mercado 100k → ganho 0 → ATUALIZAR_SEM_CUSTO.
const gc01 = rodar({ custoDeclarado: 100_000, valorMercado: 100_000 });
eq('GC-01: ganho 0', gc01.cenarioB.ganhoBruto, 0);
eq('GC-01: sem imposto agora', gc01.cenarioB.impostoAgora, 0);
eq('GC-01: recomenda atualizar sem custo', gc01.recomendacao, 'ATUALIZAR_SEM_CUSTO');

// GC-02: declarado 100k, mercado 500k, adquirido 2010, herdeiro vende por 500k.
const gc02 = rodar({
  custoDeclarado: 100_000,
  valorMercado: 500_000,
  dataAquisicao: '2010-01-01',
  herdeiroPretendeVender: true,
  valorVendaProjetado: 500_000,
});
eq('GC-02: ganho bruto 400k', gc02.cenarioB.ganhoBruto, 400_000);
eq('GC-02: FR2 aplicado no cenário B', gc02.cenarioB.reducoesAplicadas.includes('FR2'), true);
// Cenário B: imposto agora com FR2; futuro ≈ 0 (vende ao custo herdado).
eq('GC-02: futuro no B é zero', gc02.cenarioB.impostoFuturoProjetado, 0);
// Cenário A: futuro sobre 400k sem redução = 60k.
eq('GC-02: futuro no A = 60k', gc02.cenarioA.impostoFuturoProjetado, 60_000);
eq('GC-02: atualizar compensa', gc02.recomendacao, 'ATUALIZAR_COMPENSA');

// GC-03: imóvel adquirido em 1965 → art. 18 reduz 100% → imposto 0, custo grátis.
const gc03 = rodar({
  custoDeclarado: 50_000,
  valorMercado: 800_000,
  dataAquisicao: '1965-05-01',
});
eq('GC-03: ganho tributável zerado pelo art. 18', gc03.cenarioB.ganhoTributavel, 0);
eq('GC-03: imposto agora 0', gc03.cenarioB.impostoAgora, 0);
eq('GC-03: exibido como isento (art. 18 100%)', gc03.cenarioB.isencoesAplicadas.includes('art18_reducao_100'), true);
eq('GC-03: atualizar sem custo', gc03.recomendacao, 'ATUALIZAR_SEM_CUSTO');

// GC-04: único imóvel, mercado 400k, sem alienação em 5 anos → isento art. 23.
const gc04 = rodar({
  custoDeclarado: 100_000,
  valorMercado: 400_000,
  unicoImovel: true,
  alienouImovelUltimos5Anos: false,
});
eq('GC-04: isenção único imóvel', gc04.cenarioB.isencoesAplicadas.includes('unico_imovel_art23_L9250'), true);
eq('GC-04: imposto agora 0', gc04.cenarioB.impostoAgora, 0);
eq('GC-04: alerta de confirmação', gc04.alertas.some((a) => a.includes('confirmação no caso concreto')), true);

// GC-05: único imóvel, mercado 450k (> 440k) → isenção NÃO aplicável.
const gc05 = rodar({
  custoDeclarado: 100_000,
  valorMercado: 450_000,
  unicoImovel: true,
  alienouImovelUltimos5Anos: false,
  dataAquisicao: '2010-01-01',
});
eq('GC-05: sem isenção do único imóvel', gc05.cenarioB.isencoesAplicadas.includes('unico_imovel_art23_L9250'), false);
eq('GC-05: há imposto agora', gc05.cenarioB.impostoAgora > 0, true);

// GC-07: herdeiro NÃO vai vender → MANTER_DECLARADO (mesmo com ganho tributável).
const gc07 = rodar({
  custoDeclarado: 100_000,
  valorMercado: 500_000,
  dataAquisicao: '2010-01-01',
  herdeiroPretendeVender: false,
});
eq('GC-07: manter declarado', gc07.recomendacao, 'MANTER_DECLARADO');

// GC-08: veículo declarado 50k, mercado 30k → ganho negativo → manter declarado.
const gc08 = rodar({
  tipo: 'veiculo',
  custoDeclarado: 50_000,
  valorMercado: 30_000,
});
eq('GC-08: ganho negativo', gc08.cenarioB.ganhoBruto, -20_000);
eq('GC-08: sem imposto', gc08.cenarioB.impostoAgora, 0);
eq('GC-08: manter declarado (rebaixaria o custo)', gc08.recomendacao, 'MANTER_DECLARADO');

// GC-09: ações, alienação no mês ≤ 20k → isenção de pequeno valor.
const gc09 = rodar({
  tipo: 'acoes',
  custoDeclarado: 2_000,
  valorMercado: 18_000,
});
eq('GC-09: isenção pequeno valor (ações)', gc09.cenarioB.isencoesAplicadas.includes('pequeno_valor'), true);
eq('GC-09: imposto agora 0', gc09.cenarioB.impostoAgora, 0);
// Ações acima do teto de 20k não isentam por pequeno valor.
const acoesGrandes = rodar({ tipo: 'acoes', custoDeclarado: 2_000, valorMercado: 25_000 });
eq('ações acima de 20k: sem pequeno valor', acoesGrandes.cenarioB.isencoesAplicadas.includes('pequeno_valor'), false);

// Resumo e DARF.
const geral = simularGanhoCapital({
  bens: [
    um({ bemId: 'a', custoDeclarado: 100_000, valorMercado: 500_000, herdeiroPretendeVender: true, valorVendaProjetado: 500_000 }),
    um({ bemId: 'b', tipo: 'veiculo', custoDeclarado: 50_000, valorMercado: 30_000 }),
  ],
  dataTransferencia: TRANSF,
});
eq('resumo: DARF 4600', geral.resumo.darf.codigo, '4600');
aprox('resumo: economia do mix ≥ 0', geral.resumo.mixOtimo.economiaVsPiorCenario >= 0 ? 1 : 0, 1);

console.log(`\n${ok} passaram, ${fail} falharam\n`);
if (fail > 0) process.exit(1);
