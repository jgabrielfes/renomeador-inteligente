/**
 * Documentos do processo — catálogo do que o inventário extrajudicial e a
 * declaração do ITCMD-SP exigem, na ordem em que o processo é montado.
 *
 * A lista consolida a prática do balcão (Portaria CAT-15/2003 e o sistema da
 * declaração do ITCMD-SP): documentos pessoais das partes, estado civil,
 * testamento e a prova de cada classe de bem. Como o catálogo de acervo, é
 * DADO revisável — exigência muda por caso e por tabelionato.
 */

export type GrupoDocumento =
  | 'PARTES'
  | 'OBITO_ESTADO_CIVIL'
  | 'TESTAMENTO'
  | 'IMOVEIS'
  | 'FINANCEIRO'
  | 'VEICULOS'
  | 'SOCIETARIO'
  | 'FISCAL'
  | 'OUTROS';

export const ROTULO_GRUPO: Record<GrupoDocumento, string> = {
  PARTES: 'Documentos pessoais das partes',
  OBITO_ESTADO_CIVIL: 'Óbito e estado civil',
  TESTAMENTO: 'Testamento',
  IMOVEIS: 'Imóveis',
  FINANCEIRO: 'Financeiro',
  VEICULOS: 'Veículos',
  SOCIETARIO: 'Participações societárias',
  FISCAL: 'Fiscal',
  OUTROS: 'Outros',
};

export interface DocumentoProcesso {
  id: string;
  grupo: GrupoDocumento;
  titulo: string;
  descricao: string;
}

/** Ordem do catálogo = ordem de montagem do processo. */
export const CATALOGO_DOCUMENTOS: DocumentoProcesso[] = [
  {
    id: 'certidao-obito',
    grupo: 'OBITO_ESTADO_CIVIL',
    titulo: 'Certidão de óbito',
    descricao: 'Abre o processo: prova o fato gerador e a data da abertura da sucessão.',
  },
  {
    id: 'docs-pessoais',
    grupo: 'PARTES',
    titulo: 'Documento de identidade e CPF das partes',
    descricao:
      'RG ou CNH (com CPF) do falecido, do(a) viúvo(a) e de cada herdeiro e cônjuge de herdeiro. Os enviados pelo cofre de documentos entram aqui.',
  },
  {
    id: 'certidao-casamento-falecido',
    grupo: 'OBITO_ESTADO_CIVIL',
    titulo: 'Certidão de casamento do falecido',
    descricao:
      'Atualizada (90 dias), com o regime de bens legível; havendo pacto antenupcial, o pacto registrado.',
  },
  {
    id: 'certidoes-herdeiros',
    grupo: 'OBITO_ESTADO_CIVIL',
    titulo: 'Certidão de casamento ou nascimento de cada herdeiro',
    descricao: 'Atualizadas — provam a filiação e o estado civil que entram na escritura.',
  },
  {
    id: 'comprovantes-endereco',
    grupo: 'PARTES',
    titulo: 'Comprovantes de endereço das partes',
    descricao: 'Conta de consumo ou correspondência bancária recente de cada parte.',
  },
  {
    id: 'certidao-testamento',
    grupo: 'TESTAMENTO',
    titulo: 'Certidão de testamento (CENSEC/RCTO)',
    descricao:
      'Obrigatória mesmo quando negativa — o tabelionato exige a busca antes de lavrar.',
  },
  {
    id: 'matricula-imovel',
    grupo: 'IMOVEIS',
    titulo: 'Matrícula atualizada de cada imóvel',
    descricao: 'Certidão de inteiro teor com negativa de ônus (validade usual de 30 dias).',
  },
  {
    id: 'valor-venal',
    grupo: 'IMOVEIS',
    titulo: 'Certidão de valor venal (urbano) ou CCIR + ITR (rural)',
    descricao:
      'Valor venal de referência na data do óbito; para o ITCMD, declare pelo valor de MERCADO (art. 9º — ver item V).',
  },
  {
    id: 'extratos-bancarios',
    grupo: 'FINANCEIRO',
    titulo: 'Extratos bancários na data do óbito',
    descricao:
      'Saldo de contas, aplicações e previdência na data da abertura da sucessão, por instituição.',
  },
  {
    id: 'doc-veiculos',
    grupo: 'VEICULOS',
    titulo: 'Documento dos veículos (CRLV) e avaliação',
    descricao: 'CRLV de cada veículo e a referência de valor (tabela FIPE do mês do óbito).',
  },
  {
    id: 'contrato-social',
    grupo: 'SOCIETARIO',
    titulo: 'Contrato social e alterações',
    descricao: 'Última consolidação registrada das sociedades em que o falecido era sócio.',
  },
  {
    id: 'balanco-patrimonial',
    grupo: 'SOCIETARIO',
    titulo: 'Balanço patrimonial',
    descricao:
      'Balanço da sociedade na data do óbito (ou o último exercício) — base do valor das quotas no ITCMD.',
  },
  {
    id: 'declaracao-ir',
    grupo: 'FISCAL',
    titulo: 'Última declaração de IR do falecido',
    descricao: 'O mapa do patrimônio: confere se nenhum bem ficou fora das declarações.',
  },
  {
    id: 'outros',
    grupo: 'OUTROS',
    titulo: 'Outros documentos do caso',
    descricao:
      'O que o caso pedir: alvarás, procurações, renúncias, certidões negativas, guias pagas…',
  },
];
