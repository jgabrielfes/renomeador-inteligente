// Agrupamento dos documentos em conjuntos, para organizar a pasta em subpastas
// (DOCUMENTOS PESSOAIS, DOCUMENTOS DO IMÓVEL, CONTRATOS…).
//
// A classificação NÃO pode ser só uma tabela de tipos conhecidos: no modo IA o
// tipo vem do Gemini em texto livre ("Certidão de Casamento em Regime de
// Comunhão", "Contrato de Cessão de Direitos"), e nunca bateria exatamente com
// a lista local. Por isso há duas camadas: tabela exata primeiro, palavras-
// chave depois. O que não se encaixa vai para "OUTROS DOCUMENTOS" em vez de
// ser espalhado em pastas erradas.

import { normalize } from "./renamer";

export const CATEGORIA_OUTROS = "OUTROS DOCUMENTOS";

export const CATEGORIAS = [
  "DOCUMENTOS PESSOAIS",
  "DOCUMENTOS DO IMÓVEL",
  "DOCUMENTOS DO VEÍCULO",
  "DOCUMENTOS CRÉDITOS",
  "DOCUMENTOS SOCIETÁRIO",
  "CONTRATOS",
  "IMPOSTO DE TRANSMISSÃO",
  "CERTIDÕES NEGATIVAS",
  "COMPROVANTES E PAGAMENTOS",
  CATEGORIA_OUTROS,
] as const;

export type Categoria = (typeof CATEGORIAS)[number];

// Tipos que o motor local (lib/renamer.ts) produz.
const POR_TIPO: Record<string, Categoria> = {
  RG: "DOCUMENTOS PESSOAIS",
  CNH: "DOCUMENTOS PESSOAIS",
  CPF: "DOCUMENTOS PESSOAIS",
  Passaporte: "DOCUMENTOS PESSOAIS",
  "Certidão de Nascimento": "DOCUMENTOS PESSOAIS",
  "Certidão de Casamento": "DOCUMENTOS PESSOAIS",
  "Certidão de Óbito": "DOCUMENTOS PESSOAIS",
  "Comprovante de Residência": "DOCUMENTOS PESSOAIS",

  "Matrícula de Imóvel": "DOCUMENTOS DO IMÓVEL",
  "Certidão de Valor Venal": "DOCUMENTOS DO IMÓVEL",
  "Certidão Negativa de Tributos Imobiliários": "DOCUMENTOS DO IMÓVEL",
  "Certidão de Ônus": "DOCUMENTOS DO IMÓVEL",
  "Certidão Vintenária": "DOCUMENTOS DO IMÓVEL",
  IPTU: "DOCUMENTOS DO IMÓVEL",
  "Habite-se": "DOCUMENTOS DO IMÓVEL",
  Escritura: "DOCUMENTOS DO IMÓVEL",

  Contrato: "CONTRATOS",
  "Contrato de Compra e Venda": "CONTRATOS",
  "Contrato de Locação": "CONTRATOS",
  "Contrato de Prestação de Serviços": "CONTRATOS",
  "Contrato de Honorários": "CONTRATOS",
  Procuração: "CONTRATOS",

  ITBI: "IMPOSTO DE TRANSMISSÃO",
  "Guia de ITBI": "IMPOSTO DE TRANSMISSÃO",

  "Certidão Negativa de Débitos": "CERTIDÕES NEGATIVAS",
  "Certidão Negativa de Débitos Trabalhistas": "CERTIDÕES NEGATIVAS",
  "Certidão de Distribuição": "CERTIDÕES NEGATIVAS",
  "Certidão de Protesto": "CERTIDÕES NEGATIVAS",

  Boleto: "COMPROVANTES E PAGAMENTOS",
  "Comprovante de Pagamento": "COMPROVANTES E PAGAMENTOS",
  "Termo de Quitação": "COMPROVANTES E PAGAMENTOS",

  CRLV: "DOCUMENTOS DO VEÍCULO",
  CRV: "DOCUMENTOS DO VEÍCULO",
  ATPV: "DOCUMENTOS DO VEÍCULO",
  "Documento do Veículo": "DOCUMENTOS DO VEÍCULO",
  "Certificado de Registro de Veículo": "DOCUMENTOS DO VEÍCULO",
  IPVA: "DOCUMENTOS DO VEÍCULO",

  "Extrato Bancário": "DOCUMENTOS CRÉDITOS",
  "Extrato de Aplicação": "DOCUMENTOS CRÉDITOS",
  "Cédula de Crédito Bancário": "DOCUMENTOS CRÉDITOS",

  "Contrato Social": "DOCUMENTOS SOCIETÁRIO",
  "Alteração Contratual": "DOCUMENTOS SOCIETÁRIO",
  "Balanço Patrimonial": "DOCUMENTOS SOCIETÁRIO",
  "Cartão CNPJ": "DOCUMENTOS SOCIETÁRIO",
};

// Segunda camada, sobre o tipo normalizado (sem acento, maiúsculo). A ORDEM
// importa: o mais específico vem antes. "Guia de ITBI" tem de cair em imposto
// de transmissão, não em "guia" genérica; "Certidão Negativa de Tributos
// Imobiliários" é do imóvel, não uma certidão negativa qualquer.
const POR_PALAVRA: Array<[RegExp, Categoria]> = [
  [/\bITBI\b|TRANSMISSAO (?:DE )?BENS|IMPOSTO DE TRANSMISSAO/, "IMPOSTO DE TRANSMISSÃO"],

  [
    /MATRICULA|VALOR VENAL|TRIBUTOS IMOBILIARIOS|\bIPTU\b|HABITE|\bONUS\b|VINTENARIA|ESCRITURA|IMOVEL|IMOVEIS|REGISTRO DE IMOVEIS/,
    "DOCUMENTOS DO IMÓVEL",
  ],

  // Societário antes de CONTRATOS: "Contrato Social" é sociedade, não contrato
  // avulso. Veículo e créditos também vêm antes, para "Contrato de
  // Financiamento" e "Compra e Venda de Veículo" caírem na pasta certa.
  [
    /CONTRATO SOCIAL|ALTERACAO CONTRATUAL|SOCIETARI|JUCESP|\bCNPJ\b|\bQSA\b|ATA DE (?:ASSEMBLEIA|REUNIAO)|BALANCO|DEMONSTRACAO FINANCEIRA|QUADRO DE SOCIOS|DISTRATO SOCIAL/,
    "DOCUMENTOS SOCIETÁRIO",
  ],

  [
    /VEICULO|VEICULOS|\bCRLV\b|\bCRV\b|\bATPV\b|\bDUT\b|RENAVAM|LICENCIAMENTO|\bIPVA\b|\bDETRAN\b|\bFIPE\b/,
    "DOCUMENTOS DO VEÍCULO",
  ],

  [
    /EXTRATO|CEDULA DE CREDITO|EMPRESTIMO|FINANCIAMENTO|CONSORCIO|APLICACAO FINANCEIRA|INVESTIMENTO|POUPANCA|CONTA CORRENTE|PREVIDENCIA|\bVGBL\b|\bPGBL\b|VALORES A RECEBER/,
    "DOCUMENTOS CRÉDITOS",
  ],

  [/CONTRATO|PROCURACAO|DISTRATO|CESSAO DE DIREITOS|COMPROMISSO/, "CONTRATOS"],

  [
    /\bRG\b|IDENTIDADE|\bCNH\b|HABILITACAO|\bCPF\b|PASSAPORTE|NASCIMENTO|CASAMENTO|OBITO|RESIDENCIA|ENDERECO|TITULO DE ELEITOR|RESERVISTA|CARTEIRA DE TRABALHO/,
    "DOCUMENTOS PESSOAIS",
  ],

  [/NEGATIVA|DISTRIBUICAO|PROTESTO|TRABALHISTA|ANTECEDENTES/, "CERTIDÕES NEGATIVAS"],

  [/BOLETO|COMPROVANTE|QUITACAO|RECIBO|PAGAMENTO|GUIA|DARF|\bDAM\b/, "COMPROVANTES E PAGAMENTOS"],
];

/** Conjunto a que um tipo de documento pertence. */
export function categoriaDe(docType: string): Categoria {
  const tipo = (docType ?? "").trim();
  if (!tipo) return CATEGORIA_OUTROS;

  const exata = POR_TIPO[tipo];
  if (exata) return exata;

  const n = normalize(tipo);
  for (const [padrao, categoria] of POR_PALAVRA) {
    if (padrao.test(n)) return categoria;
  }
  return CATEGORIA_OUTROS;
}
