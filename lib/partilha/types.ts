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

export type TipoBem = 'IMOVEL' | 'VEICULO' | 'FINANCEIRO' | 'QUOTAS' | 'OUTRO';

/** Dados da matrícula e das certidões de valor venal — alimentam a escritura. */
export interface DetalhesImovel {
  /**
   * Descrição do imóvel COMO CONSTA NA MATRÍCULA (com as averbações que
   * alterem a especialidade objetiva) — abre o bem na escritura.
   */
  descricaoMatricula?: string;
  /** Registro/averbação da aquisição pelo falecido (ex.: "R.4"). */
  aquisicao?: string;
  /**
   * COMO os proprietários constam na matrícula (nome e estado civil no
   * registro aquisitivo, ex.: "João da Silva, solteiro") — alimenta o
   * antecipador de qualificação registral (especialidade subjetiva).
   */
  proprietariosMatricula?: string;
  matricula?: string;
  /** Ex.: "1º Registro de Imóveis de Guarulhos/SP". */
  registroImoveis?: string;
  municipio?: string;
  inscricaoCadastral?: string;
  /** Fração ideal (%) somada das inscrições — 100 = imóvel integral. */
  fracaoIdeal?: string;
  /**
   * Percentual do IMÓVEL sobre o venal lançado pela prefeitura (%, texto) —
   * para cadastro em ÁREA MAIOR: o venal EFETIVO (óbito e corrente) é a
   * certidão × este percentual. Preenchido pelo usuário quando a leitura
   * não identifica a fração; vazio = certidão integral.
   */
  percentualVenal?: string;
  /** Valores venais decimais + exercícios (óbito × corrente). */
  valorVenalObito?: string;
  exercicioObito?: string;
  valorVenalAtual?: string;
  exercicioAtual?: string;
}

/**
 * Dados do ativo FINANCEIRO — os campos da declaração do ITCMD-SP para
 * depósitos/aplicações (extrato bancário na data do óbito).
 */
export interface DetalhesFinanceiro {
  /** Instituição financeira (banco/corretora), como na declaração. */
  instituicao?: string;
  agencia?: string;
  /** Conta com dígito (corrente/poupança/aplicação — o código ITCMD tipifica). */
  conta?: string;
}

/** Dados do CRLV — alimentam a escritura e a Carta de Anuência. */
export interface DetalhesVeiculo {
  marcaModelo?: string;
  anoFabricacao?: string;
  anoModelo?: string;
  renavam?: string;
  placa?: string;
  chassi?: string;
}

/**
 * Inventário CONJUNTO (sucessões cumuladas): avaliação do bem em UMA sucessão
 * específica — o mesmo bem tem valor diferente em cada fato gerador (ano do
 * óbito respectivo) e uma fração própria transitando naquela sucessão.
 */
export interface AvaliacaoBemSucessao {
  /** Valor do bem na data do óbito DESTA sucessão (decimal "12345.67"). */
  valor?: string;
  /** Fração do bem que transita nesta sucessão, em % (texto, ex.: "50"). */
  fracaoPct?: string;
}

export interface Bem {
  id: string;
  descricao: string;
  valor: string;
  natureza: Natureza;
  /** Classe do bem — alimenta isenções do ITCMD e o checklist de documentos. */
  tipo?: TipoBem;
  /** Código do tipo na declaração do ITCMD-SP (ex.: "101") — lista de `tipos-itcmd.ts`. */
  codigoItcmd?: string;
  /**
   * Valor venal e valor de avaliação (decimais "12345.67"), quando distintos
   * do valor atribuído. As CUSTAS (escritura/registro) recaem sobre o MAIOR
   * entre atribuído, venal e avaliação — Enunciado 7 do CNB/SP e prática do RI.
   */
  valorVenal?: string;
  valorAvaliacao?: string;
  imovel?: DetalhesImovel;
  veiculo?: DetalhesVeiculo;
  financeiro?: DetalhesFinanceiro;
  /** Avaliação por sucessão cumulada (chave = id da sucessão do estado fiscal). */
  sucessoes?: Record<string, AvaliacaoBemSucessao>;
  /**
   * Bem EXCLUSIVO de uma sucessão: 'PRINCIPAL' (só o inventário do autor
   * principal) ou o id de uma sucessão cumulada (ex.: bem particular que o
   * viúvo adquiriu depois do primeiro óbito). Ausente = integra todas.
   */
  sucessaoExclusiva?: string;
  /**
   * Bem da SOBREPARTILHA (CPC, arts. 669/670): ficou de fora do inventário
   * principal e é partilhado à parte — não entra no monte-mor principal.
   */
  sobrepartilha?: boolean;
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
  /**
   * Fração ideal de CADA BEM COMUM que cabe a este quinhão, já descontada a
   * meação — viúvo(a) meeiro(a) + 3 filhos: fracaoHeranca 1/3, aqui 1/6.
   */
  fracaoBemComum?: string;
  /** Fração ideal de cada bem PARTICULAR que cabe a este quinhão. */
  fracaoBemParticular?: string;
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
