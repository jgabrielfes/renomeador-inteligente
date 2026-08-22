/**
 * Testes dos motores da área "Para famílias": triagem da via, estimativas
 * (SP pelo motor real; outras UFs por tabela) e checklist de documentos.
 *
 * Roda sem dependência externa:
 *   npx tsx lib/familias/familias.test.ts
 */

import { RESPOSTAS_INICIAIS, type RespostasFamilia } from './tipos';
import { classificarVia, faixaDoAcervo } from './triagem';
import { estimarCustos } from './estimativas';
import { estimarItcmdUf, ITCMD_POR_UF } from './itcmd-uf';
import { montarChecklistDocumentos } from './documentos';

let ok = 0, fail = 0;
function teste(nome: string, cond: boolean, detalhe?: string) {
  if (cond) ok++;
  else { fail++; console.error(`  ✗ ${nome}${detalhe ? `\n    ${detalhe}` : ''}`); }
}
function eq(nome: string, a: unknown, e: unknown) {
  teste(nome, JSON.stringify(a) === JSON.stringify(e), `esperado ${JSON.stringify(e)}, obtido ${JSON.stringify(a)}`);
}

const base = (extra: Partial<RespostasFamilia>): RespostasFamilia => ({
  ...RESPOSTAS_INICIAIS,
  ufFalecido: 'SP',
  dataObito: '2026-05-10',
  qtdHerdeiros: 3,
  cidade: 'Guarulhos',
  ufFamilia: 'SP',
  bens: { ...RESPOSTAS_INICIAIS.bens },
  ...extra,
});

const HOJE = '2026-08-22';

console.log('\nPara famílias — triagem, estimativas e checklist\n');

/* ---------- triagem da via ---------- */

{
  const t = classificarVia(
    base({ bens: { ...RESPOSTAS_INICIAIS.bens, imoveis: '200-500', imoveisUfs: ['SP'] } }),
  );
  eq('sem testamento/incapaz/conflito → extrajudicial', t.via, 'EXTRAJUDICIAL');
  teste('extrajudicial menciona o advogado obrigatório (CPC 610)', t.motivos.some((m) => m.includes('art. 610')));
}
{
  const t = classificarVia(base({ testamento: 'sim', bens: { ...RESPOSTAS_INICIAIS.bens, imoveis: '200-500', imoveisUfs: ['SP'] } }));
  eq('testamento → judicial', t.via, 'JUDICIAL');
  teste('ressalva da autorização judicial (Res. 35/CNJ) presente', t.observacoes.some((o) => o.includes('Resolução 35')));
}
{
  const t = classificarVia(base({ menorOuIncapaz: 'sim', bens: { ...RESPOSTAS_INICIAIS.bens, imoveis: '200-500', imoveisUfs: ['SP'] } }));
  eq('menor/incapaz → judicial', t.via, 'JUDICIAL');
  teste('ressalva da Res. 571/2024 presente', t.observacoes.some((o) => o.includes('571/2024')));
}
{
  const t = classificarVia(base({ consenso: 'nao', bens: { ...RESPOSTAS_INICIAIS.bens, imoveis: '200-500', imoveisUfs: ['SP'] } }));
  eq('sem consenso → judicial', t.via, 'JUDICIAL');
}
{
  // Só dinheiro (FGTS/saldos) até a faixa mínima, sem imóvel: alvará.
  const t = classificarVia(base({ bens: { ...RESPOSTAS_INICIAIS.bens, financeiro: 'ate-50' } }));
  eq('só valores em dinheiro pequenos → alvará', t.via, 'ALVARA');
  teste('marca pequeno valor', t.pequenoValor);
}
{
  // Dinheiro pequeno + IMÓVEL: nunca alvará.
  const t = classificarVia(
    base({ bens: { ...RESPOSTAS_INICIAIS.bens, financeiro: 'ate-50', imoveis: 'ate-50', imoveisUfs: ['SP'] } }),
  );
  teste('com imóvel não é alvará', t.via !== 'ALVARA');
}
{
  const r = base({ bens: { ...RESPOSTAS_INICIAIS.bens, imoveis: '200-500', imoveisUfs: ['SP'], financeiro: 'ate-50' } });
  eq('faixa do acervo soma as classes', faixaDoAcervo(r), { min: 210_000, max: 550_000 });
}

/* ---------- estimativas ---------- */

{
  // SP: motor real — óbito recente (dentro dos 180 dias), base 200–500 mil.
  const r = base({ bens: { ...RESPOSTAS_INICIAIS.bens, imoveis: '200-500', imoveisUfs: ['SP'] } });
  const e = estimarCustos(r, HOJE, 'EXTRAJUDICIAL');
  eq('SP usa o motor real', e.itcmd[0]?.precisao, 'motor-sp');
  teste(
    'ITCMD SP ~4% da faixa (sem multa: óbito há <180 dias)',
    e.itcmd[0].faixa.min >= 200_000 * 0.04 * 0.95 && e.itcmd[0].faixa.max <= 500_000 * 0.05,
    JSON.stringify(e.itcmd[0].faixa),
  );
  teste('custos extrajudiciais > 0 pelas tabelas SP', e.custos.faixa.min > 0 && e.custos.precisao === 'tabelas-sp');
  eq('prazo de 60 dias calculado', e.prazo.limiteAbertura, '2026-07-09');
  teste('abertura vencida detectada', e.prazo.aberturaVencida);
}
{
  // Óbito antigo em SP: o total inclui multas — min tem de superar os 4% puros.
  const r = base({ dataObito: '2024-01-10', bens: { ...RESPOSTAS_INICIAIS.bens, imoveis: '200-500', imoveisUfs: ['SP'] } });
  const e = estimarCustos(r, HOJE, 'EXTRAJUDICIAL');
  teste('óbito antigo: multas incluídas (min > 4% seco)', e.itcmd[0].faixa.min > 200_000 * 0.04);
  teste('aviso de atraso presente', e.itcmd[0].avisos.some((a) => a.includes('multa')));
}
{
  // Imóvel no RJ + móveis em MG: duas UFs, ambas por tabela.
  const r = base({
    ufFalecido: 'MG',
    bens: { ...RESPOSTAS_INICIAIS.bens, imoveis: '500-1000', imoveisUfs: ['RJ'], financeiro: '50-200' },
  });
  const e = estimarCustos(r, HOJE, 'EXTRAJUDICIAL');
  eq('duas UFs competentes', e.itcmd.map((x) => x.uf).sort(), ['MG', 'RJ']);
  teste('fora de SP é tabela-uf', e.itcmd.every((x) => x.precisao === 'tabela-uf'));
  const rj = e.itcmd.find((x) => x.uf === 'RJ')!;
  eq('RJ: 4% a 8% sobre a faixa do imóvel', rj.faixa, { min: 500_000 * 0.04, max: 1_000_000 * 0.08 });
  const mg = e.itcmd.find((x) => x.uf === 'MG')!;
  eq('MG: 5% fixo sobre os móveis', mg.faixa, { min: 50_000 * 0.05, max: 200_000 * 0.05 });
  eq('custas fora de SP são referência com margem', e.custos.precisao, 'referencia-sp');
}
{
  // Tabela por UF: 27 entradas, teto constitucional respeitado.
  eq('tabela cobre as 27 UFs', Object.keys(ITCMD_POR_UF).length, 27);
  teste('nenhuma alíquota acima do teto de 8%', Object.values(ITCMD_POR_UF).every((a) => a.max <= 8));
  teste('UF desconhecida devolve null', estimarItcmdUf('XX', { min: 1, max: 2 }) === null);
}
{
  // Alvará: faixa própria, sem escritura.
  const r = base({ bens: { ...RESPOSTAS_INICIAIS.bens, financeiro: 'ate-50' } });
  const e = estimarCustos(r, HOJE, 'ALVARA');
  teste('alvará: custos modestos', e.custos.faixa.max <= 3_000);
}

/* ---------- checklist de documentos ---------- */

{
  const r = base({
    vinculo: 'casado',
    testamento: 'nao-sei',
    dividas: 'sim',
    herdeiroExterior: 'sim',
    bens: { ...RESPOSTAS_INICIAIS.bens, imoveis: '200-500', imoveisUfs: ['SP'], veiculos: 'ate-50', financeiro: 'ate-50', empresa: true },
  });
  const docs = montarChecklistDocumentos(r, 'EXTRAJUDICIAL');
  const ids = docs.map((d) => d.id);
  for (const esperado of [
    'certidao-obito', 'certidao-testamento', 'matriculas', 'iptu-itr', 'crlv',
    'extratos', 'contrato-social', 'dividas', 'procuracao-exterior',
  ]) {
    teste(`checklist tem ${esperado}`, ids.includes(esperado));
  }
}
{
  const docs = montarChecklistDocumentos(base({ bens: { ...RESPOSTAS_INICIAIS.bens, financeiro: 'ate-50' } }), 'ALVARA');
  teste('alvará pede comprovantes dos valores', docs.some((d) => d.id === 'comprovantes-valores'));
  teste('sem imóvel não pede matrícula', !docs.some((d) => d.id === 'matriculas'));
}

console.log(`\n${ok} passaram, ${fail} falharam\n`);
if (fail > 0) process.exit(1);
