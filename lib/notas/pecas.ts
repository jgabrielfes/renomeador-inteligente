// Montagem dos dados de cada peça a partir do traslado + entrada humana.
//
// As qualificações e a identificação do ato saem do traslado, sem
// redigitação. Só o teor do erro e da correção é humano. Campos sem dado
// permanecem como {{PLACEHOLDER}} visível na minuta (trava de segurança).

import type { DadosTraslado } from "./traslado";

export type TipoPeca = "ata" | "requerimento" | "rerratificacao";

export const TEMPLATES: Record<TipoPeca, string> = {
  ata: "/templates/notas/template_ata_retificativa.docx",
  requerimento: "/templates/notas/template_requerimento.docx",
  rerratificacao: "/templates/notas/template_rerratificacao.docx",
};

export const NOMES_PECA: Record<TipoPeca, string> = {
  ata: "Ata retificativa",
  requerimento: "Requerimento",
  rerratificacao: "Escritura de rerratificação",
};

const EXTENSO_DIA: Record<number, string> = {
  1: "um", 2: "dois", 3: "três", 4: "quatro", 5: "cinco", 6: "seis",
  7: "sete", 8: "oito", 9: "nove", 10: "dez", 11: "onze", 12: "doze",
  13: "treze", 14: "quatorze", 15: "quinze", 16: "dezesseis",
  17: "dezessete", 18: "dezoito", 19: "dezenove", 20: "vinte",
  21: "vinte e um", 22: "vinte e dois", 23: "vinte e três",
  24: "vinte e quatro", 25: "vinte e cinco", 26: "vinte e seis",
  27: "vinte e sete", 28: "vinte e oito", 29: "vinte e nove",
  30: "trinta", 31: "trinta e um",
};

const MESES: Record<string, string> = {
  "01": "janeiro", "02": "fevereiro", "03": "março", "04": "abril",
  "05": "maio", "06": "junho", "07": "julho", "08": "agosto",
  "09": "setembro", "10": "outubro", "11": "novembro", "12": "dezembro",
};

function anoExtenso(ano: number): string {
  // Cobre 2000–2099, o que basta para datas de lavratura.
  const resto = ano - 2000;
  if (resto === 0) return "dois mil";
  return "dois mil e " + (EXTENSO_DIA[resto] ?? dezenas(resto));
}

function dezenas(n: number): string {
  const DEZ: Record<number, string> = {
    30: "trinta", 40: "quarenta", 50: "cinquenta", 60: "sessenta",
    70: "setenta", 80: "oitenta", 90: "noventa",
  };
  const d = Math.floor(n / 10) * 10;
  const u = n % 10;
  if (n <= 31) return EXTENSO_DIA[n] ?? String(n);
  return u === 0 ? DEZ[d] : `${DEZ[d]} e ${EXTENSO_DIA[u]}`;
}

export interface DataExtenso {
  DIA_EXTENSO: string;
  DIA_NUM: string;
  MES_EXTENSO: string;
  MES_NUM: string;
  ANO_EXTENSO: string;
  ANO_NUM: string;
}

// dd/mm/aaaa -> os seis placeholders de data das peças de livro.
export function dataPorExtenso(data: string): DataExtenso | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(data.trim());
  if (!m) return null;
  return {
    DIA_EXTENSO: EXTENSO_DIA[Number(m[1])] ?? m[1],
    DIA_NUM: m[1],
    MES_EXTENSO: MESES[m[2]] ?? m[2],
    MES_NUM: m[2],
    ANO_EXTENSO: anoExtenso(Number(m[3])),
    ANO_NUM: m[3],
  };
}

export function dataExtensoCorrida(data: string): string {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(data.trim());
  if (!m) return data;
  return `${Number(m[1])} de ${MESES[m[2]] ?? m[2]} de ${m[3]}`;
}

// Bloco do Provimento CNJ 149/2023 (MNE, e-Notariado, docautentico) —
// condicional à videoconferência (correlação 5/5 no corpus).
export const BLOCO_MNE =
  "Nos termos Provimento CNJ nº 149/2023, fica consignado, para validade, " +
  "consulta e verificação da autenticidade deste ato notarial: a) - que a " +
  "Matrícula Notarial Eletrônica – MNE, serve como chave de identificação " +
  "individualizada do presente escrito notarial; b) - “Consulte a validade " +
  "deste ato notarial em: www.docautentico.com.br/valida”; e, c) - que a " +
  "MNE, a chave de acesso e o QRCode deste ato notarial constam do " +
  "respectivo “Manifesto de Assinaturas”, gerado na plataforma e-Notariado, " +
  "e que integra o ato. ";

export interface EntradaAta {
  dataAto: string; // dd/mm/aaaa
  artigoNscgj: "53" | "54"; // 53 = qualificação de pessoa; 54 = descrição de bem
  provimentos: string;
  naturezaErro: string;
  especieEscritura: string;
  teorRetificacao: string;
  amparoDocumental: string;
  subscritor: string;
}

export function dadosAta(
  tr: DadosTraslado | null,
  e: EntradaAta
): Record<string, string | undefined> {
  return {
    ...(dataPorExtenso(e.dataAto) ?? {}),
    ARTIGO_NSCGJ: e.artigoNscgj,
    PROVIMENTOS: e.provimentos || undefined,
    NATUREZA_ERRO: e.naturezaErro || undefined,
    ESPECIE_ESCRITURA: e.especieEscritura || tr?.especie,
    ATO_DATA: tr?.data,
    ATO_LIVRO: tr?.traslado?.livro,
    ATO_FLS: tr?.traslado?.fls,
    TEOR_RETIFICACAO: e.teorRetificacao || undefined,
    AMPARO_DOCUMENTAL: e.amparoDocumental || undefined,
    SUBSCRITOR: e.subscritor || undefined,
  };
}

export interface EntradaRequerimento {
  serventia: string;
  qualificacao: string;
  verbo: string;
  referencia: string;
  objeto: string;
  blocoExtra: string;
  data: string; // dd/mm/aaaa
  assinante: string;
}

export function dadosRequerimento(
  e: EntradaRequerimento
): Record<string, string | undefined> {
  return {
    SERVENTIA: e.serventia || undefined,
    QUALIFICACAO: e.qualificacao || undefined,
    VERBO: e.verbo || undefined,
    REFERENCIA: e.referencia,
    OBJETO: e.objeto || undefined,
    BLOCO_EXTRA: e.blocoExtra,
    DATA_EXTENSO: e.data ? dataExtensoCorrida(e.data) : undefined,
    ASSINANTE_1: e.assinante || undefined,
  };
}

export interface EntradaRerratificacao {
  dataAto: string; // dd/mm/aaaa (data do NOVO ato)
  sintese: string;
  blocoLapso: string;
  blocoCorrecao: string;
  prenotacao: string;
  serventia: string;
  tabeliao: string;
}

export function dadosRerratificacao(
  tr: DadosTraslado | null,
  e: EntradaRerratificacao
): Record<string, string | undefined> {
  const video = tr?.videoconferencia ?? false;
  return {
    // --- do traslado, sem redigitação ---
    PARTES_TITULO: tr?.partesTitulo,
    QUALIFICACOES: tr?.qualificacoes,
    ESCREVENTE: tr?.escrevente?.toUpperCase(),
    MODO_COMPARECIMENTO: video
      ? "em VIDEOCONFERÊNCIA, nos termos do Provimento CNJ nº 149/2023, e presencialmente, "
      : "",
    BLOCO_MNE: video ? BLOCO_MNE : "",
    // --- identificação do ato a rerratificar ---
    ATO_ESPECIE: tr?.especie,
    ATO_DATA: tr?.data,
    ATO_LIVRO: tr?.traslado?.livro,
    ATO_FLS: tr?.traslado?.fls,
    ATO_SINTESE: e.sintese || tr?.sinteseSugerida,
    // --- data do novo ato ---
    ...(dataPorExtenso(e.dataAto) ?? {}),
    TABELIAO: e.tabeliao || undefined,
    // --- humano ---
    BLOCO_LAPSO: e.blocoLapso || undefined,
    BLOCO_CORRECAO: e.blocoCorrecao || undefined,
    PRENOTACAO: e.prenotacao || tr?.prenotacao,
    SERVENTIA: e.serventia || tr?.serventia,
  };
}

// Via de resolução -> peça gerável. Providência externa e juntada não geram
// peça (a primeira é acompanhamento; a segunda é busca de documento).
export function pecaDaVia(via: string): TipoPeca | null {
  switch (via) {
    case "ATA_RETIFICATIVA":
      return "ata";
    case "REQUERIMENTO":
      return "requerimento";
    case "RERRATIFICACAO":
      return "rerratificacao";
    default:
      return null;
  }
}
