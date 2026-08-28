/**
 * Quinhões ESTIMADOS — MOTOR PURO da área "Para famílias".
 *
 * Aplica as regras GERAIS do Código Civil (meação pelo regime + divisão
 * igualitária entre descendentes) com a honestidade que rege a área: quando
 * as respostas não bastam para estimar (testamento; regime desconhecido), a
 * saída é INDETERMINADO com o porquê — nunca um chute.
 *
 * O questionário não pergunta o PARENTESCO dos herdeiros: a estimativa
 * assume FILHOS(AS), com o aviso explícito. Percentuais sobre o PATRIMÔNIO
 * total (meação + herança fecham 100), porque é assim que o leigo pensa.
 *
 * Testes: npx tsx lib/familias/familias.test.ts
 */

import type { RespostasFamilia } from './tipos';

export interface ParteEstimada {
  rotulo: string;
  /** % do PATRIMÔNIO total (as partes somam 100). */
  pct: number;
  /** true = meação — já era do cônjuge/companheiro, NÃO é herança. */
  meacao?: boolean;
}

export interface EstimativaQuinhoes {
  indeterminado: boolean;
  /** Preenchido quando indeterminado: por que não dá para estimar. */
  motivo?: string;
  partes: ParteEstimada[];
  avisos: string[];
}

const arred = (v: number) => Math.round(v * 10) / 10;

export function estimarQuinhoes(r: RespostasFamilia): EstimativaQuinhoes {
  const avisos: string[] = [
    'Divisão estimada pelas regras gerais do Código Civil, considerando que os herdeiros informados são filhos(as) — sem considerar testamento, doações em vida, dívidas ou a natureza de cada bem. O(a) advogado(a) fecha o quadro real com os documentos.',
  ];

  if (r.testamento === 'sim') {
    return {
      indeterminado: true,
      motivo:
        'Com testamento, a divisão depende do que está escrito nele — estimar sem o texto seria chute. Depois de aberto o testamento, o(a) advogado(a) monta o quadro real (a lei sempre reserva metade da herança aos herdeiros necessários).',
      partes: [],
      avisos,
    };
  }

  const n = Math.max(1, r.qtdHerdeiros);
  const casadoOuUniao = r.vinculo !== 'nao';

  if (casadoOuUniao && (r.regime === '' || r.regime === 'nao-sei')) {
    return {
      indeterminado: true,
      motivo:
        'O regime de bens do casamento (ou da união estável) decide a meação e se o(a) viúvo(a) também herda — sem saber o regime, a divisão muda demais para estimar. A certidão de casamento (ou o contrato da união) responde isso.',
      partes: [],
      avisos,
    };
  }

  const partes: ParteEstimada[] = [];
  const linhaFilhos = (pctCada: number) =>
    partes.push({
      rotulo: n === 1 ? 'Filho(a) único(a)' : `Cada um(a) dos(as) ${n} filhos(as)`,
      pct: arred(pctCada),
    });

  if (!casadoOuUniao) {
    linhaFilhos(100 / n);
  } else if (r.regime === 'comunhao-universal') {
    partes.push({ rotulo: 'Viúvo(a) — meação (metade que já era dele/dela)', pct: 50, meacao: true });
    linhaFilhos(50 / n);
    avisos.push(
      'Na comunhão universal, metade do patrimônio já é do(a) viúvo(a) (meação — não é herança) e ele(a) não herda junto com os filhos (CC, art. 1.829, I).',
    );
  } else if (r.regime === 'comunhao-parcial') {
    partes.push({ rotulo: 'Viúvo(a) — meação (sobre os bens do casamento)', pct: 50, meacao: true });
    linhaFilhos(50 / n);
    avisos.push(
      'Na comunhão parcial, a meação vale para os bens adquiridos DURANTE o casamento — a estimativa usa a metade como aproximação. Sobre bens de ANTES do casamento (ou herdados/doados), o(a) viúvo(a) pode herdar junto com os filhos (CC, art. 1.829, I) — depende da composição real do patrimônio.',
    );
  } else {
    // Separação de bens: sem meação; na separação ESCOLHIDA em pacto o(a)
    // viúvo(a) herda em concorrência com os filhos, como um deles.
    const total = n + 1;
    partes.push({
      rotulo: 'Viúvo(a) — herda junto com os filhos',
      pct: arred(100 / total),
    });
    linhaFilhos(100 / total);
    avisos.push(
      'Na separação de bens não há meação. Na separação ESCOLHIDA em pacto, o(a) viúvo(a) herda junto com os filhos, como um deles (CC, art. 1.829, I) — foi assim que estimamos; com até três filhos comuns, a lei ainda lhe garante ao menos 1/4 da herança. Se a separação foi a OBRIGATÓRIA por lei (ex.: casamento após os 70 anos), a divisão tende a ficar só entre os filhos.',
    );
  }

  if (r.vinculo === 'uniao-estavel') {
    avisos.push(
      'Para a união estável, o STF decidiu que valem as mesmas regras do casamento (Tema 809) — a estimativa segue o regime informado.',
    );
  }

  return { indeterminado: false, partes, avisos };
}
