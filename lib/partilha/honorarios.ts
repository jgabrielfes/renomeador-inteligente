/**
 * Honorários advocatícios do inventário — avaliação de complexidade do caso
 * e sugestão de precificação, a partir da folha de trabalho.
 *
 * Motor PURO (com testes): a UI passa o retrato do caso e recebe os fatores
 * de complexidade pontuados, o nível (baixa/média/alta) e a sugestão de
 * percentual/valor. A sugestão é PONTO DE PARTIDA editável — o texto lembra
 * o advogado de conferir o piso da tabela de honorários da seccional da OAB;
 * o sistema nunca fixa honorário sozinho.
 */

export interface EntradaComplexidade {
  qtdHerdeiros: number;
  temPreMorto: boolean;
  temRenunciante: boolean;
  temMenorOuIncapaz: boolean;
  temSobrevivente: boolean;
  qtdBens: number;
  qtdImoveis: number;
  temQuotasSocietarias: boolean;
  temDividas: boolean;
  /** Partilha diferenciada montada (bem atribuído fora da proporção do direito). */
  temPartilhaDiferenciada: boolean;
  /** Monte-mor (massa partilhável) em reais, ou null sem espelho calculado. */
  monteMor: number | null;
}

export interface FatorComplexidade {
  rotulo: string;
  pontos: number;
}

export type NivelComplexidade = 'BAIXA' | 'MEDIA' | 'ALTA';

export interface AvaliacaoComplexidade {
  fatores: FatorComplexidade[];
  pontos: number;
  nivel: NivelComplexidade;
  /** Percentual sugerido sobre o monte-mor (ponto de partida editável). */
  percentualSugerido: number;
  /** Via provável: menor/incapaz veda a extrajudicial (CPC, art. 610). */
  viaJudicial: boolean;
}

export const ROTULO_NIVEL: Record<NivelComplexidade, string> = {
  BAIXA: 'baixa',
  MEDIA: 'média',
  ALTA: 'alta',
};

/** Percentual de partida por nível — ajuste livre na tela. */
const PERCENTUAL_POR_NIVEL: Record<NivelComplexidade, number> = {
  BAIXA: 3,
  MEDIA: 4,
  ALTA: 6,
};

/** Piso sugerido quando o percentual sobre o monte fica abaixo dele. */
export const PISO_SUGERIDO = 3500;

export function avaliarComplexidade(e: EntradaComplexidade): AvaliacaoComplexidade {
  const fatores: FatorComplexidade[] = [];
  const add = (cond: boolean, rotulo: string, pontos: number) => {
    if (cond) fatores.push({ rotulo, pontos });
  };

  add(e.temMenorOuIncapaz, 'Herdeiro menor ou incapaz — via judicial obrigatória (CPC, art. 610)', 3);
  add(e.temPreMorto, 'Herdeiro pré-morto — sucessão por representação', 2);
  add(e.temRenunciante, 'Renúncia de herdeiro — escritura própria e reflexos na partilha', 1);
  add(e.qtdHerdeiros > 8, 'Mais de 8 herdeiros para reunir e qualificar', 2);
  add(e.qtdHerdeiros > 4 && e.qtdHerdeiros <= 8, 'Mais de 4 herdeiros para reunir e qualificar', 1);
  add(e.temQuotasSocietarias, 'Participação societária no acervo — avaliação de quotas e alteração contratual', 2);
  add(e.qtdImoveis > 1, 'Mais de um imóvel — matrículas, valores venais e registros múltiplos', 1);
  add(e.qtdBens > 10, 'Acervo extenso (mais de 10 bens)', 2);
  add(e.qtdBens > 5 && e.qtdBens <= 10, 'Acervo numeroso (mais de 5 bens)', 1);
  add(e.temDividas, 'Dívidas do espólio a abater e comprovar', 1);
  add(e.temPartilhaDiferenciada, 'Partilha diferenciada — atribuições fora da proporção e apuração de tornas', 2);
  if (e.monteMor !== null) {
    add(e.monteMor > 5_000_000, 'Monte-mor acima de R$ 5 milhões — responsabilidade patrimonial elevada', 2);
    add(
      e.monteMor > 1_000_000 && e.monteMor <= 5_000_000,
      'Monte-mor acima de R$ 1 milhão — responsabilidade patrimonial relevante',
      1,
    );
  }

  const pontos = fatores.reduce((acc, f) => acc + f.pontos, 0);
  const nivel: NivelComplexidade = pontos >= 6 ? 'ALTA' : pontos >= 3 ? 'MEDIA' : 'BAIXA';

  return {
    fatores,
    pontos,
    nivel,
    percentualSugerido: PERCENTUAL_POR_NIVEL[nivel],
    viaJudicial: e.temMenorOuIncapaz,
  };
}

export interface SugestaoHonorarios {
  percentual: number;
  /** Valor decimal ("12345.67") — percentual × monte, nunca abaixo do piso. */
  valor: string;
  pisoAplicado: boolean;
  memoria: string[];
}

/** Sugestão de valor: percentual do nível sobre o monte-mor, com piso. */
export function sugerirHonorarios(
  avaliacao: AvaliacaoComplexidade,
  monteMor: number | null,
): SugestaoHonorarios | null {
  if (monteMor === null || !Number.isFinite(monteMor) || monteMor <= 0) return null;
  const percentual = avaliacao.percentualSugerido;
  const bruto = (monteMor * percentual) / 100;
  const pisoAplicado = bruto < PISO_SUGERIDO;
  const valor = (pisoAplicado ? PISO_SUGERIDO : bruto).toFixed(2);
  const memoria = [
    `Complexidade ${ROTULO_NIVEL[avaliacao.nivel]} (${avaliacao.pontos} ponto(s)) → ${percentual}% sobre o monte-mor`,
    `${percentual}% de R$ ${monteMor.toFixed(2)} = R$ ${bruto.toFixed(2)}`,
  ];
  if (pisoAplicado) memoria.push(`Abaixo do piso sugerido — aplicado R$ ${PISO_SUGERIDO.toFixed(2)}`);
  memoria.push('Sugestão de partida: ajuste livre e confira o piso da tabela de honorários da seccional da OAB.');
  return { percentual, valor, pisoAplicado, memoria };
}

/* ---------- condições contratadas (o que vai para os documentos) ---------- */

export interface CondicoesHonorarios {
  forma: 'PERCENTUAL' | 'FIXO';
  /** Percentual sobre o monte-mor, como texto ("6" ou "4,5"). */
  percentual: string;
  /** Valor fixo decimal ("12345.67") quando forma = FIXO. */
  valorFixo: string;
  /** Texto livre: "50% na contratação e o saldo em 3 parcelas mensais". */
  condicoesPagamento: string;
}

export const CONDICOES_INICIAIS: CondicoesHonorarios = {
  forma: 'PERCENTUAL',
  percentual: '',
  valorFixo: '',
  condicoesPagamento: '',
};

/** Valor contratado em reais, ou null quando as condições não fecham um número. */
export function valorContratado(
  cond: CondicoesHonorarios,
  monteMor: number | null,
): number | null {
  if (cond.forma === 'FIXO') {
    const v = Number(cond.valorFixo);
    return Number.isFinite(v) && v > 0 ? v : null;
  }
  const pct = Number(cond.percentual.replace(',', '.'));
  if (!Number.isFinite(pct) || pct <= 0 || pct > 100) return null;
  if (monteMor === null || !Number.isFinite(monteMor) || monteMor <= 0) return null;
  return (monteMor * pct) / 100;
}
