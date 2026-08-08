// Extração da qualificação da parte (nome, CPF, RG, nascimento, filiação) a
// partir do texto de um RG ou CNH, para a folha de pesquisa.
//
// Onde o projeto já tem heurística calibrada, ela é reaproveitada em vez de
// duplicada: o CPF sai de `extractCpf` (que confere o dígito verificador, coisa
// que um regex solto não faz) e o nome de `extractName`, calibrado com
// documentos reais. O resto — RG, data de nascimento e filiação — é específico
// desta tela e vive aqui.

import {
  detectDocumentType,
  extractCpf,
  extractName,
  plausibleName,
} from "./renamer";

export interface Qualificacao {
  nome: string;
  cpf: string;
  rg: string;
  nasc: string;
  mae: string;
  pai: string;
  cnpj: string;
}

export const CAMPOS: Array<{
  id: keyof Qualificacao;
  label: string;
  placeholder: string;
  mask?: "cpf" | "cnpj" | "data";
}> = [
  { id: "nome", label: "Nome completo", placeholder: "como consta no RG" },
  { id: "cpf", label: "CPF", placeholder: "000.000.000-00", mask: "cpf" },
  { id: "rg", label: "RG", placeholder: "00.000.000-0" },
  { id: "nasc", label: "Data de nascimento", placeholder: "00/00/0000", mask: "data" },
  { id: "mae", label: "Nome da mãe", placeholder: "exigido no TJSP e TRF3" },
  { id: "pai", label: "Nome do pai", placeholder: "quando exigido" },
  { id: "cnpj", label: "CNPJ (se PJ)", placeholder: "00.000.000/0000-00", mask: "cnpj" },
];

export function aplicarMascara(valor: string, tipo?: "cpf" | "cnpj" | "data"): string {
  if (!tipo) return valor;
  const n = valor.replace(/\D/g, "");
  if (tipo === "cpf") {
    return n
      .slice(0, 11)
      .replace(/(\d{3})(\d)/, "$1.$2")
      .replace(/(\d{3})(\d)/, "$1.$2")
      .replace(/(\d{3})(\d{1,2})$/, "$1-$2");
  }
  if (tipo === "cnpj") {
    return n
      .slice(0, 14)
      .replace(/(\d{2})(\d)/, "$1.$2")
      .replace(/(\d{3})(\d)/, "$1.$2")
      .replace(/(\d{3})(\d)/, "$1/$2")
      .replace(/(\d{4})(\d{1,2})$/, "$1-$2");
  }
  return n
    .slice(0, 8)
    .replace(/(\d{2})(\d)/, "$1/$2")
    .replace(/(\d{2})(\d)/, "$1/$2");
}

/** Linha que parece um nome de pessoa (e não um cabeçalho do documento). */
function ehNome(s: string): boolean {
  const t = (s ?? "").trim();
  if (t.length < 6 || t.length > 60) return false;
  if (/\d/.test(t)) return false; // nome não tem número
  if (!/\s/.test(t)) return false; // precisa de ao menos duas palavras
  if (
    /(REPUBLICA|FEDERATIVA|SECRETARIA|SEGURANCA|VALIDA|NACIONAL|ASSINATURA|CARTEIRA|HABILITACAO|MINISTERIO|DETRAN|IDENTIDADE|EXPEDI|FILIACAO|OBSERVA)/i.test(
      t
    )
  ) {
    return false;
  }
  return /^[A-ZÀ-Úa-zà-ú'´` .-]+$/.test(t) && plausibleName(t);
}

function proximoNome(linhas: string[], from: number): string {
  for (let i = from; i < Math.min(from + 3, linhas.length); i++) {
    if (ehNome(linhas[i])) return linhas[i].trim();
  }
  return "";
}

/**
 * Lê a qualificação do texto do documento. Devolve só os campos encontrados —
 * o que não vier fica em branco para o usuário preencher.
 */
export function extrairQualificacao(texto: string): Partial<Qualificacao> {
  const bruto = texto.replace(/[ \t]+/g, " ");
  const linhas = bruto.split("\n").map((l) => l.trim()).filter(Boolean);
  const alto = bruto.toUpperCase();
  const out: Partial<Qualificacao> = {};

  // CNPJ antes de CPF: um CNPJ contém sequências que o padrão de CPF casaria.
  const cnpj = alto.match(
    /\b(\d{2})[.\s]?(\d{3})[.\s]?(\d{3})[/\s]?(\d{4})[-\s]?(\d{2})\b/
  );
  if (cnpj) out.cnpj = `${cnpj[1]}.${cnpj[2]}.${cnpj[3]}/${cnpj[4]}-${cnpj[5]}`;
  else {
    // Valida o dígito verificador, então não confunde com outros números longos.
    const cpf = extractCpf(texto);
    if (cpf) out.cpf = cpf;
  }

  // Data de nascimento: rótulo explícito vence; senão, a data mais antiga —
  // num RG/CNH as outras datas (emissão, validade) são sempre posteriores.
  const rotulada = alto.match(
    /(?:NASC[A-Z]*|DATA DE NASC[A-Z]*)[^\d]{0,20}(\d{2})[/.\-](\d{2})[/.\-](\d{4})/
  );
  if (rotulada) {
    out.nasc = `${rotulada[1]}/${rotulada[2]}/${rotulada[3]}`;
  } else {
    const datas = [...alto.matchAll(/\b(\d{2})[/.\-](\d{2})[/.\-](\d{4})\b/g)].map(
      (m) => `${m[1]}/${m[2]}/${m[3]}`
    );
    if (datas.length) {
      out.nasc = datas.sort((a, b) => Number(a.slice(6)) - Number(b.slice(6)))[0];
    }
  }

  const rg = alto.match(
    /(?:REGISTRO GERAL|\bRG\b|IDENTIDADE)[^\d]{0,20}([\d.\s]{7,14}[-\s]?[\dXx])/
  );
  if (rg) out.rg = rg[1].replace(/\s/g, "").trim();

  // Nome: primeiro a extração calibrada do projeto; se ela não achar, cai na
  // leitura por rótulo.
  const tipo = detectDocumentType(texto);
  const nome = extractName(texto, tipo);
  if (nome) out.nome = nome;
  else {
    const i = linhas.findIndex(
      (l) => /^NOME\b/i.test(l) && !/M[ÃA]E|PAI|SOCIAL|FILIA/i.test(l)
    );
    if (i >= 0) {
      const mesmaLinha = linhas[i].replace(/^NOME\s*:?\s*/i, "").trim();
      const achado = ehNome(mesmaLinha) ? mesmaLinha : proximoNome(linhas, i + 1);
      if (achado) out.nome = achado;
    }
  }

  // Filiação: normalmente duas linhas de nomes após o rótulo. No RG e na CNH a
  // ordem usual é pai e depois mãe — a tela tem botão de troca porque isso
  // varia entre emissores.
  const iFil = linhas.findIndex((l) => /FILIA[ÇC][ÃA]O/i.test(l));
  if (iFil >= 0) {
    const nomes: string[] = [];
    const inline = linhas[iFil].replace(/.*FILIA[ÇC][ÃA]O\s*:?\s*/i, "").trim();
    if (ehNome(inline)) nomes.push(inline);
    for (let i = iFil + 1; i < linhas.length && nomes.length < 2; i++) {
      if (ehNome(linhas[i])) nomes.push(linhas[i].trim());
    }
    if (nomes[0]) out.pai = nomes[0];
    if (nomes[1]) out.mae = nomes[1];
  }
  // Rótulo explícito de mãe vence a heurística de ordem.
  const linhaMae = linhas.find((l) => /(NOME DA )?M[ÃA]E\s*:/i.test(l));
  if (linhaMae) {
    const v = linhaMae.replace(/.*M[ÃA]E\s*:\s*/i, "").trim();
    if (ehNome(v)) out.mae = v;
  }

  return out;
}
