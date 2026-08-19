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
  | 'OBITO_ESTADO_CIVIL'
  | 'FALECIDO'
  | 'SOBREVIVENTE'
  | 'HERDEIROS'
  | 'TESTAMENTO'
  | 'IMOVEIS'
  | 'FINANCEIRO'
  | 'VEICULOS'
  | 'SOCIETARIO'
  | 'ADVOGADO'
  | 'FISCAL'
  | 'ENCERRAMENTO'
  | 'OUTROS';

export const ROTULO_GRUPO: Record<GrupoDocumento, string> = {
  OBITO_ESTADO_CIVIL: 'Óbito e estado civil',
  FALECIDO: 'Documentos pessoais do(a) de cujus',
  SOBREVIVENTE: 'Documentos pessoais do cônjuge/companheiro(a) supérstite',
  HERDEIROS: 'Documentos pessoais dos herdeiros',
  TESTAMENTO: 'Testamento',
  IMOVEIS: 'Imóveis',
  FINANCEIRO: 'Financeiro',
  VEICULOS: 'Veículos',
  SOCIETARIO: 'Participações societárias',
  ADVOGADO: 'Documentos do advogado',
  FISCAL: 'Fiscal',
  ENCERRAMENTO: 'Encerramento do caso',
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
    id: 'certidao-casamento-falecido',
    grupo: 'OBITO_ESTADO_CIVIL',
    titulo: 'Certidão de casamento do falecido',
    descricao:
      'Atualizada (90 dias), com o regime de bens legível; havendo pacto antenupcial, o pacto registrado.',
  },
  {
    id: 'docs-falecido',
    grupo: 'FALECIDO',
    titulo: 'RG/CNH e CPF do(a) de cujus',
    descricao: 'Documento de identidade com CPF do(a) autor(a) da herança.',
  },
  {
    id: 'docs-sobrevivente',
    grupo: 'SOBREVIVENTE',
    titulo: 'RG/CNH, CPF e comprovante de endereço do(a) supérstite',
    descricao: 'Documento de identidade com CPF e comprovante de endereço do cônjuge/companheiro(a).',
  },
  {
    id: 'docs-herdeiros',
    grupo: 'HERDEIROS',
    titulo: 'RG/CNH e CPF de cada herdeiro (e cônjuge de herdeiro)',
    descricao:
      'Documento de identidade com CPF de cada herdeiro e do cônjuge do herdeiro casado. Os enviados pelo cofre de documentos entram aqui.',
  },
  {
    id: 'certidoes-herdeiros',
    grupo: 'HERDEIROS',
    titulo: 'Certidão de casamento ou nascimento de cada herdeiro',
    descricao: 'Atualizadas — provam a filiação e o estado civil que entram na escritura.',
  },
  {
    id: 'comprovantes-endereco',
    grupo: 'HERDEIROS',
    titulo: 'Comprovantes de endereço dos herdeiros',
    descricao: 'Conta de consumo ou correspondência bancária recente de cada herdeiro.',
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
    id: 'docs-advogado',
    grupo: 'ADVOGADO',
    titulo: 'Procuração e documentos do advogado',
    descricao:
      'Procuração das partes ao advogado (ad judicia et extra), substabelecimentos, carteira da OAB e contrato de honorários.',
  },
  {
    id: 'declaracao-ir',
    grupo: 'FISCAL',
    titulo: 'Última declaração de IR do falecido',
    descricao: 'O mapa do patrimônio: confere se nenhum bem ficou fora das declarações.',
  },
  {
    id: 'declaracao-itcmd',
    grupo: 'FISCAL',
    titulo: 'Declaração do ITCMD',
    descricao:
      'A declaração transmitida no sistema da Sefaz-SP, com o número do protocolo — base da conta fiscal do imposto.',
  },
  {
    id: 'demonstrativo-itcmd',
    grupo: 'FISCAL',
    titulo: 'Demonstrativo de cálculo do ITCMD',
    descricao:
      'O demonstrativo emitido pela Sefaz-SP (conta fiscal): base atualizada, multas, juros e desconto — confere com a provisão do item IV.',
  },
  {
    id: 'guia-itcmd',
    grupo: 'FISCAL',
    titulo: 'Guia de recolhimento (DARE) do ITCMD',
    descricao: 'A guia DARE emitida para o recolhimento do imposto, dentro da validade.',
  },
  {
    id: 'comprovante-itcmd',
    grupo: 'FISCAL',
    titulo: 'Comprovante de pagamento do ITCMD',
    descricao:
      'O comprovante bancário do recolhimento — o RI confere antes de registrar (Lei 10.705/2000, art. 25); estanca os encargos na data do pagamento (item IV).',
  },
  // ENCERRAMENTO: o produto final do caso volta para o cofre — traslado
  // (extrajudicial) OU formal de partilha (judicial), e as matrículas já com
  // os registros das partilhas. É o que fecha o controle documental do caso.
  {
    id: 'traslado-escritura',
    grupo: 'ENCERRAMENTO',
    titulo: 'Traslado da escritura de inventário e partilha',
    descricao:
      'Via extrajudicial: o traslado lavrado pelo Tabelionato — o título que vai a registro.',
  },
  {
    id: 'formal-partilha',
    grupo: 'ENCERRAMENTO',
    titulo: 'Formal de partilha (ou carta de adjudicação)',
    descricao:
      'Via judicial: o formal expedido após o trânsito em julgado — o título que vai a registro.',
  },
  {
    id: 'matriculas-registradas',
    grupo: 'ENCERRAMENTO',
    titulo: 'Matrículas com os registros das partilhas',
    descricao:
      'Após a finalização: a certidão atualizada de cada matrícula já com o registro da partilha — comprova a transmissão concluída em todos os imóveis.',
  },
  {
    id: 'outros',
    grupo: 'OUTROS',
    titulo: 'Outros documentos do caso',
    descricao:
      'O que o caso pedir: alvarás, procurações, renúncias, certidões negativas, guias pagas…',
  },
];

/**
 * Classificação de RESERVA pelo nome do arquivo + tipo detectado — usada
 * quando a leitura por IA não devolve o item do catálogo (falha do lote,
 * arquivo fora do formato, documentoId nulo). A ORDEM importa: o específico
 * vem antes. O que não casa vai para "outros" — nunca para um item errado.
 */
const REGRAS_CLASSIFICACAO: Array<[RegExp, string]> = [
  [/TRASLADO|ESCRITURA DE INVENTARIO/, 'traslado-escritura'],
  [/FORMAL DE PARTILHA|CARTA DE ADJUDICACAO|CARTA DE SENTENCA/, 'formal-partilha'],
  [/OBITO/, 'certidao-obito'],
  [/TESTAMENTO|CENSEC|RCTO/, 'certidao-testamento'],
  [/CONTRATO SOCIAL|ALTERACAO CONTRATUAL|JUCESP|\bCNPJ\b|SOCIETARI/, 'contrato-social'],
  [/BALANCO/, 'balanco-patrimonial'],
  [/CASAMENTO|PACTO ANTENUPCIAL|UNIAO ESTAVEL/, 'certidao-casamento-falecido'],
  [/NASCIMENTO/, 'certidoes-herdeiros'],
  [/MATRICULA|INTEIRO TEOR|\bONUS\b|REGISTRO DE IMOVEIS/, 'matricula-imovel'],
  [/VALOR VENAL|\bIPTU\b|\bCCIR\b|\bITR\b/, 'valor-venal'],
  [/\bCRLV\b|\bCRV\b|\bDUT\b|VEICULO|RENAVAM|\bIPVA\b|\bFIPE\b/, 'doc-veiculos'],
  [/EXTRATO|SALDO|APLICACAO|POUPANCA|PREVIDENCIA/, 'extratos-bancarios'],
  [/IMPOSTO DE RENDA|\bIRPF\b|\bDIRPF\b|DECLARACAO DE AJUSTE/, 'declaracao-ir'],
  // ITCMD: a ordem importa — comprovante/guia/demonstrativo antes do genérico.
  [/COMPROVANTE.*(ITCMD|DARE)|(ITCMD|DARE).*(PAGO|PAGAMENTO|RECOLHIMENTO|QUITA)/, 'comprovante-itcmd'],
  [/\bDARE\b|GUIA.*(ITCMD|RECOLHIMENTO)/, 'guia-itcmd'],
  [/DEMONSTRATIVO|CONTA FISCAL/, 'demonstrativo-itcmd'],
  [/DECLARACAO.*ITCMD|ITCMD.*DECLARACAO|\bITCMD\b|\bITCD\b/, 'declaracao-itcmd'],
  [/PROCURACAO|SUBSTABELECIMENTO|\bOAB\b|HONORARIOS/, 'docs-advogado'],
  [/RESIDENCIA|ENDERECO/, 'comprovantes-endereco'],
  // Sem saber de QUEM é o RG/CNH, o palpite seguro é o grupo dos herdeiros
  // (maioria das partes) — a IA é quem separa de cujus/supérstite.
  [/\bRG\b|\bCNH\b|\bCPF\b|IDENTIDADE|PASSAPORTE|HABILITACAO/, 'docs-herdeiros'],
];

export function classificarNoCatalogo(tipoDetectado: string, fileName: string): string {
  const n = `${tipoDetectado} ${fileName}`
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase();
  for (const [padrao, id] of REGRAS_CLASSIFICACAO) {
    if (padrao.test(n)) return id;
  }
  return 'outros';
}
