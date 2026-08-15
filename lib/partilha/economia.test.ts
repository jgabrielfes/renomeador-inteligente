/**
 * Casos de teste do mapeador de oportunidades de economia.
 *
 * Roda sem dependência externa:
 *   npx tsx lib/partilha/economia.test.ts
 */

import { mapearEconomias, totalEstimado, type EntradaEconomia } from './economia';

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

/* ---------- usufruto: a economia depende da torna ser isenta ---------- */

// Viúva meeira com imóvel e SEM outros bens: a torna da reserva (450 mil)
// passa da isenção de 2 herdeiros (2 × 2.500 × 38,42 = 192.100) — o card
// avisa do ITCMD inter vivos e a economia cai para o líquido.
const comViuva = mapearEconomias({
  ...BASE,
  diasDesdeObito: 200,
  valorSobrevivente: 450_000,
  nomeSobrevivente: 'Maria',
});
eq('viúva: defesa + usufruto + IR', comViuva.map((o) => o.id), [
  'defesa-multa-abertura',
  'usufruto-nua-propriedade',
  'valor-transmissao-ir',
]);
const usufrutoComExcesso = comViuva[1];
eq('usufruto é FUTURA e não aplicada', [usufrutoComExcesso.horizonte, usufrutoComExcesso.aplicada], ['FUTURA', false]);
// Excesso = 450.000 − 192.100 = 257.900 → ITCMD inter vivos 10.316;
// economia futura 18.000 − 10.316 = 7.684 (líquida).
eq('excesso: economia LÍQUIDA do ITCMD inter vivos', usufrutoComExcesso.economiaEstimada, 7_684);
eq('excesso: o card avisa do imposto antecipado', usufrutoComExcesso.explicacao.includes('ATENÇÃO'), true);
eq('explicação cita a viúva', usufrutoComExcesso.explicacao.includes('Maria'), true);
eq('condição sugere limitar/escalonar', usufrutoComExcesso.condicoes.some((c) => c.includes('escalonar')), true);

// Com outros bens compensando a viúva, NÃO há torna — economia integral.
const viuvaCompensada = mapearEconomias({
  ...BASE,
  diasDesdeObito: 200,
  valorSobrevivente: 450_000,
  nomeSobrevivente: 'Maria',
  bens: [
    { descricao: 'Casa', valor: 900_000, tipo: 'IMOVEL' },
    { descricao: 'CDB', valor: 500_000, tipo: 'FINANCEIRO' },
  ],
});
const usufrutoSemTorna = viuvaCompensada.find((o) => o.id === 'usufruto-nua-propriedade')!;
eq('sem torna: economia futura integral', usufrutoSemTorna.economiaEstimada, 18_000);
eq('sem torna: card diz que a compensação fecha', usufrutoSemTorna.explicacao.includes('não cede nada'), true);

// Torna pequena DENTRO da isenção: economia real, card confirma.
const viuvaIsenta = mapearEconomias({
  ...BASE,
  diasDesdeObito: 200,
  valorSobrevivente: 450_000,
  nomeSobrevivente: 'Maria',
  qtdHerdeiros: 5, // 5 × 96.050 = 480.250 de isenção ≥ 450.000 de torna
});
const usufrutoIsento = viuvaIsenta.find((o) => o.id === 'usufruto-nua-propriedade')!;
eq('torna isenta: economia integral', usufrutoIsento.economiaEstimada, 18_000);
eq('torna isenta: card confirma a isenção', usufrutoIsento.explicacao.includes('CABE na isenção'), true);

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
});
eq('teto pelos imóveis', viuvaRica.find((o) => o.id === 'usufruto-nua-propriedade')!.economiaEstimada, 36_000);

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
