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
import { intakeParaCaso } from './intake-para-caso';
import { sanitizarRespostas } from './sanitizar';

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

/* ---------- sanitização (allowlist do servidor) ---------- */

{
  const bruto = {
    ...base({ bens: { ...RESPOSTAS_INICIAIS.bens, imoveis: '200-500', imoveisUfs: ['sp', 'XX'] } }),
    cpf: '111.222.333-44',
    nomeDoFalecido: 'José Sigiloso',
    testamento: 'talvez',
  } as unknown;
  const r = sanitizarRespostas(bruto)!;
  teste('sanitizar reconstrói por allowlist (campo estranho não atravessa)', !('cpf' in r) && !('nomeDoFalecido' in r));
  eq('UF minúscula normaliza; inválida cai fora', r.bens.imoveisUfs, ['SP']);
  eq('enum inválido volta ao padrão', r.testamento, 'nao');
  teste('sem o mínimo devolve null', sanitizarRespostas({ ufFalecido: 'SP' }) === null);
}

{
  // Empresa como os demais bens: escolher a faixa MARCA a participação;
  // observações são limitadas a 500 caracteres.
  const comFaixa = sanitizarRespostas(
    base({
      bens: { ...RESPOSTAS_INICIAIS.bens, empresa: false, empresaValor: '200-500' },
      observacoes: `  ${'x'.repeat(600)}  `,
    }),
  )!;
  eq('escolher a faixa marca a participação', comFaixa.bens.empresa, true);
  eq('faixa da empresa atravessa', comFaixa.bens.empresaValor, '200-500');
  eq('observações aparadas em 500', comFaixa.observacoes.length, 500);
  const legado = sanitizarRespostas(
    base({ bens: { ...RESPOSTAS_INICIAIS.bens, empresa: true, empresaValor: null } }),
  )!;
  eq('resposta antiga (só a caixinha) segue valendo', legado.bens.empresa, true);
  eq(
    'faixa do acervo soma o valor da empresa',
    faixaDoAcervo(base({ bens: { ...RESPOSTAS_INICIAIS.bens, empresa: true, empresaValor: '200-500' } })),
    { min: 200_000, max: 500_000 },
  );
}

/* ---------- intake → CasoSalvo (importação do advogado) ---------- */

{
  let seq = 0;
  const gerarId = (p: string) => `${p}-${++seq}`;
  const r = base({
    vinculo: 'casado',
    regime: 'comunhao-parcial',
    qtdHerdeiros: 3,
    menorOuIncapaz: 'sim',
    dividas: 'sim',
    nome: 'Maria',
    email: 'maria@exemplo.com',
    bens: { ...RESPOSTAS_INICIAIS.bens, imoveis: '200-500', imoveisUfs: ['SP', 'RJ'], financeiro: 'ate-50', empresa: true },
  });
  const caso = intakeParaCaso(r, { casoId: 'caso-teste', gerarId });
  eq('caso v1 no formato do Importar', caso.v, 1);
  eq('falecido SEM nome (o questionário não coleta)', caso.familia.falecido.nome, '');
  eq('data do óbito transportada', caso.familia.falecido.dataObito, '2026-05-10');
  eq('vínculo e regime mapeados', [caso.familia.vinculo, caso.familia.regime], ['CASAMENTO', 'COMUNHAO_PARCIAL']);
  eq('3 fichas de herdeiro em branco', caso.familia.herdeiros.length, 3);
  eq('imóvel vira UM bem POR UF', caso.bens.filter((b) => b.tipo === 'IMOVEL').length, 2);
  teste('bens marcados como faixa aproximada', caso.bens.every((b) => b.tipo === 'QUOTAS' || b.descricao.includes('faixa aproximada')));
  teste('regime informado → natureza COMUM', caso.bens.every((b) => b.natureza === 'COMUM'));
  teste('notas carregam as flags (incapaz, dívidas) e o contato', ['MENOR/INCAPAZ', 'DÍVIDAS', 'maria@exemplo.com'].every((t) => caso.notas.includes(t)));
  eq('rito AUTO quando a via não é judicial... ', caso.fiscal.rito, 'JUDICIAL'); // menor/incapaz → judicial
  eq('casoId e ids determinísticos do gerador injetado', caso.familia.herdeiros[0].id, 'h-1');
}
{
  // Sem regime informado: natureza PARTICULAR (não presumir meação).
  let seq = 0;
  const caso = intakeParaCaso(
    base({ vinculo: 'casado', regime: '', bens: { ...RESPOSTAS_INICIAIS.bens, financeiro: '50-200' } }),
    { casoId: 'c', gerarId: (p) => `${p}-${++seq}` },
  );
  teste('regime desconhecido → bens PARTICULARES + nota', caso.bens.every((b) => b.natureza === 'PARTICULAR') && caso.notas.includes('Regime de bens NÃO informado'));
}

console.log(`\n${ok} passaram, ${fail} falharam\n`);
if (fail > 0) process.exit(1);
