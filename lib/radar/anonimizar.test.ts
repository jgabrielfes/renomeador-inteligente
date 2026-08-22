/**
 * Testes ANTI-VAZAMENTO do Radar: o objeto que o advogado vê jamais contém
 * nome, e-mail, nome do falecido ou token — nem quando a entrada vem
 * contaminada com campos extras.
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
  });
  eq('cidade/UF da família presentes', [a.cidade, a.uf], ['Guarulhos', 'SP']);
  eq('UFs dos bens (domicílio + imóveis)', a.ufsBens.sort(), ['RJ', 'SP']);
  eq('via da triagem', a.via, 'JUDICIAL');
  eq('herdeiros', a.qtdHerdeiros, 4);
  teste('flags fiéis', a.flags.testamento && a.flags.menorOuIncapaz && a.flags.semConsenso && a.flags.herdeiroExterior && a.flags.empresa && a.flags.dividas);
  eq('publicadoEm como data curta', a.publicadoEm, '2026-08-23');
  teste('faixa leiga', a.faixaAcervo.includes('mil'));

  const texto = JSON.stringify(a);
  for (const proibido of ['Maria', 'Sigilosa', 'maria@exemplo.com', '@', 'tokenGestao', 'dataObito', '2026-05-10']) {
    teste(`caso anônimo não contém "${proibido}"`, !texto.includes(proibido));
  }
}

{
  // Contaminação: campos extras na entrada não atravessam a allowlist.
  const contaminada = {
    ...respostas,
    cpf: '111.222.333-44',
    nomeDoFalecido: 'José Sigiloso',
    telefone: '11 99999-0000',
    // Texto LIVRE do questionário: vai ao advogado no handoff, JAMAIS ao
    // resumo anônimo — pode identificar a família.
    observacoes: 'a casa da Rua Sigilosa 123 está no nome do meu avô Aristides',
  } as unknown as RespostasFamilia;
  const texto = JSON.stringify(
    anonimizarIntake({ id: 'x', respostas: contaminada, pequenoValor: true, publicadoEm: '2026-08-23' }),
  );
  for (const proibido of ['111.222', 'José', '99999', 'cpf', 'telefone', 'Sigilosa', 'Aristides', 'observacoes']) {
    teste(`contaminação não atravessa ("${proibido}")`, !texto.includes(proibido));
  }
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
