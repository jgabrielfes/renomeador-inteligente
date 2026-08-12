// Rótulos das tags do Sucessorista na administração.

export const ROTULO_ACAO: Record<string, string> = {
  LEITURA_COFRE: "Leitura do cofre",
  CALCULO: "Caso calculado",
  DOCUMENTO: "Documento gerado",
  PORTAL: "Portal do herdeiro",
};

export const ROTULO_DOCUMENTO: Record<string, string> = {
  XLSX_PARTILHA: "Planilha da partilha",
  MINUTA_TABELIONATO: "Minuta ao tabelionato",
  PETICAO_JUDICIAL: "Petição inicial judicial",
  ESCRITURA: "Minuta de escritura",
  PROPOSTA_HONORARIOS: "Proposta de honorários",
  CONTRATO_HONORARIOS: "Contrato de honorários",
  PDF_PROCESSO: "Processo em PDF",
  ZIP_PROCESSO: "Processo em ZIP",
  ARQUIVO_CASO: "Arquivo do caso (.json)",
};

export const ROTULO_ETAPA_PORTAL: Record<string, string> = {
  CONVITE: "Convite gerado pelo advogado",
  QUALIFICACAO: "Ficha preenchida pelo herdeiro",
  DOCUMENTO: "Documento enviado pelo herdeiro",
};
