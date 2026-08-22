/**
 * Área pública "Para famílias" (camada 3) — TIPOS do questionário.
 *
 * O questionário é a porta de entrada de um leigo enlutado: até 12 perguntas,
 * NENHUM dado sensível nesta etapa (sem CPF, sem nome do falecido, sem
 * endereço). Valores de bens entram por FAIXA — o suficiente para estimar
 * ITCMD e custas, e nada além.
 */

/** Faixas de valor aproximado (por classe de bem). */
export type FaixaValor =
  | 'ate-50'
  | '50-200'
  | '200-500'
  | '500-1000'
  | '1000-2000'
  | 'acima-2000';

/** Limites em R$ de cada faixa (o topo aberto usa 3 mi como referência de
 *  estimativa — sempre apresentado como "acima de 2 milhões"). */
export const LIMITES_FAIXA: Record<FaixaValor, { min: number; max: number }> = {
  'ate-50': { min: 10_000, max: 50_000 },
  '50-200': { min: 50_000, max: 200_000 },
  '200-500': { min: 200_000, max: 500_000 },
  '500-1000': { min: 500_000, max: 1_000_000 },
  '1000-2000': { min: 1_000_000, max: 2_000_000 },
  'acima-2000': { min: 2_000_000, max: 3_000_000 },
};

export const ROTULO_FAIXA: Record<FaixaValor, string> = {
  'ate-50': 'até R$ 50 mil',
  '50-200': 'R$ 50 a 200 mil',
  '200-500': 'R$ 200 a 500 mil',
  '500-1000': 'R$ 500 mil a 1 milhão',
  '1000-2000': 'R$ 1 a 2 milhões',
  'acima-2000': 'acima de R$ 2 milhões',
};

export const UFS = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS',
  'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC',
  'SP', 'SE', 'TO',
] as const;
export type Uf = (typeof UFS)[number];

export interface BensDaFamilia {
  /** Faixa do TOTAL de imóveis (null = não há). */
  imoveis: FaixaValor | null;
  /** UFs onde ficam os imóveis (ITCMD de imóvel é da UF do bem). */
  imoveisUfs: string[];
  veiculos: FaixaValor | null;
  /** Contas, investimentos, FGTS/PIS, verbas a receber. */
  financeiro: FaixaValor | null;
  /** Participação em empresa (quotas/ações fechadas). */
  empresa: boolean;
  /** Faixa do capital social/patrimônio líquido da participação (só com
   *  `empresa` marcada; null = a família não sabe informar). */
  empresaValor: FaixaValor | null;
  outros: FaixaValor | null;
}

export interface RespostasFamilia {
  /** 1. UF onde o falecido morava (domicílio — define o inventário e o ITCMD dos móveis). */
  ufFalecido: string;
  /** 2. Data do falecimento (yyyy-mm-dd). */
  dataObito: string;
  /** 3. Havia testamento? */
  testamento: 'sim' | 'nao' | 'nao-sei';
  /** 4. Cônjuge/companheiro(a) e regime. */
  vinculo: 'nao' | 'casado' | 'uniao-estavel';
  regime:
    | ''
    | 'comunhao-parcial'
    | 'comunhao-universal'
    | 'separacao'
    | 'nao-sei';
  /** 5. Herdeiros. */
  qtdHerdeiros: number;
  menorOuIncapaz: 'sim' | 'nao';
  /** 6. Todos concordam com a divisão? */
  consenso: 'sim' | 'nao' | 'nao-conversamos';
  /** 7. Bens por classe e faixa. */
  bens: BensDaFamilia;
  /** 8. Dívidas relevantes? */
  dividas: 'sim' | 'nao';
  /** 9. Herdeiro fora do país ou difícil de localizar? */
  herdeiroExterior: 'sim' | 'nao';
  /** 10. Já existe advogado? */
  jaTemAdvogado: 'sim' | 'nao';
  /** 11. Onde a família está. */
  cidade: string;
  ufFamilia: string;
  /** 12. Contato (opcional para ver o resultado). */
  nome: string;
  email: string;
  /** 12. Observações livres (curtas) — algo que a família queira explicar.
   *  Seguem ao advogado no handoff; NUNCA entram no resumo anônimo do Radar. */
  observacoes: string;
}

export const RESPOSTAS_INICIAIS: RespostasFamilia = {
  ufFalecido: '',
  dataObito: '',
  testamento: 'nao',
  vinculo: 'nao',
  regime: '',
  qtdHerdeiros: 1,
  menorOuIncapaz: 'nao',
  consenso: 'sim',
  bens: {
    imoveis: null,
    imoveisUfs: [],
    veiculos: null,
    financeiro: null,
    empresa: false,
    empresaValor: null,
    outros: null,
  },
  dividas: 'nao',
  herdeiroExterior: 'nao',
  jaTemAdvogado: 'nao',
  cidade: '',
  ufFamilia: '',
  nome: '',
  email: '',
  observacoes: '',
};
