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
  montarCenarioCompartilhado,
  montarEspolioDoCaso,
  VISIBILIDADE_ESPOLIO_PADRAO,
  type EntradaCenarioCompartilhado,
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
    { id: 'bem-1', descricao: 'Casa da Rua X', valor: '300000.00', fonteAvaliacao: 'valor venal (IPTU)' },
    { id: 'bem-2', descricao: 'Carro', valor: '60000.00', fonteAvaliacao: 'valor declarado pela família' },
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
  eq('bem carrega o id (âncora dos comentários)', e.bens?.[0].id, 'bem-1');
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
        id: 'bem-1',
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

/* ---------- cenários compartilhados (simulador, Etapa 4) ---------- */

{
  const entrada: EntradaCenarioCompartilhado = {
    titulo: 'Casa para Ana, carro para Bruno',
    descricao: '  ',
    bens: [
      { id: 'bem-1', descricao: 'Casa da Rua X' },
      { id: 'bem-2', descricao: 'Carro' },
      { id: 'bem-3', descricao: 'Poupança' },
    ],
    participantes: [
      { id: 'h1', nome: 'Ana Herdeira' },
      { id: 'h2', nome: 'Bruno Herdeiro' },
    ],
    alocacoes: {
      'bem-1': { h1: '100' },
      'bem-2': { h1: '50', h2: '50' },
    },
    linhas: [
      { nome: 'Ana Herdeira', direito: 180000, recebeEmBens: 330000, acertoEmDinheiro: -150000, reembolsoDespesas: 500, abateDespesas: 250, total: 180250 },
      { nome: 'Bruno Herdeiro', direito: 180000, recebeEmBens: 30000, acertoEmDinheiro: 150000, reembolsoDespesas: 0, abateDespesas: 250, total: 179750 },
    ],
    resumo: ['Ana fica com a casa e repõe a diferença em dinheiro.'],
    avisos: [],
    totalTorna: '150000.00',
    totalDespesasReconhecidas: 500,
  };
  const c = montarCenarioCompartilhado(entrada);
  eq('cenário: 100% vira só o nome', c.mapaBens[0].destino, 'Ana Herdeira');
  eq('cenário: 50/50 vira fração bonita', c.mapaBens[1].destino, 'Ana Herdeira (1/2), Bruno Herdeiro (1/2)');
  eq('cenário: bem sem linha segue a proporção', c.mapaBens[2].destino, 'segue a proporção do direito de cada um');
  eq('cenário: descrição vazia some', c.descricao, undefined);
  eq('cenário: efeito líquido das despesas', c.linhas[0].efeitoDespesas, 250);
  eq('cenário: torna presente', c.totalTorna, '150000.00');
  teste('cenário: marca que há despesas contadas', c.temDespesas);
  eq('cenário: sem autor informado fica sem autor', c.autor, undefined);
  eq(
    'cenário: autoria visível atravessa (camada 4)',
    montarCenarioCompartilhado({ ...entrada, autor: 'Dra. Beatriz Colega' }).autor,
    'Dra. Beatriz Colega',
  );

  // Não-vazamento: contaminação em linhas/participantes não atravessa.
  const contaminada = {
    ...entrada,
    participantes: [{ id: 'h1', nome: 'Ana Herdeira', cpf: '111.222.333-44', email: 'ana@x.com' }],
    linhas: [{ ...entrada.linhas[0], memoriaDeCalculo: 'legítima…', honorarios: '45000' }],
  } as unknown as EntradaCenarioCompartilhado;
  const texto = JSON.stringify(montarCenarioCompartilhado(contaminada));
  for (const proibido of ['111.222.333-44', 'ana@x.com', 'memoriaDeCalculo', 'honorarios']) {
    teste(`cenário não contém "${proibido}"`, !texto.includes(proibido));
  }

  // Isolamento de referência: mutar a entrada não muda o snapshot.
  const c2 = montarCenarioCompartilhado(entrada);
  entrada.alocacoes['bem-1'].h1 = '0';
  eq('cenário: alocacoes copiadas por valor', c2.alocacoes['bem-1'].h1, '100');
}

console.log(`\n${ok} passaram, ${fail} falharam\n`);
if (fail > 0) process.exit(1);
