/**
 * Casos de teste do antecipador de qualificação registral.
 *
 * Roda sem dependência externa:
 *   npx tsx lib/partilha/antecipador.test.ts
 */

import { anteciparQualificacaoRegistral } from './antecipador';
import type { Bem } from './types';

let ok = 0, fail = 0;
function eq(nome: string, a: unknown, e: unknown) {
  if (JSON.stringify(a) === JSON.stringify(e)) ok++;
  else { fail++; console.error(`  ✗ ${nome}\n    esperado ${JSON.stringify(e)}\n    obtido   ${JSON.stringify(a)}`); }
}

console.log('\nAntecipador de qualificação registral\n');

const imovel = (extra?: Partial<NonNullable<Bem['imovel']>>): Bem => ({
  id: 'b1',
  descricao: 'Apartamento — matrícula 12.345',
  valor: '400000.00',
  natureza: 'COMUM',
  tipo: 'IMOVEL',
  imovel: {
    matricula: '12.345',
    registroImoveis: '1º RI de Guarulhos/SP',
    proprietariosMatricula: 'João da Silva, solteiro',
    ...extra,
  },
});

const base = {
  falecido: { nome: 'João da Silva', estadoCivil: 'casado' },
  temSobrevivente: true,
  nomeSobrev: 'Maria da Silva',
  regime: 'comunhão parcial de bens',
  extrajudicial: true,
};

// O caso do exemplo: solteiro na matrícula, faleceu casado → EXIGÊNCIA da
// certidão de casamento para averbação (especialidade subjetiva).
const r = anteciparQualificacaoRegistral({ ...base, bens: [imovel()] });
eq('título do registro extrajudicial', r.tituloRegistro.includes('traslado'), true);
const exigencias = r.imoveis[0].apontamentos.filter((a) => a.nivel === 'EXIGENCIA');
eq('solteiro→casado: exige certidão de casamento', exigencias.some((a) => a.texto.includes('CERTIDÃO DE CASAMENTO')), true);
eq('fundamento na especialidade subjetiva', exigencias.some((a) => a.fundamento.includes('246')), true);
eq('conta as exigências (imóvel + guia ITCMD)', r.totalExigencias >= 2, true);

// Rito judicial: o título é o formal de partilha.
const judicial = anteciparQualificacaoRegistral({ ...base, extrajudicial: false, bens: [imovel()] });
eq('judicial: formal de partilha', judicial.tituloRegistro.includes('formal'), true);

// Casado na matrícula com OUTRO cônjuge → recompor a cadeia.
const outroConjuge = anteciparQualificacaoRegistral({
  ...base,
  bens: [imovel({ proprietariosMatricula: 'João da Silva, casado com Tereza Lima' })],
});
eq('cônjuge divergente: recompor a cadeia', outroConjuge.imoveis[0].apontamentos.some((a) => a.texto.includes('cadeia')), true);

// Grafia divergente do nome → CONFERIR retificação.
const grafia = anteciparQualificacaoRegistral({
  ...base,
  bens: [imovel({ proprietariosMatricula: 'Joao Silveira, casado com Maria da Silva' })],
});
eq('grafia divergente: retificação (art. 213)', grafia.imoveis[0].apontamentos.some((a) => a.fundamento.includes('213')), true);

// Sem titularidade informada → pede conferência da certidão.
const semTitularidade = anteciparQualificacaoRegistral({
  ...base,
  bens: [imovel({ proprietariosMatricula: undefined })],
});
eq('sem titularidade: conferir na certidão', semTitularidade.imoveis[0].apontamentos.some((a) => a.texto.includes('COMO o(s) proprietário(s)')), true);

// Fração ideal parcial → partilha limitada à fração.
const fracao = anteciparQualificacaoRegistral({
  ...base,
  bens: [imovel({ fracaoIdeal: '50.00', proprietariosMatricula: 'João da Silva, casado com Maria da Silva' })],
});
eq('fração ideal: especialidade objetiva', fracao.imoveis[0].apontamentos.some((a) => a.texto.includes('FRAÇÃO IDEAL')), true);

// Sem matrícula lançada → exigir certidão atualizada.
const semMatricula = anteciparQualificacaoRegistral({
  ...base,
  bens: [imovel({ matricula: undefined })],
});
eq('sem matrícula: certidão atualizada', semMatricula.imoveis[0].apontamentos.some((a) => a.texto.includes('inteiro teor')), true);

// Itens gerais sempre presentes (guia ITCMD + validades + venal).
eq('gerais: guia do ITCMD', r.gerais.some((a) => a.texto.includes('ITCMD')), true);
eq('gerais: validade das certidões', r.gerais.some((a) => a.texto.includes('PRENOTAÇÃO')), true);

// Bem de sobrepartilha e não-imóvel ficam fora.
const fora = anteciparQualificacaoRegistral({
  ...base,
  bens: [
    { ...imovel(), sobrepartilha: true },
    { id: 'b2', descricao: 'CDB', valor: '10000.00', natureza: 'COMUM', tipo: 'FINANCEIRO' },
  ],
});
eq('sobrepartilha/não-imóvel fora do relatório', fora.imoveis.length, 0);

console.log(`\n${ok} passaram, ${fail} falharam\n`);
if (fail > 0) process.exit(1);
