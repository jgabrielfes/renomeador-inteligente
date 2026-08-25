/**
 * Testes ANTI-VAZAMENTO do Radar: o objeto que o advogado vê jamais contém
 * nome, e-mail, telefone, nome do falecido, token nem a DATA EXATA do óbito —
 * nem quando a entrada vem contaminada com campos extras.
 *
 * Uma exceção deliberada: as `observacoes` (o campo livre "quer explicar
 * algo?") passam a atravessar, por decisão do escritório, e a família é
 * avisada disso no próprio campo e no diálogo de publicação. Os testes abaixo
 * fixam as DUAS coisas: que elas atravessam (para ninguém "consertar" isso
 * por engano) e que nada mais do que a allowlist atravessa junto.
 *
 *   npx tsx lib/radar/anonimizar.test.ts
 */

import { RESPOSTAS_INICIAIS, type RespostasFamilia } from '@/lib/familias/tipos';
import { anonimizarIntake, rotuloFaixaAcervo } from './anonimizar';

let ok = 0, fail = 0;
function teste(nome: string, cond: boolean, detalhe?: string) {
  if (cond) ok++;
  else { fail++; console.error(`  ✗ ${nome}${detalhe ? `\n    ${detalhe}` : ''}`); }
}
function eq(nome: string, a: unknown, e: unknown) {
  teste(nome, JSON.stringify(a) === JSON.stringify(e), `esperado ${JSON.stringify(e)}, obtido ${JSON.stringify(a)}`);
}

const respostas: RespostasFamilia = {
  ...RESPOSTAS_INICIAIS,
  ufFalecido: 'SP',
  dataObito: '2026-05-10',
  qtdHerdeiros: 4,
  testamento: 'nao-sei',
  menorOuIncapaz: 'sim',
  consenso: 'nao-conversamos',
  herdeiroExterior: 'sim',
  dividas: 'sim',
  cidade: 'Guarulhos',
  ufFamilia: 'SP',
  nome: 'Maria Sigilosa',
  email: 'maria@exemplo.com',
  bens: { ...RESPOSTAS_INICIAIS.bens, imoveis: '200-500', imoveisUfs: ['RJ'], financeiro: 'ate-50', empresa: true },
};

console.log('\nRadar — anonimização do caso publicado\n');

{
  const a = anonimizarIntake({
    id: 'intake-1',
    respostas,
    pequenoValor: false,
    publicadoEm: '2026-08-23T10:00:00.000Z',
    hoje: '2026-08-23',
  });
  eq('cidade/UF da família presentes', [a.cidade, a.uf], ['Guarulhos', 'SP']);
  eq('UFs dos bens (domicílio + imóveis)', a.ufsBens.sort(), ['RJ', 'SP']);
  eq('via da triagem', a.via, 'JUDICIAL');
  eq('herdeiros', a.qtdHerdeiros, 4);
  teste('flags fiéis', a.flags.testamento && a.flags.menorOuIncapaz && a.flags.semConsenso && a.flags.herdeiroExterior && a.flags.empresa && a.flags.dividas);
  eq('publicadoEm como data curta', a.publicadoEm, '2026-08-23');
  teste('faixa leiga', a.faixaAcervo.includes('mil'));

  // As demais respostas do questionário, em linhas curtas.
  const porRotulo = new Map(a.respostas.map((l) => [l.rotulo, l.valor]));
  eq(
    'falecimento em mês/ano + tempo decorrido, com o domicílio',
    porRotulo.get('Falecimento'),
    'mai/2026 (há 3 meses) · domicílio SP',
  );
  eq('sem cônjuge declarado', porRotulo.get('Cônjuge'), 'não havia cônjuge nem companheiro(a)');
  teste(
    'bens por classe com faixa e UF do imóvel',
    (porRotulo.get('Bens declarados') ?? '').includes('imóveis') &&
      (porRotulo.get('Bens declarados') ?? '').includes('(RJ)'),
    porRotulo.get('Bens declarados'),
  );
  eq('advogado constituído', porRotulo.get('Advogado(a) constituído(a)'), 'ainda não');
  teste(
    'nenhuma linha repete o que já é chip (testamento, dívidas…)',
    !a.respostas.some((l) => /testamento|dívida|incapaz|exterior/i.test(l.rotulo)),
  );

  const texto = JSON.stringify(a);
  for (const proibido of ['Maria', 'Sigilosa', 'maria@exemplo.com', '@', 'tokenGestao', 'dataObito', '2026-05-10']) {
    teste(`caso anônimo não contém "${proibido}"`, !texto.includes(proibido));
  }
  // A data do óbito entra só como mês/ano: dia exato + cidade é chave de
  // busca em obituário e cartório, e desfaria o anonimato da família.
  teste('dia exato do óbito não atravessa', !texto.includes('-10') && texto.includes('mai/2026'));
}

{
  // Contaminação: campos extras na entrada não atravessam a allowlist.
  const contaminada = {
    ...respostas,
    cpf: '111.222.333-44',
    nomeDoFalecido: 'José Sigiloso',
    telefone: '11 99999-0000',
    // Texto LIVRE do questionário: por decisão do escritório ele agora
    // ATRAVESSA (com o aviso à família na tela). É o único campo livre que
    // sai daqui — todo o resto continua reconstruído por allowlist.
    observacoes: 'a casa está no nome do avô e um irmão mora fora',
  } as unknown as RespostasFamilia;
  const anon = anonimizarIntake({
    id: 'x',
    respostas: contaminada,
    pequenoValor: true,
    publicadoEm: '2026-08-23',
  });
  const texto = JSON.stringify(anon);
  for (const proibido of ['111.222', 'José', '99999', 'cpf', 'telefone', 'nomeDoFalecido']) {
    teste(`contaminação não atravessa ("${proibido}")`, !texto.includes(proibido));
  }
  eq(
    'observações da família atravessam (decisão do escritório)',
    anon.observacoes,
    'a casa está no nome do avô e um irmão mora fora',
  );
}

{
  // Observações longas são cortadas no mesmo teto do questionário — cinto de
  // segurança do lado da SAÍDA, além do da entrada (sanitizar.ts).
  const anon = anonimizarIntake({
    id: 'y',
    respostas: { ...respostas, observacoes: 'x'.repeat(900) },
    pequenoValor: false,
    publicadoEm: '2026-08-23',
  });
  eq('observações cortadas em 500', anon.observacoes.length, 500);
  eq(
    'sem observações, o campo sai vazio (e a tela não mostra o bloco)',
    anonimizarIntake({ id: 'z', respostas, pequenoValor: false, publicadoEm: '2026-08-23' }).observacoes,
    '',
  );
}

{
  // Cônjuge e regime entram na linha certa (é o que decide meação).
  const casado = anonimizarIntake({
    id: 'c',
    respostas: { ...respostas, vinculo: 'casado', regime: 'comunhao-universal' },
    pequenoValor: false,
    publicadoEm: '2026-08-23',
  });
  eq(
    'regime de bens na linha do cônjuge',
    casado.respostas.find((l) => l.rotulo === 'Cônjuge')?.valor,
    'casado(a) — comunhão universal',
  );
}

{
  eq(
    'rótulo de faixa acima de 1 mi',
    rotuloFaixaAcervo({
      ...respostas,
      bens: { ...RESPOSTAS_INICIAIS.bens, imoveis: '1000-2000', imoveisUfs: ['SP'] },
    }),
    'R$ 1 mi a R$ 2 mi',
  );
}

console.log(`\n${ok} passaram, ${fail} falharam\n`);
if (fail > 0) process.exit(1);
