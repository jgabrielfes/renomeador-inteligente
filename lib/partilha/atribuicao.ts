/**
 * Camada de atribuição — o que cada um LEVOU, contra o que cada um TINHA DIREITO.
 *
 * O motor de partilha calcula direito. Esta camada calcula a partilha
 * efetivamente convencionada e mede o desvio. O desvio é a torna, e a torna
 * é fato gerador:
 *   - cedida a título gratuito  -> doação, ITCMD (estadual)
 *   - com reposição em dinheiro -> transmissão onerosa, ITBI (municipal)
 *
 * Modelo de usufruto: reserva sobre o BEM INTEIRO. O usufrutuário toma
 * fração 1 na modalidade USUFRUTO; os nu-proprietários repartem fração 1
 * na modalidade NUA_PROPRIEDADE.
 */

import { Rat, ZERO, ONE, centsToStr, alocarCentavos } from './rational';
import type { Caso, Resultado } from './types';

export type Direito = 'PLENA' | 'USUFRUTO' | 'NUA_PROPRIEDADE';
export type TituloCessao = 'GRATUITO' | 'ONEROSO';

/**
 * Coeficientes de avaliação por UF. Em SP, art. 9º, §2º da Lei 10.705/2000:
 * usufruto = 1/3 e nua-propriedade = 2/3 do valor do bem.
 *
 * Tabela versionada: alíquotas, faixas e coeficientes mudam por lei estadual.
 * Nunca constante no código — carregue do banco com data de vigência.
 */
export interface TabelaEstadual {
  uf: string;
  vigenciaInicio: string;
  coeficiente: Record<Direito, Rat>;
  /** Alíquota de doação (fração, ex.: 4% = 1/25). Progressiva -> use faixas. */
  aliquotaDoacao: Rat;
  /** Teto anual de isenção de doação por donatário, em reais. */
  isencaoDoacaoAnualPorDonatario?: string;
  fundamento: string;
}

export const TABELA_SP_2026: TabelaEstadual = {
  uf: 'SP',
  vigenciaInicio: '2026-01-01',
  coeficiente: {
    PLENA: ONE,
    USUFRUTO: Rat.make(1n, 3n),
    NUA_PROPRIEDADE: Rat.make(2n, 3n),
  },
  aliquotaDoacao: Rat.make(4n, 100n),
  // CONFERIR a cada exercício: valor da UFESP x 2.500. Deixe null para não emitir alerta.
  isencaoDoacaoAnualPorDonatario: undefined,
  fundamento: 'Lei estadual 10.705/2000, art. 9º, §2º — CONFERIR redação vigente',
};

export interface TitularidadeBem {
  bemId: string;
  titularId: string;
  direito: Direito;
  /** Fração dentro da modalidade. Usufruto sobre o bem inteiro = "1". */
  fracao: string;
}

export interface EntradaAtribuicao {
  titularidades: TitularidadeBem[];
  /** Título da cessão do excedente, por cedente. Default: GRATUITO. */
  titulosPorCedente?: Record<string, TituloCessao>;
  tabela?: TabelaEstadual;
}

export interface Transferencia {
  cedenteId: string;
  cedenteNome: string;
  cessionarioId: string;
  cessionarioNome: string;
  valor: string;
  titulo: TituloCessao;
  tributo: 'ITCMD_DOACAO' | 'ITBI';
  competencia: 'ESTADUAL' | 'MUNICIPAL';
  baseCalculo: string;
  imposto: string | null;
  observacao?: string;
}

export interface ResultadoAtribuicao {
  posicoes: {
    titularId: string;
    nome: string;
    valorDeDireito: string;
    valorAtribuido: string;
    delta: string;
    papel: 'CEDENTE' | 'CESSIONARIO' | 'NEUTRO';
  }[];
  transferencias: Transferencia[];
  totalTorna: string;
  bloqueios: string[];
  avisos: string[];
}

/* ------------------------------------------------------------------ */

function nomeDe(caso: Caso, id: string): string {
  if (id === '__sobrevivente__') return caso.sobrevivente?.nome ?? 'Sobrevivente';
  return caso.herdeiros.find((h) => h.id === id)?.nome ?? id;
}

export function apurarAtribuicao(
  caso: Caso,
  resultado: Resultado,
  entrada: EntradaAtribuicao,
): ResultadoAtribuicao {
  const tabela = entrada.tabela ?? TABELA_SP_2026;
  const bloqueios: string[] = [];
  const avisos: string[] = [];

  const valorBem = new Map<string, Rat>();
  for (const b of caso.bens) valorBem.set(b.id, Rat.decimal(b.valor));

  /* --- invariante por bem: a soma ponderada tem de esgotar o bem --- */
  const porBem = new Map<string, TitularidadeBem[]>();
  for (const t of entrada.titularidades) {
    if (!valorBem.has(t.bemId)) {
      bloqueios.push(`Titularidade aponta para bem inexistente: ${t.bemId}.`);
      continue;
    }
    porBem.set(t.bemId, [...(porBem.get(t.bemId) ?? []), t]);
  }
  for (const [bemId, ts] of porBem) {
    const soma = ts.reduce(
      (a, t) => a.add(Rat.fraction(t.fracao).mul(tabela.coeficiente[t.direito])),
      ZERO,
    );
    if (!soma.eq(ONE)) {
      bloqueios.push(
        `Bem ${bemId}: titularidades somam ${soma.toString()} do valor, esperado 1. ` +
          `Usufruto sobre o bem inteiro exige fração 1 no usufruto e frações somando 1 na nua-propriedade.`,
      );
    }
  }
  for (const b of caso.bens) {
    if (!porBem.has(b.id)) bloqueios.push(`Bem ${b.id} não foi atribuído a ninguém.`);
  }

  /* --- valor de direito: meação + quinhão --- */
  const direito = new Map<string, Rat>();
  const somaEm = (m: Map<string, Rat>, id: string, v: Rat) =>
    m.set(id, (m.get(id) ?? ZERO).add(v));

  if (resultado.meacao) {
    somaEm(direito, '__sobrevivente__', Rat.decimal(resultado.meacao.valor));
  }
  for (const q of resultado.quinhoes) {
    somaEm(direito, q.herdeiroId, Rat.decimal(q.valor));
  }

  /* --- valor atribuído --- */
  const atribuido = new Map<string, Rat>();
  for (const t of entrada.titularidades) {
    const v = valorBem.get(t.bemId);
    if (!v) continue;
    somaEm(
      atribuido,
      t.titularId,
      v.mul(Rat.fraction(t.fracao)).mul(tabela.coeficiente[t.direito]),
    );
  }

  const ids = new Set([...direito.keys(), ...atribuido.keys()]);
  const posicoes: ResultadoAtribuicao['posicoes'] = [];
  const cedentes: { id: string; v: Rat }[] = [];
  const cessionarios: { id: string; v: Rat }[] = [];

  for (const id of ids) {
    const d = direito.get(id) ?? ZERO;
    const a = atribuido.get(id) ?? ZERO;
    const delta = a.sub(d);
    posicoes.push({
      titularId: id,
      nome: nomeDe(caso, id),
      valorDeDireito: centsToStr(d.floorCents()),
      valorAtribuido: centsToStr(a.floorCents()),
      delta: centsToStr(delta.floorCents()),
      papel: delta.isZero() ? 'NEUTRO' : delta.isNeg() ? 'CEDENTE' : 'CESSIONARIO',
    });
    if (delta.isNeg()) cedentes.push({ id, v: ZERO.sub(delta) });
    else if (!delta.isZero()) cessionarios.push({ id, v: delta });
  }

  const totalCedido = cedentes.reduce((a, c) => a.add(c.v), ZERO);
  const totalRecebido = cessionarios.reduce((a, c) => a.add(c.v), ZERO);
  if (!totalCedido.eq(totalRecebido)) {
    bloqueios.push(
      `INVARIANTE VIOLADA: cedido ${centsToStr(totalCedido.floorCents())} ≠ ` +
        `recebido ${centsToStr(totalRecebido.floorCents())}.`,
    );
  }

  /* --- emparelhamento proporcional cedente x cessionário --- */
  const transferencias: Transferencia[] = [];
  if (!totalCedido.isZero() && bloqueios.length === 0) {
    for (const ced of cedentes) {
      const titulo = entrada.titulosPorCedente?.[ced.id] ?? 'GRATUITO';
      const gratuito = titulo === 'GRATUITO';

      const partes = cessionarios.map((cess) => ({
        id: cess.id,
        fr: ced.v.mul(cess.v).div(totalCedido).div(ced.v),
      }));
      const { alocacoes } = alocarCentavos(
        partes.map((p) => ({ id: p.id, fr: p.fr })),
        ced.v.floorCents(),
      );

      for (const al of alocacoes) {
        if (al.cents === 0n) continue;
        const base = Rat.decimal(centsToStr(al.cents));
        const imposto = gratuito ? base.mul(tabela.aliquotaDoacao) : null;

        let observacao: string | undefined;
        if (gratuito && tabela.isencaoDoacaoAnualPorDonatario) {
          const teto = Rat.decimal(tabela.isencaoDoacaoAnualPorDonatario);
          observacao = base.gt(teto)
            ? `Acima do teto anual de isenção (${tabela.isencaoDoacaoAnualPorDonatario}). ` +
              `Fracionar a cessão entre exercícios pode reduzir o imposto.`
            : `Dentro do teto anual de isenção por donatário — conferir outras doações do mesmo doador no exercício.`;
        }

        transferencias.push({
          cedenteId: ced.id,
          cedenteNome: nomeDe(caso, ced.id),
          cessionarioId: al.id,
          cessionarioNome: nomeDe(caso, al.id),
          valor: centsToStr(al.cents),
          titulo,
          tributo: gratuito ? 'ITCMD_DOACAO' : 'ITBI',
          competencia: gratuito ? 'ESTADUAL' : 'MUNICIPAL',
          baseCalculo: centsToStr(al.cents),
          imposto: imposto ? centsToStr(imposto.floorCents()) : null,
          observacao,
        });
      }
    }
  }

  if (transferencias.some((t) => t.tributo === 'ITCMD_DOACAO')) {
    avisos.push(
      'Há cessão gratuita: declarar transmissão inter vivos (doação) em declaração separada da causa mortis.',
    );
  }
  if (transferencias.some((t) => t.tributo === 'ITBI')) {
    avisos.push(
      'Há reposição onerosa: ITBI é municipal — apurar guia junto à prefeitura do imóvel.',
    );
  }
  if (entrada.titularidades.some((t) => t.direito === 'USUFRUTO')) {
    avisos.push(
      `Coeficientes de usufruto e nua-propriedade conforme ${tabela.fundamento}. ` +
        'Conferir a redação vigente antes da lavratura.',
    );
  }

  return {
    posicoes: posicoes.sort((a, b) => (a.titularId < b.titularId ? -1 : 1)),
    transferencias,
    totalTorna: centsToStr(totalCedido.floorCents()),
    bloqueios,
    avisos,
  };
}
