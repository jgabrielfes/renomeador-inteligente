/**
 * Casos de teste da projeção de custos cartorários e judiciais.
 *
 * Roda sem dependência externa:
 *   npx tsx lib/partilha/custas.test.ts
 */

import {
  emolumentoEscritura,
  emolumentoRegistro,
  comIss,
  CERTIDAO_RI_2026,
  ESCRITURA_SEM_VALOR_2026,
  taxaJudiciaria,
  projetarCustos,
  type EntradaCustos,
  baseDeEmolumentosDaEscritura,
} from './custas';

let ok = 0, fail = 0;
function eq(nome: string, a: unknown, e: unknown) {
  if (JSON.stringify(a) === JSON.stringify(e)) ok++;
  else { fail++; console.error(`  ✗ ${nome}\n    esperado ${JSON.stringify(e)}\n    obtido   ${JSON.stringify(a)}`); }
}

console.log('\nCustas — projeção cartorária e judicial (tabelas 2026, ISS 5%)\n');

/* faixas oficiais de notas: valores exatos da tabela CNB-SP 2026 */
eq('notas: mínimo da tabela', emolumentoEscritura(1_000), 362.98);
eq('notas: faixa de 100 mil', emolumentoEscritura(100_000), 2_303.08);
eq('notas: faixa de 500 mil', emolumentoEscritura(500_000), 5_519.9);
eq('notas: faixa de 900 mil', emolumentoEscritura(900_000), 6_129.04);
eq('notas: limite superior inclusivo', emolumentoEscritura(384_200), 4_973.32);
eq('notas: um centavo acima muda de faixa', emolumentoEscritura(384_200.01), 5_519.9);
eq('notas: acima da última faixa', emolumentoEscritura(50_000_000), 66_756.25);
eq('notas: base zero', emolumentoEscritura(0), 0);

/* faixas oficiais de registro */
eq('registro: mínimo da tabela', emolumentoRegistro(1_000), 265.0);
eq('registro: faixa de 900 mil', emolumentoRegistro(900_000), 3_962.79);
eq('registro: faixa de 2 milhões', emolumentoRegistro(2_000_000), 5_471.41);
eq('registro: acima da última faixa', emolumentoRegistro(2_000_000_000), 67_136.84);
eq('certidão de matrícula 2026', CERTIDAO_RI_2026.total, 77.89);

/* taxa judiciária: faixas fixas da Lei 17.785/2023 (UFESP 38,42) */
const U = 38.42;
eq('até 50k → 10 UFESPs', taxaJudiciaria(50_000, U), { valor: 384.2, ufesps: 10 });
eq('500k → 100 UFESPs', taxaJudiciaria(500_000, U), { valor: 3_842, ufesps: 100 });
eq('1,2M → 300 UFESPs', taxaJudiciaria(1_200_000, U), { valor: 11_526, ufesps: 300 });
eq('4M → 1.000 UFESPs', taxaJudiciaria(4_000_000, U), { valor: 38_420, ufesps: 1_000 });
eq('8M → 3.000 UFESPs (teto)', taxaJudiciaria(8_000_000, U), { valor: 115_260, ufesps: 3_000 });

/* escritura: UM ato pela LEGÍTIMA (herança sem a meação) */
const BASE: EntradaCustos = {
  monteMor: 900_000,
  baseEscritura: 450_000, // legítima: monte − meação
  qtdRenunciantes: 0,
  sucessoes: [],
  imoveis: [{ descricao: 'Casa em Guarulhos', valor: 900_000 }],
  rito: 'EXTRAJUDICIAL',
  qtdHerdeiros: 3,
  temSobrevivente: true,
  transferencias: [],
  ufesp: U,
};
const partilha = projetarCustos(BASE);
const escritura = partilha.parcelas.find((p) => p.id === 'escritura')!;
// 450k (legítima) → faixa 384.200,01–768.400 = R$ 5.519,90 — ATO ÚNICO
eq('escritura: ato único pela legítima', escritura.valor, 5_519.9);
eq('escritura: quantidade 1', escritura.quantidade, 1);
eq('escritura: valor de tabela (sem asterisco)', escritura.aproximado, false);
eq('escritura: detalhe cita a exclusão da meação', escritura.detalhe!.includes('excluída a meação'), true);

/* renúncia: um ato SEM valor declarado por renunciante */
const comRenuncia = projetarCustos({ ...BASE, qtdRenunciantes: 2 });
const renuncias = comRenuncia.parcelas.find((p) => p.id === 'renuncias')!;
eq('renúncia: 2 atos sem valor declarado', renuncias.valor, 2 * ESCRITURA_SEM_VALOR_2026.total);
eq('renúncia: item 6.2 da tabela', renuncias.fundamento.includes('6.2'), true);

/* união estável a RECONHECER no próprio inventário: UM ato sem valor
   declarado; já formalizada (flag ausente/false), nada entra */
const comReconhecimento = projetarCustos({ ...BASE, reconhecerUniaoEstavel: true });
const reconhecimento = comReconhecimento.parcelas.find((p) => p.id === 'reconhecimento-uniao-estavel')!;
eq('união estável a reconhecer: um ato sem valor declarado', reconhecimento.valor, ESCRITURA_SEM_VALOR_2026.total);
eq('reconhecimento: item 6.2 da tabela', reconhecimento.fundamento.includes('6.2'), true);
eq('união estável já formalizada: sem ato',
  projetarCustos({ ...BASE }).parcelas.some((p) => p.id === 'reconhecimento-uniao-estavel'), false);

/* ISS editável: tabela publicada com 5%; alíquota menor desconta a
   diferença sobre a parcela do Tabelião/Oficial */
eq('ISS 5% = valor publicado', emolumentoEscritura(500_000, 5), 5_519.9);
// 500k: base do Tabelião 3.231,80 → ISS 2% = 5.519,90 − 3.231,80×3% = 5.422,95
eq('ISS 2% desconta sobre a parcela do tabelião', emolumentoEscritura(500_000, 2), 5_422.95);
eq('registro com ISS 2%', emolumentoRegistro(900_000, 2), 3_892.78);
eq('comIss na certidão do RI', comIss(CERTIDAO_RI_2026, 2), 76.51);
const issBaixo = projetarCustos({ ...BASE, issPct: 2 });
eq('projeção usa o ISS informado', issBaixo.parcelas.find((p) => p.id === 'escritura')!.valor, emolumentoEscritura(450_000, 2));
eq('detalhe cita o ISS informado', issBaixo.parcelas.find((p) => p.id === 'escritura')!.detalhe!.includes('ISS de 2%'), true);

/* sucessões cumuladas: escritura + registros próprios por sucessão */
const cumulado = projetarCustos({
  ...BASE,
  sucessoes: [{ nome: 'Maria', base: 200_000, qtdImoveis: 1 }],
});
const idsCum = cumulado.parcelas.map((p) => p.id);
eq('sucessão cumulada: escritura própria', idsCum.includes('escritura-sucessao-0'), true);
eq('sucessão cumulada: registro próprio', idsCum.includes('registro-sucessao-0'), true);
// 200k → faixa 192.100,01–230.520 = R$ 3.458,80
eq('sucessão cumulada: faixa da base', cumulado.parcelas.find((p) => p.id === 'escritura-sucessao-0')!.valor, 3_458.8);
eq('sucessão cumulada: aviso do art. 672', cumulado.avisos.some((a) => a.includes('672')), true);

/* parcelas esperadas e certidões */
const ids = partilha.parcelas.map((p) => p.id);
eq('extrajudicial: parcelas esperadas', ids, [
  'escritura',
  'registro-0',
  'certidoes-registro-civil',
  'certidoes-matricula',
  'certidao-testamento',
]);
eq('registro pela faixa oficial', partilha.parcelas.find((p) => p.id === 'registro-0')!.valor, 3_962.79);

/* registro com MEEIRO: a base do ato é a fração TRANSMITIDA (meação fora),
   como na escritura — caso real do escritório: TERRENO de R$ 283.801,87 em
   partilha igualitária com viúva meeira → base do ato R$ 141.900,94. */
const comMeacao = projetarCustos({
  ...BASE,
  imoveis: [{ descricao: 'Terreno', valor: 283_801.87, valorTransmitido: 141_900.94 }],
});
const registroMeacao = comMeacao.parcelas.find((p) => p.id === 'registro-0')!;
eq('registro com meação: faixa pela base transmitida', registroMeacao.valor, emolumentoRegistro(141_900.94));
eq('registro com meação: detalhe explica a exclusão', registroMeacao.detalhe!.includes('TRANSMITIDA'), true);
eq('registro com meação: cobra MENOS que o valor cheio',
  registroMeacao.valor < emolumentoRegistro(283_801.87), true);
// Sem valorTransmitido (sem meeiro), vale o valor cheio — retrocompatível.
eq('registro sem meeiro: valor cheio', projetarCustos({
  ...BASE,
  imoveis: [{ descricao: 'Terreno', valor: 283_801.87 }],
}).parcelas.find((p) => p.id === 'registro-0')!.valor, emolumentoRegistro(283_801.87));
eq('certidão de matrícula exata', partilha.parcelas.find((p) => p.id === 'certidoes-matricula')!.valor, 77.89);
eq('escritura: ato único mesmo com vários bens e herdeiros', projetarCustos({ ...BASE, qtdHerdeiros: 8, imoveis: [
  { descricao: 'Casa', valor: 400_000 },
  { descricao: 'Sítio', valor: 300_000 },
  { descricao: 'Terreno', valor: 200_000 },
] }).parcelas.filter((p) => p.id === 'escritura').length, 1);
// certidões RC: óbito + casamento + 3 herdeiros = 5
eq('5 certidões de registro civil', partilha.parcelas.find((p) => p.id === 'certidoes-registro-civil')!.quantidade, 5);
eq('total = soma das parcelas', partilha.total, Math.round(partilha.parcelas.reduce((a, p) => a + p.valor, 0) * 100) / 100);
eq('aviso de conferência da tabela', partilha.avisos.some((a) => a.includes('anoregsp')), true);

/* partilha diferenciada: UM ato de torna pela SOMA das diferenças positivas
   e NENHUM ato de registro adicional (calibração do escritório) */
const diferenciada = projetarCustos({
  ...BASE,
  transferencias: [{ valor: 120_000, tributo: 'ITCMD_DOACAO' }],
});
const idsDif = diferenciada.parcelas.map((p) => p.id);
eq('torna vira ato próprio pela base da torna', idsDif.includes('escritura-torna'), true);
// 120 mil cai na faixa 115.260,01–153.680 → R$ 2.728,61
eq('ato da torna pela faixa do valor da torna', diferenciada.parcelas.find((p) => p.id === 'escritura-torna')!.valor, 2_728.61);
eq('torna: fundamento base = total cedido', diferenciada.parcelas.find((p) => p.id === 'escritura-torna')!.fundamento.includes('total cedido'), true);
eq('SEM ato de registro adicional na diferenciada', idsDif.includes('registro-atos-extras'), false);
eq('aviso cita o usufruto acessório (1/4 sobre 1/3)', diferenciada.avisos.some((a) => a.includes('1/3')), true);

// Caso real do escritório: viúva cede a meação, TRÊS herdeiros recebem
// 16.744,33/34 cada — UM ato só pela soma (R$ 50.233,00, faixa
// 38.420,01–76.840 → R$ 1.940,10), nunca três atos de R$ 1.209,95.
const tornaTripla = projetarCustos({
  ...BASE,
  transferencias: [
    { valor: 16_744.34, tributo: 'ITCMD_DOACAO' },
    { valor: 16_744.33, tributo: 'ITCMD_DOACAO' },
    { valor: 16_744.33, tributo: 'ITCMD_DOACAO' },
  ],
});
const atosTorna = tornaTripla.parcelas.filter((p) => p.id.startsWith('escritura-torna'));
eq('três beneficiários: UM ato só', atosTorna.length, 1);
eq('torna tripla: faixa pela soma de 50.233,00', atosTorna[0].valor, 1_940.10);
eq('torna tripla: detalhe traz a soma', atosTorna[0].detalhe!.includes('50.233,00'), true);

/* judicial: taxa por faixa no lugar da escritura; registro continua */
const judicial = projetarCustos({ ...BASE, rito: 'JUDICIAL' });
const idsJud = judicial.parcelas.map((p) => p.id);
eq('judicial: taxa entra, escritura sai', [idsJud.includes('taxa-judiciaria'), idsJud.includes('escritura')], [true, false]);
eq('900k → 300 UFESPs', judicial.parcelas.find((p) => p.id === 'taxa-judiciaria')!.valor, 11_526);
eq('aviso de despesas judiciais fora', judicial.avisos.some((a) => a.includes('perícias')), true);

/* sem imóvel: sem registro nem certidão de matrícula */
const semImovel = projetarCustos({ ...BASE, imoveis: [] });
eq('sem imóvel: sem registro', semImovel.parcelas.some((p) => p.id.startsWith('registro')), false);
eq('sem imóvel: sem certidão de matrícula', semImovel.parcelas.some((p) => p.id === 'certidoes-matricula'), false);


/* ---------- Enunciado nº 7 do CNB/SP: base da escritura ---------- */

// Venal ATUAL maior que o atribuído: a base sobe na mesma proporção,
// preservada a exclusão da meação (legítima 250k sobre 500k atribuídos;
// venal atual 600k → base 250k × 600/500 = 300k).
eq('Enunciado 7: venal atual maior eleva a base', baseDeEmolumentosDaEscritura({
  bens: [{ valor: 500_000, venalAtual: 600_000 }],
  legitima: 250_000,
}), 300_000);

// Valor atribuído maior (ou venal ausente): prevalece o atribuído — a
// legítima segue como está.
eq('Enunciado 7: atribuído maior prevalece', baseDeEmolumentosDaEscritura({
  bens: [{ valor: 500_000, venalAtual: 400_000 }],
  legitima: 250_000,
}), 250_000);
eq('Enunciado 7: sem venal, legítima intacta', baseDeEmolumentosDaEscritura({
  bens: [{ valor: 500_000 }, { valor: 100_000, venalAtual: null }],
  legitima: 300_000,
}), 300_000);

// O maior é apurado BEM A BEM: um bem com venal acima e outro abaixo não se
// compensam (500k×600k venal + 100k×80k venal → maior = 700k sobre 600k).
eq('Enunciado 7: maior bem a bem, sem compensar', baseDeEmolumentosDaEscritura({
  bens: [
    { valor: 500_000, venalAtual: 600_000 },
    { valor: 100_000, venalAtual: 80_000 },
  ],
  legitima: 300_000,
}), 350_000);

eq('Enunciado 7: legítima zerada devolve zero', baseDeEmolumentosDaEscritura({
  bens: [{ valor: 500_000, venalAtual: 600_000 }],
  legitima: 0,
}), 0);

// O fundamento da parcela da escritura cita o Enunciado 7.
eq('parcela da escritura cita o Enunciado 7',
  partilha.parcelas.find((p) => p.id === 'escritura')!.fundamento.includes('Enunciado'), true);

console.log(`\n${ok} passaram, ${fail} falharam\n`);
if (fail > 0) process.exit(1);
