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
  transferencias: [],
};

const ids = (e: EntradaEconomia) => mapearEconomias(e).map((o) => o.id);

// Caso cedo, sem sobrevivente: prazos são as oportunidades.
eq('30 dias: desconto + abertura', ids(BASE), ['desconto-90-dias', 'abertura-60-dias']);
const cedo = mapearEconomias(BASE);
eq('desconto = 5% do imposto', cedo[0].economiaEstimada, 2_000);
eq('abertura evita 10%', cedo[1].economiaEstimada, 4_000);
eq('desconto mostra os dias restantes', cedo[0].titulo.includes('restam 60 dia(s)'), true);

// Protocolado: some a multa de abertura; o desconto continua.
eq('protocolado: sem abertura', ids({ ...BASE, protocolado: true }), ['desconto-90-dias']);

// 120 dias: janela do vencimento + impedir a dobra da multa.
eq('120 dias: vencimento + dobra', ids({ ...BASE, diasDesdeObito: 120 }), [
  'vencimento-180-dias',
  'abertura-180-dias',
]);

// Depois de 180 dias sem imposto novo a economizar por prazo.
eq('200 dias: nada de prazo', ids({ ...BASE, diasDesdeObito: 200 }), []);

// Viúva meeira com imóvel: o usufruto entra como economia FUTURA.
const comViuva = mapearEconomias({
  ...BASE,
  diasDesdeObito: 200,
  valorSobrevivente: 450_000,
  nomeSobrevivente: 'Maria',
});
eq('viúva: oportunidade de usufruto', comViuva.map((o) => o.id), ['usufruto-nua-propriedade']);
eq('usufruto é FUTURA e não aplicada', [comViuva[0].horizonte, comViuva[0].aplicada], ['FUTURA', false]);
// Base futura limitada ao valor dos imóveis × ao valor do sobrevivente.
eq('economia futura = 4% × min(quinhão, imóveis)', comViuva[0].economiaEstimada, 18_000);
eq('explicação cita a viúva', comViuva[0].explicacao.includes('Maria'), true);
const viuvaRica = mapearEconomias({
  ...BASE,
  diasDesdeObito: 200,
  valorSobrevivente: 2_000_000,
  nomeSobrevivente: 'Maria',
});
eq('teto pelos imóveis', viuvaRica[0].economiaEstimada, 36_000);

// Sem imóvel não há segundo inventário a evitar por usufruto.
eq('sem imóvel: sem usufruto', ids({
  ...BASE,
  diasDesdeObito: 200,
  valorSobrevivente: 450_000,
  bens: [{ descricao: 'CDB', valor: 300_000, tipo: 'FINANCEIRO' }],
}), []);

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
eq('tornas: isenta + acima do teto', comTornas.map((o) => o.id), [
  'torna-gratuita-isenta',
  'torna-acima-da-isencao',
]);
eq('torna isenta poupa 4%', comTornas[0].economiaEstimada, 2_000);
eq('torna tributada: economia = imposto montado', comTornas[1].economiaEstimada, 12_000);

// Reposição onerosa (ITBI): sugerir a comparação com a doação isenta.
const comItbi = mapearEconomias({
  ...BASE,
  diasDesdeObito: 200,
  transferencias: [{ valor: 60_000, titulo: 'ONEROSO', tributo: 'ITBI', imposto: null }],
});
eq('ITBI vira sugestão de doação', comItbi.map((o) => o.id), ['torna-onerosa-vs-doacao']);
eq('ITBI: economia não quantificável daqui', comItbi[0].economiaEstimada, null);
eq('ITBI: alerta contra simulação', comItbi[0].condicoes.some((c) => c.includes('fraude')), true);

// Total estimado ignora as não quantificáveis.
eq('total estimado', totalEstimado(comTornas), 14_000);

console.log(`\n${ok} passaram, ${fail} falharam\n`);
if (fail > 0) process.exit(1);
