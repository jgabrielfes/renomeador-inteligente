/**
 * Testes EXAUSTIVOS da matriz papel × recurso do portal (camada 4).
 *   npx tsx lib/rede/escopo.test.ts
 */

import {
  deliberaNoEspolio,
  papelDoConvite,
  podeNoPortal,
  PEDIDO_DOCS_ADVOGADO,
  type PapelPortal,
  type RecursoPortal,
} from './escopo';

let ok = 0, fail = 0;
function teste(nome: string, cond: boolean) {
  if (cond) ok++;
  else { fail++; console.error(`  ✗ ${nome}`); }
}

console.log('\nRede — matriz papel × recurso do portal\n');

const RECURSOS: RecursoPortal[] = [
  'qualificacao', 'upload', 'adesao', 'voto', 'despesa', 'nota', 'mural',
  'painel-proprio', 'paineis-representados',
];

/** A matriz ESPERADA, escrita por extenso — mudar a regra exige mudar aqui. */
const ESPERADO: Record<PapelPortal, Record<RecursoPortal, boolean>> = {
  herdeiro: {
    qualificacao: true, upload: true, adesao: true, voto: true, despesa: true,
    nota: true, mural: true, 'painel-proprio': true, 'paineis-representados': false,
  },
  mediador: {
    qualificacao: false, upload: false, adesao: false, voto: false, despesa: false,
    nota: true, mural: true, 'painel-proprio': false, 'paineis-representados': false,
  },
  advogado: {
    qualificacao: false, upload: true, adesao: false, voto: false, despesa: false,
    nota: true, mural: true, 'painel-proprio': false, 'paineis-representados': true,
  },
};

for (const papel of ['herdeiro', 'mediador', 'advogado'] as PapelPortal[]) {
  for (const recurso of RECURSOS) {
    teste(
      `${papel} × ${recurso} = ${ESPERADO[papel][recurso] ? 'pode' : 'não pode'}`,
      podeNoPortal(papel, recurso) === ESPERADO[papel][recurso],
    );
  }
}

// Invariantes duros — os que protegem a deliberação e o sigilo:
teste('advogado NÃO adere a cenário', !podeNoPortal('advogado', 'adesao'));
teste('advogado NÃO vota', !podeNoPortal('advogado', 'voto'));
teste('advogado NÃO lança despesa', !podeNoPortal('advogado', 'despesa'));
teste('advogado JUNTA documentos', podeNoPortal('advogado', 'upload'));
teste('advogado lê os painéis dos representados', podeNoPortal('advogado', 'paineis-representados'));
teste('herdeiro nunca lê painel de outro', !podeNoPortal('herdeiro', 'paineis-representados'));
teste('mediador segue sem deliberar e sem documentos', !podeNoPortal('mediador', 'upload'));

// Consenso e votações: só herdeiro conta.
teste('só herdeiro delibera no espólio', deliberaNoEspolio('herdeiro'));
teste('mediador fora do consenso', !deliberaNoEspolio('mediador'));
teste('advogado fora do consenso', !deliberaNoEspolio('advogado'));

// Papel efetivo do convite (ausente/legado = herdeiro).
teste('papel ausente = herdeiro', papelDoConvite(undefined) === 'herdeiro');
teste('papel desconhecido = herdeiro', papelDoConvite('x') === 'herdeiro');
teste('mediador reconhecido', papelDoConvite('mediador') === 'mediador');
teste('advogado reconhecido', papelDoConvite('advogado') === 'advogado');

teste('pedido do advogado tem id estável docs-advogado', PEDIDO_DOCS_ADVOGADO.id === 'docs-advogado');

console.log(`\n${ok} passaram, ${fail} falharam\n`);
if (fail > 0) process.exit(1);
