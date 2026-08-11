export type Vinculo = 'CASAMENTO' | 'UNIAO_ESTAVEL';

export type Regime =
  | 'COMUNHAO_PARCIAL'
  | 'COMUNHAO_UNIVERSAL'
  | 'SEPARACAO_CONVENCIONAL'
  | 'SEPARACAO_OBRIGATORIA'
  | 'PARTICIPACAO_FINAL_AQUESTOS';

export type Classe = 'DESCENDENTE' | 'ASCENDENTE' | 'COLATERAL';
export type Status = 'ATIVO' | 'PRE_MORTO' | 'RENUNCIANTE' | 'EXCLUIDO';
export type Natureza = 'COMUM' | 'PARTICULAR';
export type Linha = 'PATERNA' | 'MATERNA';
export type VinculoIrmao = 'BILATERAL' | 'UNILATERAL';

export interface Sobrevivente {
  vinculo: Vinculo;
  regime: Regime;
  nome?: string;
  /** Súmula 377/STF na separação obrigatória: exige prova do esforço comum (STJ). */
  sumula377EsforcoComumProvado?: boolean;
}

export interface Herdeiro {
  id: string;
  nome: string;
  classe: Classe;
  /** 1 = filho/pai/—, 2 = neto/avô/irmão, 3 = bisneto/sobrinho/tio, 4 = primo */
  grau: number;
  status: Status;
  /** id do herdeiro por quem representa (pai pré-morto/excluído) */
  ascendenteId?: string | null;
  /** Necessário para a reserva de 1/4 do art. 1.832 */
  filhoDoSobrevivente?: boolean;
  /** Obrigatório para ascendente de grau >= 2 (art. 1.836, §2º) */
  linha?: Linha;
  /** Obrigatório para colateral de grau 2 (art. 1.841) */
  vinculoIrmao?: VinculoIrmao;
  menorOuIncapaz?: boolean;
}

export interface Bem {
  id: string;
  descricao: string;
  valor: string;
  natureza: Natureza;
}

export interface Divida {
  id: string;
  descricao: string;
  valor: string;
  natureza: Natureza;
}

export interface Legado {
  beneficiario: string;
  /** fração da herança total, ex.: "1/2" */
  fracaoDaHeranca: string;
}

export interface Testamento {
  existe: boolean;
  legados?: Legado[];
}

export interface Opcoes {
  /**
   * Base da concorrência do sobrevivente na comunhão parcial.
   * 'PARTICULARES' segue STJ REsp 1.368.123/SP e Enunciado 270 CJF (default).
   */
  baseConcorrenciaParcial?: 'PARTICULARES' | 'TOTAL';
  /**
   * Filiação híbrida: aplicar a reserva de 1/4 do art. 1.832?
   * null = emitir os dois cenários como divergência (default e recomendado).
   */
  filiacaoHibridaAplicaReserva?: boolean | null;
  /** Companheiro como herdeiro necessário (majoritário pós-Tema 809). */
  companheiroHerdeiroNecessario?: boolean;
}

export interface Caso {
  casoId?: string;
  falecido: { dataObito: string; ufUltimoDomicilio?: string };
  sobrevivente?: Sobrevivente | null;
  herdeiros: Herdeiro[];
  bens: Bem[];
  dividas?: Divida[];
  testamento?: Testamento;
  litigioEntreHerdeiros?: boolean;
  opcoes?: Opcoes;
}

export interface QuinhaoSaida {
  herdeiroId: string;
  nome: string;
  papel: 'SOBREVIVENTE' | 'HERDEIRO' | 'LEGATARIO';
  fracaoHeranca: string;
  valor: string;
  fundamento: string;
  precedente?: string;
  por?: 'CABECA' | 'ESTIRPE' | 'LINHA' | 'PESO';
  reservaUmQuartoAplicada?: boolean;
}

export interface Divergencia {
  tema: string;
  descricao: string;
  cenarioAdotado: string;
  cenarioAlternativo: string;
  quinhoesAlternativos: QuinhaoSaida[];
}

export interface Resultado {
  casoId?: string;
  calculadoEm: string;
  versaoMotor: string;
  elegivelExtrajudicial: boolean;
  classeVocacao: Classe | 'SOBREVIVENTE_EXCLUSIVO' | null;
  acervo: {
    bensComuns: string;
    bensParticulares: string;
    dividas: string;
    massaPartilhavel: string;
  };
  meacao: {
    beneficiario: string;
    fracao: string;
    valor: string;
    fundamento: string;
  } | null;
  heranca: {
    comum: string;
    particular: string;
    total: string;
    legitima: string;
    disponivel: string;
  };
  quinhoes: QuinhaoSaida[];
  divergencias: Divergencia[];
  bloqueios: string[];
  avisos: string[];
  residuo: { criterio: string; ajustados: string[] };
}
