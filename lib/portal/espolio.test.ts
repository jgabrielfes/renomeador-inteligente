/**
 * Testes do snapshot compartilhado do Espaço do Espólio — o contrato é o
 * mesmo do painel individual: NÃO-VAZAMENTO por construção (entrada
 * contaminada com campos sensíveis não atravessa) + o específico desta
 * camada: só NOME e PAPEL circulam entre herdeiros (nenhum contato), e o
 * conteúdo é IGUAL para todos (não depende de token).
 *
 * Roda sem dependência externa:
 *   npx tsx lib/portal/espolio.test.ts
 */

import {
  AVISO_ESPOLIO,
  montarEspolioDoCaso,
  VISIBILIDADE_ESPOLIO_PADRAO,
  type EntradaEspolio,
  type VisibilidadeEspolio,
} from './espolio';

let ok = 0, fail = 0;
function teste(nome: string, cond: boolean, detalhe?: string) {
  if (cond) ok++;
  else { fail++; console.error(`  ✗ ${nome}${detalhe ? `\n    ${detalhe}` : ''}`); }
}
function eq(nome: string, a: unknown, e: unknown) {
  teste(nome, JSON.stringify(a) === JSON.stringify(e), `esperado ${JSON.stringify(e)}, obtido ${JSON.stringify(a)}`);
}

const TUDO: VisibilidadeEspolio = { aberto: true, bens: true, dividas: true, quinhoes: true };

const entradaBase = (): EntradaEspolio => ({
  nomeFalecido: 'José Exemplo',
  participantes: [
    { nome: 'Maria Viúva', papel: 'cônjuge meeiro(a)' },
    { nome: 'Ana Herdeira', papel: 'inventariante' },
    { nome: 'Bruno Herdeiro', papel: 'herdeiro(a)' },
  ],
  bens: [
    { descricao: 'Casa da Rua X', valor: '300000.00', fonteAvaliacao: 'valor venal (IPTU)' },
    { descricao: 'Carro', valor: '60000.00', fonteAvaliacao: 'valor declarado pela família' },
  ],
  totalAcervo: '360000.00',
  dividas: [{ descricao: 'Dívidas do espólio (total declarado)', valor: '12000.00' }],
  quinhoes: [
    { nome: 'Maria Viúva', papel: 'cônjuge meeiro(a)', valor: '180000.00', fracao: 'meação' },
    { nome: 'Ana Herdeira', papel: 'inventariante', valor: '90000.00', fracao: '1/2' },
    { nome: 'Bruno Herdeiro', papel: 'herdeiro(a)', valor: '90000.00', fracao: '1/2' },
  ],
});

console.log('\nEspaço do Espólio — snapshot compartilhado\n');

/* ---------- interruptor e visibilidades ---------- */

eq('fechado por padrão devolve null', montarEspolioDoCaso(entradaBase(), VISIBILIDADE_ESPOLIO_PADRAO), null);

{
  const e = montarEspolioDoCaso(entradaBase(), TUDO)!;
  eq('aberto: participantes com nome e papel', e.participantes.length, 3);
  eq('bens com fonte da avaliação', e.bens?.[0].fonteAvaliacao, 'valor venal (IPTU)');
  eq('total do acervo', e.totalAcervo, '360000.00');
  eq('dívidas visíveis', e.dividas?.length, 1);
  eq('quinhões de TODOS', e.quinhoes?.length, 3);
  eq('aviso fixo presente', e.aviso, AVISO_ESPOLIO);
}

{
  const e = montarEspolioDoCaso(entradaBase(), { aberto: true, bens: false, dividas: true, quinhoes: false })!;
  eq('bens desligados: fora', e.bens, undefined);
  eq('bens desligados: total também fora', e.totalAcervo, undefined);
  eq('quinhões desligados: fora', e.quinhoes, undefined);
  teste('sem quinhão liberado, nenhum valor de quinhão no snapshot', !JSON.stringify(e).includes('90000'));
}

/* ---------- não-vazamento: contaminação não atravessa ---------- */

{
  const contaminada = {
    ...entradaBase(),
    honorarios: { percentual: 10, valor: '45000.00' },
    notas: 'anotação interna do escritório',
    participantes: [
      {
        nome: 'Ana Herdeira',
        papel: 'inventariante',
        email: 'ana@exemplo.com',
        telefone: '11 99999-0000',
        cpf: '111.222.333-44',
        endereco: 'Rua Sigilosa, 1',
      },
    ],
    bens: [
      {
        descricao: 'Casa da Rua X',
        valor: '300000.00',
        fonteAvaliacao: 'laudo',
        matricula: '12.345 do 9º RI',
        analiseMatricula: 'hipoteca ativa',
      },
    ],
    quinhoes: [
      {
        nome: 'Ana Herdeira',
        papel: 'inventariante',
        valor: '90000.00',
        memoriaDeCalculo: 'legítima…',
      },
    ],
  } as unknown as EntradaEspolio;

  const texto = JSON.stringify(montarEspolioDoCaso(contaminada, TUDO));
  for (const proibido of [
    'honorarios', '45000', 'anotação interna', 'ana@exemplo.com', '99999',
    '111.222.333-44', 'Rua Sigilosa', '12.345', 'hipoteca', 'memoriaDeCalculo',
  ]) {
    teste(`snapshot não contém "${proibido}"`, !texto.includes(proibido));
  }
}

/* ---------- igual para todos + isolamento de referências ---------- */

{
  const a = montarEspolioDoCaso(entradaBase(), TUDO)!;
  const b = montarEspolioDoCaso(entradaBase(), TUDO)!;
  eq('duas montagens do mesmo caso são idênticas (não há recorte por herdeiro)', a, b);

  const entrada = entradaBase();
  const e = montarEspolioDoCaso(entrada, TUDO)!;
  entrada.bens[0].descricao = 'ALTERADO';
  teste('mutar a entrada não muda o snapshot (cópia campo a campo)', e.bens?.[0].descricao === 'Casa da Rua X');
}

console.log(`\n${ok} passaram, ${fail} falharam\n`);
if (fail > 0) process.exit(1);
