/**
 * Testes do motor de CENÁRIOS de partilha — a mesma apuração da seção III,
 * agora pura, que o Espaço do Espólio consome. Cobrem: células da matriz
 * (percentual × fração exata), a regressão da dízima (33,33 ×3 sem torna
 * fantasma), tornas com título oneroso, despesas adiantadas, validação
 * cogente (menor/incapaz) e o resumo leigo.
 *
 * Roda sem dependência externa:
 *   npx tsx lib/partilha/cenario.test.ts
 */

import { partilhar } from './engine';
import type { Caso, Herdeiro } from './types';
import {
  apurarCenario,
  direitosDoResultado,
  fracaoBonita,
  fracaoDaCelula,
  participantesDoResultado,
  pctNum,
  resumoDoCenario,
  temAlocacao,
  validarCenario,
} from './cenario';

let ok = 0, fail = 0;
function teste(nome: string, cond: boolean, detalhe?: string) {
  if (cond) ok++;
  else { fail++; console.error(`  ✗ ${nome}${detalhe ? `\n    ${detalhe}` : ''}`); }
}
function eq(nome: string, a: unknown, e: unknown) {
  teste(nome, JSON.stringify(a) === JSON.stringify(e), `esperado ${JSON.stringify(e)}, obtido ${JSON.stringify(a)}`);
}

const filho = (id: string, extra?: Partial<Herdeiro>): Herdeiro => ({
  id,
  nome: id,
  classe: 'DESCENDENTE',
  grau: 1,
  status: 'ATIVO',
  filhoDoSobrevivente: true,
  ...extra,
});

/** 3 filhos, sem cônjuge, 2 bens: casa 300k + carro 60k → 120k cada. */
const casoBase = (): Caso => ({
  falecido: { dataObito: '2026-03-14' },
  sobrevivente: null,
  herdeiros: [filho('ana'), filho('bruno'), filho('carla')],
  bens: [
    { id: 'casa', descricao: 'Casa da Rua X', valor: '300000.00', natureza: 'PARTICULAR' },
    { id: 'carro', descricao: 'Carro', valor: '60000.00', natureza: 'PARTICULAR' },
  ],
});

console.log('\nCenário de partilha — motor puro (um motor, dois públicos)\n');

/* ---------- células da matriz ---------- */

eq('pctNum percentual com vírgula', pctNum('33,33'), 33.33);
teste('pctNum fração exata', Math.abs(pctNum('1/3') - 33.3333) < 0.001);
eq('pctNum vazio', pctNum(''), 0);
eq('fracaoDaCelula fração', fracaoDaCelula('2/5'), { n: 2, d: 5 });
eq('fracaoDaCelula percentual vira n/1.000.000', fracaoDaCelula('50'), { n: 500000, d: 1_000_000 });
eq('fracaoBonita casa 33,33 em 1/3', fracaoBonita(33.33), '1/3');
eq('fracaoBonita 50 em 1/2', fracaoBonita(50), '1/2');
eq('fracaoBonita sem casamento limpo', fracaoBonita(33.3), null);

/* ---------- derivações do resultado ---------- */

{
  const caso = casoBase();
  const r = partilhar(caso);
  eq('participantes: os 3 filhos', participantesDoResultado(r).map((p) => p.id), ['ana', 'bruno', 'carla']);
  const direitos = direitosDoResultado(r);
  eq('direito de cada um: 120k', direitos['ana'], 120000);
  teste('temAlocacao falso com matriz vazia', !temAlocacao({}, caso.bens, participantesDoResultado(r)));
  teste('temAlocacao verdadeiro com célula', temAlocacao({ casa: { ana: '100' } }, caso.bens, participantesDoResultado(r)));
}

/* ---------- matriz vazia = proporção do direito, sem torna ---------- */

{
  const caso = casoBase();
  const c = apurarCenario({ caso, resultado: partilhar(caso), alocacoes: {} });
  eq('sem alocação: sem bloqueios', c.bloqueios, []);
  eq('sem alocação: torna zero', c.totalTorna, '0.00');
  teste('cada linha termina no direito', c.linhas.every((l) => Math.abs(l.total - l.direito) < 0.01));
}

/* ---------- regressão da dízima: 33,33 ×3 não fabrica torna ---------- */

{
  const caso = casoBase();
  const aloc = { casa: { ana: '33,33', bruno: '33,33', carla: '33,33' } };
  const c = apurarCenario({ caso, resultado: partilhar(caso), alocacoes: aloc });
  eq('33,33 ×3: sem bloqueio (fecha 100 na tolerância)', c.bloqueios, []);
  eq('33,33 ×3: torna zero (frações normalizadas pela própria soma)', c.totalTorna, '0.00');
}

/* ---------- linha que não fecha 100% = bloqueio com a mensagem da seção III ---------- */

{
  const caso = casoBase();
  const c = apurarCenario({
    caso,
    resultado: partilhar(caso),
    alocacoes: { casa: { ana: '50', bruno: '20' } },
  });
  eq('linha 70%: um bloqueio', c.bloqueios.length, 1);
  teste(
    'mensagem leiga idêntica à da seção III',
    c.bloqueios[0].startsWith('Bem 1: os percentuais somam 70% — a linha precisa fechar 100%'),
    c.bloqueios[0],
  );
  eq('linha inválida: sem apuração técnica', c.atribuicao, null);
}

/* ---------- cenário "Ana fica com a casa", título ONEROSO ---------- */

{
  const caso = casoBase();
  const aloc = { casa: { ana: '100' } }; // carro segue a proporção do direito
  const c = apurarCenario({ caso, resultado: partilhar(caso), alocacoes: aloc, titulo: 'ONEROSO' });
  const ana = c.linhas.find((l) => l.id === 'ana')!;
  const bruno = c.linhas.find((l) => l.id === 'bruno')!;
  eq('sem bloqueios', c.bloqueios, []);
  eq('Ana recebe a casa + 1/3 do carro', ana.recebeEmBens, 320000);
  eq('Ana repõe 200k em dinheiro', ana.acertoEmDinheiro, -200000);
  eq('Bruno recebe 100k em dinheiro', bruno.acertoEmDinheiro, 100000);
  teste('todos terminam no direito', c.linhas.every((l) => Math.abs(l.total - l.direito) < 0.01));
  teste('torna total 200k', Number(c.totalTorna) === 200000, c.totalTorna);

  const frases = resumoDoCenario(c);
  teste('resumo tem até 3 frases', frases.length > 0 && frases.length <= 3);
  teste('resumo nomeia quem fica com mais', frases[0].includes('ana'));
  teste('resumo diz quem repõe', frases.some((f) => f.includes('repõe')));
}

/* ---------- título GRATUITO: cessão aparece e a validação avisa ---------- */

{
  const caso = casoBase();
  const aloc = { casa: { ana: '100' }, carro: { ana: '100' } };
  const c = apurarCenario({ caso, resultado: partilhar(caso), alocacoes: aloc, titulo: 'GRATUITO' });
  const bruno = c.linhas.find((l) => l.id === 'bruno')!;
  eq('Bruno cede o quinhão inteiro', bruno.cedeGratuitamente, 120000);
  eq('Bruno sai com zero', bruno.total, 0);
  const v = validarCenario(caso, c);
  eq('dois avisos leigos (Bruno e Carla)', v.avisos.length, 2);
  teste('aviso fala em cessão gratuita', v.avisos[0].includes('cessão gratuita'), v.avisos[0]);
  eq('sem bloqueio (adultos capazes)', v.bloqueios, []);
}

/* ---------- menor/incapaz não pode abrir mão: bloqueio ---------- */

{
  const caso = casoBase();
  caso.herdeiros = [filho('ana'), filho('bruno'), filho('carla', { menorOuIncapaz: true })];
  const aloc = { casa: { ana: '100' }, carro: { ana: '100' } };
  const c = apurarCenario({ caso, resultado: partilhar(caso), alocacoes: aloc, titulo: 'GRATUITO' });
  const v = validarCenario(caso, c);
  eq('um bloqueio (Carla é incapaz)', v.bloqueios.length, 1);
  teste('bloqueio leigo nomeia a proteção legal', v.bloqueios[0].includes('menor ou incapaz'), v.bloqueios[0]);
  eq('Bruno (capaz) segue como aviso', v.avisos.length, 1);
}

/* ---------- despesas adiantadas reconhecidas alteram o resultado ---------- */

{
  const caso = casoBase();
  const semDespesa = apurarCenario({ caso, resultado: partilhar(caso), alocacoes: {} });
  const comDespesa = apurarCenario({
    caso,
    resultado: partilhar(caso),
    alocacoes: {},
    despesas: [{ participanteId: 'ana', descricao: 'Funeral', valor: 9000, tratamento: 'ressarcir' }],
  });
  const ana = comDespesa.linhas.find((l) => l.id === 'ana')!;
  const bruno = comDespesa.linhas.find((l) => l.id === 'bruno')!;
  eq('Ana recebe o reembolso integral', ana.reembolsoDespesas, 9000);
  eq('rateio de Ana (1/3 de 9k)', ana.abateDespesas, 3000);
  eq('Ana sai 6k acima do direito', ana.total - ana.direito, 6000);
  eq('Bruno sai 3k abaixo do direito', bruno.total - bruno.direito, -3000);
  const somaAjustes = comDespesa.linhas.reduce((a, l) => a + (l.reembolsoDespesas - l.abateDespesas), 0);
  teste('os ajustes de despesa somam zero', Math.abs(somaAjustes) < 0.01, String(somaAjustes));
  teste(
    'despesa reconhecida muda o total em relação ao cenário sem despesa',
    comDespesa.linhas.some((l, i) => l.total !== semDespesa.linhas[i].total),
  );
  teste('resumo menciona as despesas', resumoDoCenario(comDespesa).some((f) => f.includes('despesas adiantadas')));
}

console.log(`\n${ok} passaram, ${fail} falharam\n`);
if (fail > 0) process.exit(1);
