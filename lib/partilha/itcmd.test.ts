/**
 * Casos de teste da provisão do ITCMD-SP.
 *
 * Roda sem dependência externa:
 *   node --experimental-strip-types lib/partilha/itcmd.test.ts
 */

import {
  provisionarItcmd,
  jurosArt20,
  UFESP_POR_ANO,
  isencoesArt6,
  analisarIsencoesPorBem,
  impostoProgressivo,
  FAIXAS_PL7_2024,
  FAIXAS_TETO_NACIONAL,
} from './itcmd';

let ok = 0, fail = 0;
function eq(nome: string, a: unknown, e: unknown) {
  if (JSON.stringify(a) === JSON.stringify(e)) ok++;
  else { fail++; console.error(`  ✗ ${nome}\n    esperado ${JSON.stringify(e)}\n    obtido   ${JSON.stringify(a)}`); }
}
function aprox(nome: string, a: number, e: number, tol = 0.01) {
  if (Math.abs(a - e) <= tol) ok++;
  else { fail++; console.error(`  ✗ ${nome}\n    esperado ~${e}\n    obtido   ${a}`); }
}

console.log('\nITCMD-SP — provisão causa mortis\n');

// Dentro de 90 dias, mesmo ano: sem atualização, com desconto de 5%.
const emDia = provisionarItcmd({
  dataObito: '2026-05-10',
  dataReferencia: '2026-07-01', // 52 dias
  baseCalculo: 1_000_000,
});
aprox('base sem atualização no mesmo ano', emDia.baseAtualizada, 1_000_000);
aprox('imposto = 4%', emDia.imposto, 40_000);
eq('desconto presente', emDia.parcelas.some((p) => p.id === 'desconto'), true);
aprox('desconto = 5% do imposto', emDia.parcelas.find((p) => p.id === 'desconto')!.valor, -2_000);
eq('sem multa de abertura', emDia.parcelas.some((p) => p.id === 'multa-abertura'), false);
eq('sem mora', emDia.diasDeAtraso, 0);
aprox('total = imposto − desconto', emDia.total, 38_000);
eq('vencimento = óbito + 180 dias', emDia.vencimento, '2026-11-06');
eq('mesmo ano: sem parcela de atualização', emDia.parcelas.some((p) => p.id === 'atualizacao'), false);
aprox('parcela do imposto = 4% da base histórica', emDia.parcelas.find((p) => p.id === 'imposto')!.valor, 40_000);

// Protocolo entre 60 e 180 dias: multa de 10%, sem desconto (após 90 dias).
const tardio10 = provisionarItcmd({
  dataObito: '2026-01-10',
  dataReferencia: '2026-06-01',
  baseCalculo: 500_000,
  dataProtocolo: '2026-04-01', // 82 dias
});
eq('multa de 10% presente', tardio10.parcelas.find((p) => p.id === 'multa-abertura')!.valor,
  Math.round(500_000 * 0.04 * 0.1 * 100) / 100);
eq('sem desconto após 90 dias', tardio10.parcelas.some((p) => p.id === 'desconto'), false);
eq('sem mora antes do vencimento', tardio10.parcelas.some((p) => p.id === 'multa-moratoria'), false);

// Atualização pela UFESP: óbito out/2024, vencimento cai em 2025 — a base
// atualiza para a UFESP de 2025 e PARA ALI (art. 15, parte final), mesmo com
// a referência lá em 2026: depois do vencimento quem corrige é a Selic.
const atualizada = provisionarItcmd({
  dataObito: '2024-10-01',
  dataReferencia: '2026-08-11',
  baseCalculo: 353_600, // 10.000 UFESPs de 2024
  dataProtocolo: '2024-11-10', // 40 dias — sem multa de abertura
});
aprox('10.000 UFESPs', atualizada.baseEmUfesps, 10_000);
eq('UFESP de atualização = exercício do vencimento (2025)', [atualizada.anoAtualizacao, atualizada.ufespAtualizacao], [2025, 37.02]);
aprox('base atualizada até o vencimento, não até hoje', atualizada.baseAtualizada, 370_200);
aprox('imposto sobre a base atualizada até o vencimento', atualizada.imposto, 14_808);
eq('sem multa de abertura (40 dias)', atualizada.parcelas.some((p) => p.id === 'multa-abertura'), false);
// Discriminação do art. 15: imposto histórico + atualização = 4% da base atualizada.
aprox('parcela do imposto histórico', atualizada.parcelas.find((p) => p.id === 'imposto')!.valor, 14_144);
aprox('parcela de atualização monetária', atualizada.parcelas.find((p) => p.id === 'atualizacao')!.valor, 664);
eq('atualização fundamentada no art. 15', atualizada.parcelas.find((p) => p.id === 'atualizacao')!.fundamento.includes('art. 15'), true);

// Mora: óbito em 2024-10-01 → vencimento 2025-03-30; referência 2026-08-11.
eq('vencimento', atualizada.vencimento, '2025-03-30');
eq('dias de atraso > 400', atualizada.diasDeAtraso > 400, true);
const moratoria = atualizada.parcelas.find((p) => p.id === 'multa-moratoria')!;
aprox('multa moratória capada em 20% do imposto ATUALIZADO', moratoria.valor, atualizada.imposto * 0.2);
const juros = atualizada.parcelas.find((p) => p.id === 'juros')!;
eq('juros presentes', juros.valor > 0, true);

// ---------- regressão: demonstrativo oficial da Sefaz-SP ----------
// Conta fiscal nº 97348994 (emitida 17/08/2026): óbito 05/10/2016, legítima
// de R$ 100.466,01 transmitida a 3 herdeiros. O demonstrativo cobra, no
// total das 3 contas: tributo 4.018,63 · atualização monetária 259,38
// (UFESP 2016 23,55 → 2017 25,07, ano do vencimento 03/04/2017) · multa de
// mora 855,61 · multa de protocolização 855,61 — as duas multas de 20% sobre
// o imposto ATUALIZADO (tributo + atualização) · juros de 116,56% também
// sobre o atualizado (Selic efetiva; aqui estimada pela meta, ±1%).
const oficial = provisionarItcmd({
  dataObito: '2016-10-05',
  dataReferencia: '2026-08-17',
  baseCalculo: 100_466.01,
});
eq('demonstrativo: vencimento 03/04/2017', oficial.vencimento, '2017-04-03');
eq('demonstrativo: UFESP de atualização é a de 2017', [oficial.anoAtualizacao, oficial.ufespAtualizacao], [2017, 25.07]);
aprox('demonstrativo: tributo 4%', oficial.parcelas.find((p) => p.id === 'imposto')!.valor, 4_018.64);
aprox('demonstrativo: atualização monetária', oficial.parcelas.find((p) => p.id === 'atualizacao')!.valor, 259.38);
aprox('demonstrativo: multa de protocolização (art. 21, I)', oficial.parcelas.find((p) => p.id === 'multa-abertura')!.valor, 855.61, 0.05);
aprox('demonstrativo: multa moratória (art. 19)', oficial.parcelas.find((p) => p.id === 'multa-moratoria')!.valor, 855.61, 0.05);
// Juros oficiais: 4.986,44 (116,56% do atualizado). A Selic aqui é estimada
// pela meta do Copom — aceita ±2% do percentual oficial.
const jurosOficial = oficial.parcelas.find((p) => p.id === 'juros')!;
aprox('demonstrativo: juros de mora perto do oficial', jurosOficial.valor, 4_986.44, 100);
// Saldo oficial: 10.975,67 (3.658,63 + 3.658,52 + 3.658,52).
aprox('demonstrativo: saldo total devido', oficial.total, 10_975.67, 110);

// jurosArt20: piso de 1% por fração no mês do pagamento.
const j1 = jurosArt20('2026-07-01', '2026-07-20');
aprox('fração de mês única = 1%', j1.percentual, 1);
const j2 = jurosArt20('2026-05-10', '2026-07-20');
// jun/2026 (Selic ~1,12%) + fração de jul (1%) — entre 2% e 2,3%.
eq('meses cheios + fração', j2.meses.length, 2);
eq('juros acima do piso', j2.percentual > 2 && j2.percentual < 2.4, true);
const j0 = jurosArt20('2026-07-01', '2026-07-01');
aprox('pagamento no vencimento: sem juros', j0.percentual, 0);

// Piso legal: em 2020 (Selic 2% a.a. → ~0,17% a.m.) vale o mínimo de 1% a.m.
const jPiso = jurosArt20('2020-08-31', '2020-11-15');
aprox('piso de 1% a.m. em Selic baixa', jPiso.percentual, 3); // set + out + fração nov

// Multa de abertura projetada quando o inventário ainda não foi aberto.
const semProtocolo = provisionarItcmd({
  dataObito: '2025-09-01',
  dataReferencia: '2026-08-11', // 344 dias
  baseCalculo: 200_000,
});
const ma = semProtocolo.parcelas.find((p) => p.id === 'multa-abertura')!;
aprox('projeção usa 20% após 180 dias', ma.valor, semProtocolo.imposto * 0.2);
eq('aviso da jurisprudência do TJSP', semProtocolo.avisos.some((a) => a.includes('TJSP')), true);

// Sanidade da tabela de UFESPs.
eq('UFESP 2025', UFESP_POR_ANO[2025], 37.02);
eq('UFESP 2026', UFESP_POR_ANO[2026], 38.42);

// ---------- isenções do art. 6º ----------
const U = 38.42;
// Imóvel residencial dentro de 5.000 UFESPs (R$ 192.100): isento por inteiro.
const isOk = isencoesArt6({
  bens: [{ tipo: 'IMOVEL', valor: 150_000, descricao: 'Casa' }],
  ufespObito: U,
  aplicarImovelResidencial: true,
  aplicarDepositos: false,
});
aprox('imóvel dentro do teto: isento por inteiro', isOk.valorIsento, 150_000);
// Acima do teto NÃO é franquia: nada isento e aviso emitido.
const isAcima = isencoesArt6({
  bens: [{ tipo: 'IMOVEL', valor: 500_000 }],
  ufespObito: U,
  aplicarImovelResidencial: true,
  aplicarDepositos: false,
});
aprox('imóvel acima do teto: sem isenção', isAcima.valorIsento, 0);
eq('aviso de teto não é franquia', isAcima.avisos.length, 1);
// Depósitos dentro de 1.000 UFESPs (R$ 38.420).
const isDep = isencoesArt6({
  bens: [
    { tipo: 'FINANCEIRO', valor: 20_000 },
    { tipo: 'FINANCEIRO', valor: 10_000 },
    { tipo: 'IMOVEL', valor: 900_000 },
  ],
  ufespObito: U,
  aplicarImovelResidencial: false,
  aplicarDepositos: true,
});
aprox('depósitos dentro do teto: isentos', isDep.valorIsento, 30_000);

// ---------- imposto progressivo (LC 227 / PL 7-2024) ----------
// Quinhão de 5.000 UFESPs: tudo na 1ª faixa (2%).
const p1 = impostoProgressivo(5000 * U, U, FAIXAS_PL7_2024);
aprox('progressivo 1ª faixa', p1.imposto, 5000 * U * 0.02);
// Quinhão de 12.000 UFESPs: 10.000 a 2% + 2.000 a 4%.
const p2 = impostoProgressivo(12_000 * U, U, FAIXAS_PL7_2024);
aprox('progressivo 2 faixas', p2.imposto, (10_000 * 0.02 + 2_000 * 0.04) * U, 0.5);
eq('alíquota efetiva entre 2 e 4', p2.aliquotaEfetiva > 2 && p2.aliquotaEfetiva < 4, true);
// Teto nacional: 8% linear.
const p3 = impostoProgressivo(100_000, U, FAIXAS_TETO_NACIONAL);
aprox('teto nacional 8%', p3.imposto, 8_000);

// ---------- provisão com cenário progressivo ----------
// Óbito ANTES da vigência: continua 4% (lei da data do fato gerador).
const provFixa = provisionarItcmd({
  dataObito: '2026-05-10',
  dataReferencia: '2026-07-01',
  baseCalculo: 1_000_000,
  quinhoes: [{ nome: 'A', valor: 500_000 }, { nome: 'B', valor: 500_000 }],
  faixasProgressivas: FAIXAS_PL7_2024,
  vigenciaProgressiva: '2027-01-01',
});
aprox('óbito antes da vigência: 4% preservado', provFixa.imposto, 40_000);
// Óbito DEPOIS da vigência: progressivo por quinhão, com aviso de simulação.
const provProg = provisionarItcmd({
  dataObito: '2027-02-01',
  dataReferencia: '2027-03-01',
  baseCalculo: 1_000_000,
  quinhoes: [{ nome: 'A', valor: 500_000 }, { nome: 'B', valor: 500_000 }],
  faixasProgressivas: FAIXAS_TETO_NACIONAL,
  vigenciaProgressiva: '2027-01-01',
});
eq('óbito após a vigência: progressivo aplicado', provProg.parcelas[0].rotulo.includes('progressivo'), true);
eq('aviso de simulação presente', provProg.avisos.some((a) => a.includes('SIMULAÇÃO')), true);
// Base atualizada = base (mesmo ano estimado): 8% de 1M = 80.000.
aprox('teto 8% sobre os quinhões', provProg.imposto, 80_000, 1);


/* ---------- leitura automática das isenções por bem ---------- */
{
  const ufesp = 38.42; // 2026
  // Único imóvel ≤ 2.500 UFESPs → alínea "b".
  const a1 = analisarIsencoesPorBem([{ tipo: 'IMOVEL', valor: 90_000, descricao: 'Casa' }], ufesp);
  eq('isenção b: único imóvel pequeno', [a1[0].verdito, a1[0].hipotese], ['ISENTO_POSSIVEL', 'art. 6º, I, "b"']);
  // Imóvel ≤ 5.000 UFESPs com outro imóvel no acervo → alínea "a" com condições.
  const a2 = analisarIsencoesPorBem(
    [
      { tipo: 'IMOVEL', valor: 150_000, descricao: 'Casa' },
      { tipo: 'IMOVEL', valor: 800_000, descricao: 'Prédio' },
    ],
    ufesp,
  );
  eq('isenção a: hipótese com condições', [a2[0].verdito, a2[0].hipotese, a2[0].condicoes.length > 0], ['ISENTO_POSSIVEL', 'art. 6º, I, "a"', true]);
  eq('imóvel caro: tributado por inteiro', a2[1].verdito, 'TRIBUTADO');

  // Alínea "a" decidida AUTOMATICAMENTE pela ficha do item I (pergunta
  // "possui outro imóvel?"): algum SIM derruba; todos NÃO confirmam.
  const doisImoveis: Parameters<typeof analisarIsencoesPorBem>[0] = [
    { tipo: 'IMOVEL', valor: 150_000, descricao: 'Casa' },
    { tipo: 'IMOVEL', valor: 800_000, descricao: 'Prédio' },
  ];
  const comOutro = analisarIsencoesPorBem(doisImoveis, ufesp, {
    herdeiros: 2,
    respostasOutroImovel: 2,
    algumComOutroImovel: true,
    nenhumComOutroImovel: false,
  });
  eq('ficha: herdeiro com outro imóvel derruba a alínea a', comOutro[0].verdito, 'TRIBUTADO');
  eq('ficha: explicação cita a alínea a', comOutro[0].explicacao.includes('alínea "a"'), true);
  const semOutro = analisarIsencoesPorBem(doisImoveis, ufesp, {
    herdeiros: 2,
    respostasOutroImovel: 2,
    algumComOutroImovel: false,
    nenhumComOutroImovel: true,
  });
  eq('ficha: todos sem outro imóvel confirmam a alínea a', [semOutro[0].verdito, semOutro[0].hipotese], ['ISENTO_POSSIVEL', 'art. 6º, I, "a"']);
  eq('ficha: requisito confirmado sai das condições', semOutro[0].condicoes.some((c) => c.includes('outro imóvel')), false);
  eq('ficha: explicação registra a confirmação automática', semOutro[0].explicacao.includes('requisito confirmado automaticamente'), true);
  // Ficha incompleta: mantém a hipótese com a condição de responder.
  const semResposta = analisarIsencoesPorBem(doisImoveis, ufesp, {
    herdeiros: 2,
    respostasOutroImovel: 1,
    algumComOutroImovel: false,
    nenhumComOutroImovel: false,
  });
  eq('ficha incompleta: condição pede as respostas', semResposta[0].condicoes.some((c) => c.includes('ficha do item I')), true);
  // A alínea "b" (único transmitido) independe da ficha.
  const bComOutro = analisarIsencoesPorBem([{ tipo: 'IMOVEL', valor: 90_000, descricao: 'Casa' }], ufesp, {
    herdeiros: 2,
    respostasOutroImovel: 2,
    algumComOutroImovel: true,
    nenhumComOutroImovel: false,
  });
  eq('alínea b não depende da ficha', [bComOutro[0].verdito, bComOutro[0].hipotese], ['ISENTO_POSSIVEL', 'art. 6º, I, "b"']);
  // Financeiro mede o CONJUNTO.
  const a3 = analisarIsencoesPorBem(
    [
      { tipo: 'FINANCEIRO', valor: 15_000, descricao: 'Conta A' },
      { tipo: 'FINANCEIRO', valor: 20_000, descricao: 'Conta B' },
    ],
    ufesp,
  );
  eq('financeiro dentro do conjunto: isento d', [a3[0].verdito, a3[1].hipotese], ['ISENTO_POSSIVEL', 'art. 6º, I, "d"']);
  const a4 = analisarIsencoesPorBem(
    [
      { tipo: 'FINANCEIRO', valor: 30_000, descricao: 'Conta A' },
      { tipo: 'FINANCEIRO', valor: 30_000, descricao: 'Conta B' },
    ],
    ufesp,
  );
  eq('financeiro acima no conjunto: tributado', a4[0].verdito, 'TRIBUTADO');
  // Veículo: sem hipótese; FGTS: alínea "e".
  const a5 = analisarIsencoesPorBem(
    [
      { tipo: 'VEICULO', valor: 40_000, descricao: 'Gol' },
      { tipo: 'OUTRO', valor: 12_000, descricao: 'Saldo de FGTS não recebido em vida' },
    ],
    ufesp,
  );
  eq('veículo tributado', a5[0].verdito, 'TRIBUTADO');
  eq('FGTS isento e', [a5[1].verdito, a5[1].hipotese], ['ISENTO_POSSIVEL', 'art. 6º, I, "e"']);
  // Código da declaração do ITCMD-SP decide a alínea "e" mesmo com descrição
  // neutra (178 = quantia devida pelo empregador); código fora do rol não.
  const a6 = analisarIsencoesPorBem(
    [
      { tipo: 'OUTRO', valor: 90_000, descricao: 'Crédito a receber', codigoItcmd: '178' },
      { tipo: 'OUTRO', valor: 90_000, descricao: 'Crédito a receber', codigoItcmd: '175' },
    ],
    ufesp,
  );
  eq('código 178: isento e', [a6[0].verdito, a6[0].hipotese], ['ISENTO_POSSIVEL', 'art. 6º, I, "e"']);
  eq('código 175 caro: tributado', a6[1].verdito, 'TRIBUTADO');
  // Descrição com "caráter alimentar" também enquadra, sem código.
  const a7 = analisarIsencoesPorBem(
    [{ tipo: 'OUTRO', valor: 20_000, descricao: 'Verbas de caráter alimentar de decisão judicial' }],
    ufesp,
  );
  eq('caráter alimentar por descrição: isento e', [a7[0].verdito, a7[0].hipotese], ['ISENTO_POSSIVEL', 'art. 6º, I, "e"']);
}


console.log(`\n${ok} passaram, ${fail} falharam\n`);
if (fail > 0) process.exit(1);
