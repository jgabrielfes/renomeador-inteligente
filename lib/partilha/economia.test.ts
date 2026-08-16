/**
 * Casos de teste do mapeador de oportunidades de economia.
 *
 * Roda sem dependência externa:
 *   npx tsx lib/partilha/economia.test.ts
 */

import { mapearEconomias, totalEstimado, type EntradaEconomia } from './economia';
import { emolumentoEscritura, emolumentoRegistro } from './custas';

const r2 = (v: number) => Math.round(v * 100) / 100;

/**
 * Recalcula a economia LÍQUIDA do usufruto pelo mesmo raciocínio do motor:
 * ITCMD futuro evitado − (escritura da torna + registro desmembrado + ITCMD
 * inter vivos). Mantém o teste em sincronia com as tabelas de custas.
 */
function liquidaUsufruto(o: {
  valorSobrevivente: number;
  valorImoveis: number;
  valorNaoImoveis: number;
  ufesp: number;
  qtdHerdeiros: number;
  iss?: number;
}): number {
  const iss = o.iss ?? 5;
  const valorUsufruto = r2(o.valorImoveis / 3);
  const valorNua = r2(o.valorImoveis - valorUsufruto);
  const baseFutura = Math.min(o.valorSobrevivente, o.valorImoveis);
  const retido = Math.min(o.valorSobrevivente, valorUsufruto + o.valorNaoImoveis);
  const torna = r2(Math.max(0, o.valorSobrevivente - retido));
  const teto = r2(2500 * o.ufesp * Math.max(1, o.qtdHerdeiros));
  const excesso = r2(Math.max(0, torna - teto));
  const itcmdInterVivos = r2(excesso * 0.04);
  const itcmdFuturo = r2(baseFutura * 0.04);
  const escrTorna = torna > 0 ? emolumentoEscritura(torna, iss) : 0;
  const regExtra = r2(
    Math.max(0, r2(emolumentoRegistro(valorUsufruto, iss) + emolumentoRegistro(valorNua, iss)) - emolumentoRegistro(o.valorImoveis, iss)),
  );
  const custoAgora = r2(escrTorna + regExtra + itcmdInterVivos);
  return r2(itcmdFuturo - custoAgora);
}

let ok = 0, fail = 0;
function eq(nome: string, a: unknown, e: unknown) {
  if (JSON.stringify(a) === JSON.stringify(e)) ok++;
  else { fail++; console.error(`  ✗ ${nome}\n    esperado ${JSON.stringify(e)}\n    obtido   ${JSON.stringify(a)}`); }
}

console.log('\nEconomia — mapeador de oportunidades\n');

const BASE: EntradaEconomia = {
  valorSobrevivente: 0,
  nomeSobrevivente: null,
  bens: [{ descricao: 'Casa', valor: 900_000, tipo: 'IMOVEL' }],
  imposto: 40_000,
  diasDesdeObito: 30,
  protocolado: false,
  valorIsento: 0,
  ufespReferencia: 38.42,
  qtdHerdeiros: 2,
  transferencias: [],
};

const ids = (e: EntradaEconomia) => mapearEconomias(e).map((o) => o.id);

// A escolha do valor da transmissão no IR (art. 23 da Lei 9.532/97) vale
// para todo caso com bens — aparece em todas as listas abaixo.
eq('IR da transmissão sempre presente', ids(BASE).includes('valor-transmissao-ir'), true);
const semBens = mapearEconomias({ ...BASE, bens: [], imposto: null });
eq('sem bens: nem IR nem nada', semBens.map((o) => o.id), []);

// Caso cedo, sem sobrevivente: prazos são as oportunidades.
eq('30 dias: desconto + abertura', ids(BASE), ['desconto-90-dias', 'abertura-60-dias', 'valor-transmissao-ir']);
const cedo = mapearEconomias(BASE);
eq('desconto = 5% do imposto', cedo[0].economiaEstimada, 2_000);
eq('abertura evita 10%', cedo[1].economiaEstimada, 4_000);
eq('desconto mostra os dias restantes', cedo[0].titulo.includes('restam 60 dia(s)'), true);

// Protocolado: some a multa de abertura; o desconto continua.
eq('protocolado: sem abertura', ids({ ...BASE, protocolado: true }), ['desconto-90-dias', 'valor-transmissao-ir']);

// 120 dias: janela do vencimento + impedir a dobra da multa.
eq('120 dias: vencimento + dobra', ids({ ...BASE, diasDesdeObito: 120 }), [
  'vencimento-180-dias',
  'abertura-180-dias',
  'valor-transmissao-ir',
]);

// Depois de 180 dias o prazo virou TESE: defesa da multa no extrajudicial.
eq('200 dias: defesa da multa', ids({ ...BASE, diasDesdeObito: 200 }), [
  'defesa-multa-abertura',
  'valor-transmissao-ir',
]);
const defesa = mapearEconomias({ ...BASE, diasDesdeObito: 200 })[0];
eq('defesa vale a multa de 20%', defesa.economiaEstimada, 8_000);
eq('defesa cita o TJSP', defesa.fundamento.includes('TJSP'), true);
// No rito judicial a tese não se aplica.
eq('200 dias judicial: sem defesa', ids({ ...BASE, diasDesdeObito: 200, extrajudicial: false }), [
  'valor-transmissao-ir',
]);

/* ---------- usufruto: raciocínio completo (coeficientes + custas) ---------- */

// Exemplo do escritório: imóvel de 250.000, viúva meeira (125.000), 2 herdeiros.
// Usufruto (1/3) = 83.333,33 → torna = 125.000 − 83.333,33 = 41.666,67 (isenta).
// A economia é o ITCMD futuro (5.000) menos as custas extra do desenho.
const exemplo = mapearEconomias({
  ...BASE,
  diasDesdeObito: 200,
  valorSobrevivente: 125_000,
  nomeSobrevivente: 'Maria',
  bens: [{ descricao: 'Imóvel', valor: 250_000, tipo: 'IMOVEL' }],
  ufespReferencia: 38.42,
  qtdHerdeiros: 2,
});
const usoExemplo = exemplo.find((o) => o.id === 'usufruto-nua-propriedade')!;
eq('usufruto é FUTURA e não aplicada', [usoExemplo.horizonte, usoExemplo.aplicada], ['FUTURA', false]);
eq('exemplo: líquida = ITCMD futuro − custas extra', usoExemplo.economiaEstimada,
  liquidaUsufruto({ valorSobrevivente: 125_000, valorImoveis: 250_000, valorNaoImoveis: 0, ufesp: 38.42, qtdHerdeiros: 2 }));
eq('exemplo: torna 41.666,67 cabe na isenção', usoExemplo.explicacao.includes('CABE na isenção'), true);
eq('exemplo: mostra os coeficientes 1/3 e 2/3', usoExemplo.explicacao.includes('(1/3)') && usoExemplo.explicacao.includes('(2/3)'), true);
eq('exemplo: cita o registro desmembrado', usoExemplo.explicacao.includes('registro desmembrado'), true);
eq('explicação cita a viúva', usoExemplo.explicacao.includes('Maria'), true);

// Torna acima da isenção: o card avisa do ITCMD inter vivos.
const comExcesso = mapearEconomias({
  ...BASE,
  diasDesdeObito: 200,
  valorSobrevivente: 900_000,
  nomeSobrevivente: 'Maria',
  bens: [{ descricao: 'Casa', valor: 1_800_000, tipo: 'IMOVEL' }],
  ufespReferencia: 38.42,
  qtdHerdeiros: 2,
});
const usoExcesso = comExcesso.find((o) => o.id === 'usufruto-nua-propriedade')!;
eq('excesso: economia LÍQUIDA', usoExcesso.economiaEstimada,
  liquidaUsufruto({ valorSobrevivente: 900_000, valorImoveis: 1_800_000, valorNaoImoveis: 0, ufesp: 38.42, qtdHerdeiros: 2 }));
eq('excesso: o card avisa do imposto antecipado', usoExcesso.explicacao.includes('ATENÇÃO'), true);
eq('condição sugere limitar/escalonar', usoExcesso.condicoes.some((c) => c.includes('escalonar')), true);

// Com outros bens compensando a viúva, NÃO há torna — mas o registro
// desmembrado ainda tem custo, então a líquida < ITCMD futuro cheio.
const viuvaCompensada = mapearEconomias({
  ...BASE,
  diasDesdeObito: 200,
  valorSobrevivente: 450_000,
  nomeSobrevivente: 'Maria',
  bens: [
    { descricao: 'Casa', valor: 900_000, tipo: 'IMOVEL' },
    { descricao: 'CDB', valor: 500_000, tipo: 'FINANCEIRO' },
  ],
  ufespReferencia: 38.42,
});
const usufrutoSemTorna = viuvaCompensada.find((o) => o.id === 'usufruto-nua-propriedade')!;
eq('sem torna: líquida = 18.000 − registro extra', usufrutoSemTorna.economiaEstimada,
  liquidaUsufruto({ valorSobrevivente: 450_000, valorImoveis: 900_000, valorNaoImoveis: 500_000, ufesp: 38.42, qtdHerdeiros: 2 }));
eq('sem torna: card diz que a compensação fecha', usufrutoSemTorna.explicacao.includes('não cede nada'), true);

// Base futura limitada ao valor dos imóveis (viúva "rica" compensada).
const viuvaRica = mapearEconomias({
  ...BASE,
  diasDesdeObito: 200,
  valorSobrevivente: 2_000_000,
  nomeSobrevivente: 'Maria',
  bens: [
    { descricao: 'Casa', valor: 900_000, tipo: 'IMOVEL' },
    { descricao: 'Aplicações', valor: 2_000_000, tipo: 'FINANCEIRO' },
  ],
  ufespReferencia: 38.42,
});
eq('teto pelos imóveis', viuvaRica.find((o) => o.id === 'usufruto-nua-propriedade')!.economiaEstimada,
  liquidaUsufruto({ valorSobrevivente: 2_000_000, valorImoveis: 900_000, valorNaoImoveis: 2_000_000, ufesp: 38.42, qtdHerdeiros: 2 }));

// Sem imóvel não há segundo inventário a evitar por usufruto.
eq('sem imóvel: sem usufruto', ids({
  ...BASE,
  diasDesdeObito: 200,
  valorSobrevivente: 450_000,
  bens: [{ descricao: 'CDB', valor: 300_000, tipo: 'FINANCEIRO' }],
}).includes('usufruto-nua-propriedade'), false);

/* ---------- demais oportunidades ---------- */

// Isenção do art. 6º identificada: economia aplicada de 4%.
const comIsencao = mapearEconomias({ ...BASE, diasDesdeObito: 200, valorIsento: 90_000 });
eq('isenção aplicada', [comIsencao[0].id, comIsencao[0].aplicada], ['isencao-art6', true]);
eq('isenção economiza 4%', comIsencao[0].economiaEstimada, 3_600);

// Torna gratuita isenta = economia garantida; tributada = oportunidade.
const comTornas = mapearEconomias({
  ...BASE,
  diasDesdeObito: 200,
  transferencias: [
    { valor: 50_000, titulo: 'GRATUITO', tributo: 'ITCMD_DOACAO', imposto: 0 },
    { valor: 300_000, titulo: 'GRATUITO', tributo: 'ITCMD_DOACAO', imposto: 12_000 },
  ],
});
eq('tornas: isenta + defesa + acima do teto + IR', comTornas.map((o) => o.id), [
  'torna-gratuita-isenta',
  'defesa-multa-abertura',
  'torna-acima-da-isencao',
  'valor-transmissao-ir',
]);
eq('torna isenta poupa 4%', comTornas[0].economiaEstimada, 2_000);
eq('torna tributada: economia = imposto montado', comTornas[2].economiaEstimada, 12_000);

// Reposição onerosa (ITBI): sugerir a comparação com a doação isenta.
const comItbi = mapearEconomias({
  ...BASE,
  diasDesdeObito: 200,
  extrajudicial: false,
  transferencias: [{ valor: 60_000, titulo: 'ONEROSO', tributo: 'ITBI', imposto: null }],
});
eq('ITBI vira sugestão de doação', comItbi.map((o) => o.id), ['torna-onerosa-vs-doacao', 'valor-transmissao-ir']);
eq('ITBI: economia não quantificável daqui', comItbi[0].economiaEstimada, null);
eq('ITBI: alerta contra simulação', comItbi[0].condicoes.some((c) => c.includes('fraude')), true);

// Quotas no acervo: sobrepartilha do art. 669 do CPC entra como sugestão.
const comQuotas = mapearEconomias({
  ...BASE,
  diasDesdeObito: 200,
  extrajudicial: false,
  bens: [
    { descricao: 'Casa', valor: 900_000, tipo: 'IMOVEL' },
    { descricao: 'Quotas da Empresa X', valor: 500_000, tipo: 'QUOTAS' },
  ],
});
eq('quotas: sobrepartilha sugerida', comQuotas.map((o) => o.id), [
  'valor-transmissao-ir',
  'sobrepartilha-bens-morosos',
]);
eq('sobrepartilha cita o art. 669', comQuotas[1].fundamento.includes('669'), true);

// Total estimado ignora as não quantificáveis.
eq('total estimado', totalEstimado(comTornas), 22_000);

console.log(`\n${ok} passaram, ${fail} falharam\n`);
if (fail > 0) process.exit(1);
