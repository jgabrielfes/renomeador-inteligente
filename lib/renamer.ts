// Lógica de nomeação portada de renomeador_documentos.py.
// Todas as funções são puras: recebem o texto extraído por OCR e devolvem o nome proposto.

export function cleanSpaces(text: string): string {
  return (text ?? "").replace(/\s+/g, " ").trim();
}

export function normalize(text: string): string {
  return (text ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();
}

export function safeFilename(name: string): string {
  let out = name.replace(/[<>:"/\\|?*]/g, "-");
  out = out.replace(/\s+/g, " ").replace(/^[\s.\-_]+|[\s.\-_]+$/g, "");
  return out.slice(0, 180) || "Documento";
}

const DOC_RULES: Array<[string, RegExp[]]> = [
  ["CNH", [
    /CARTEIRA NACIONAL DE HABILITACAO/s,
    /PERMISSAO PARA DIRIGIR/s,
    /DRIVER LICENSE/s,
    /CATEGORIA.*VALIDADE/s,
  ]],
  ["RG", [
    /CARTEIRA DE IDENTIDADE/s,
    /REGISTRO GERAL/s,
    /SECRETARIA.*SEGURANCA PUBLICA/s,
    /INSTITUTO DE IDENTIFICACAO/s,
  ]],
  ["CPF", [
    /CADASTRO DE PESSOAS FISICAS/s,
    /REPUBLICA FEDERATIVA DO BRASIL.*CPF/s,
  ]],
  ["Passaporte", [
    /PASSAPORTE/s,
    /PASSPORT/s,
  ]],
  ["Certidão de Nascimento", [
    /CERTIDAO DE NASCIMENTO/s,
    /REGISTRO CIVIL.*NASCIMENTO/s,
  ]],
  ["Certidão de Casamento", [
    /CERTIDAO DE CASAMENTO/s,
    /REGISTRO CIVIL.*CASAMENTO/s,
  ]],
  ["Certidão de Óbito", [
    /CERTIDAO DE OBITO/s,
    /REGISTRO CIVIL.*OBITO/s,
  ]],
  ["Comprovante de Residência", [
    /ENERGIA ELETRICA/s,
    /CONTA DE ENERGIA/s,
    /FATURA.*AGUA/s,
    /SABESP/s,
    /ENEL/s,
    /EDP/s,
    /COMPROVANTE DE ENDERECO/s,
  ]],
  ["Matrícula de Imóvel", [
    /REGISTRO DE IMOVEIS/s,
    /MATRICULA\s*(N|NO|NUMERO|Nº)?\s*[.: -]?\s*\d+/s,
    /OFICIAL DE REGISTRO DE IMOVEIS/s,
  ]],
  ["IPTU", [
    /IPTU/s,
    /IMPOSTO PREDIAL E TERRITORIAL URBANO/s,
  ]],
  ["ITBI", [
    /ITBI/s,
    /IMPOSTO SOBRE TRANSMISSAO.*BENS IMOVEIS/s,
  ]],
  ["Escritura", [
    /ESCRITURA PUBLICA/s,
    /SAIBAM QUANTOS.*PUBLICO INSTRUMENTO/s,
    /TABELIAO DE NOTAS/s,
  ]],
  ["Procuração", [
    /PROCURACAO/s,
    /OUTORGANTE/s,
    /OUTORGADO/s,
  ]],
  ["Contrato", [
    /CONTRATO DE/s,
    /INSTRUMENTO PARTICULAR/s,
  ]],
];

export function detectDocumentType(text: string): string {
  const n = normalize(text);
  for (const [label, patterns] of DOC_RULES) {
    if (patterns.some((p) => p.test(n))) return label;
  }
  return "Documento";
}

export function extractCpf(text: string): string | null {
  const m = text.match(/\b\d{3}\.?\d{3}\.?\d{3}[- ]?\d{2}\b/);
  return m ? m[0] : null;
}

const NAME_PARTICLES = new Set(["DA", "DE", "DO", "DAS", "DOS", "E"]);

export function titleCaseName(s: string): string {
  return cleanSpaces(s)
    .split(" ")
    .map((w) => {
      const nw = normalize(w);
      if (NAME_PARTICLES.has(nw)) return nw.toLowerCase();
      return w.slice(0, 1).toUpperCase() + w.slice(1).toLowerCase();
    })
    .join(" ");
}

const NAME_BLOCKLIST = [
  "REPUBLICA FEDERATIVA", "CARTEIRA", "IDENTIDADE", "NACIONAL",
  "HABILITACAO", "SECRETARIA", "VALIDADE", "NASCIMENTO",
  "FILIACAO", "ASSINATURA", "DOCUMENTO", "REGISTRO", "CPF",
  "DATA", "ESTADO", "BRASIL", "CERTIDAO", "MATRICULA",
  "TABELIAO", "OFICIAL", "ENDERECO", "NATURALIDADE",
];

export function plausibleName(s: string): boolean {
  s = cleanSpaces(s);
  if (s.length < 5 || s.length > 80) return false;
  if (/\d/.test(s)) return false;

  const n = normalize(s);
  if (NAME_BLOCKLIST.some((b) => n.includes(b))) return false;

  const words = s.split(" ");
  return (
    words.length >= 2 &&
    words.length <= 8 &&
    words.filter((x) => x.length > 1).length >= 2
  );
}

export function extractName(text: string): string | null {
  const lines = text
    .split(/\r?\n/)
    .map(cleanSpaces)
    .filter(Boolean);

  // Campos explícitos comuns.
  const fieldPatterns = [
    /(?:NOME|NAME)\s*[:\-]?\s*([A-ZÁÉÍÓÚÂÊÔÃÕÇ][A-ZÁÉÍÓÚÂÊÔÃÕÇa-záéíóúâêôãõç' ]{5,80})/i,
    /(?:NOME DO TITULAR|TITULAR)\s*[:\-]?\s*([A-ZÁÉÍÓÚÂÊÔÃÕÇ][A-ZÁÉÍÓÚÂÊÔÃÕÇa-záéíóúâêôãõç' ]{5,80})/i,
  ];

  for (const p of fieldPatterns) {
    const m = text.match(p);
    if (m) {
      // corta quando o OCR juntou outro rótulo na mesma linha
      const candidate = cleanSpaces(
        m[1].split(/\b(?:CPF|RG|DOC|DATA|NASC|FILIACAO|VALIDADE)\b/i)[0]
      );
      if (plausibleName(candidate)) return titleCaseName(candidate);
    }
  }

  // Para CNH/RG, procura linhas próximas a "NOME".
  for (let i = 0; i < lines.length; i++) {
    if (/\bNOME\b/.test(normalize(lines[i]))) {
      for (let j = i; j < Math.min(i + 4, lines.length); j++) {
        const candidate = lines[j].replace(/^.*?\bNOME\b\s*[:\-]?\s*/i, "").trim();
        if (plausibleName(candidate)) return titleCaseName(candidate);
      }
    }
  }

  // Heurística geral: linhas em caixa alta com 2-6 palavras.
  const candidates: Array<[number, string]> = [];
  for (const line of lines.slice(0, 45)) {
    const candidate = cleanSpaces(line.replace(/[^A-Za-zÀ-ÿ' \-]/g, " "));
    if (plausibleName(candidate)) {
      let score = 0;
      if (line === line.toUpperCase()) score += 2;
      score += Math.min(candidate.split(" ").length, 5);
      if (candidate.length >= 8 && candidate.length <= 55) score += 2;
      candidates.push([score, candidate]);
    }
  }

  if (candidates.length > 0) {
    candidates.sort((a, b) => b[0] - a[0]);
    return titleCaseName(candidates[0][1]);
  }

  return null;
}

export function extractMatricula(text: string): string | null {
  const n = normalize(text);
  const patterns = [
    /MATRICULA\s*(?:N|NO|NUMERO|Nº)?\s*[.: -]?\s*([0-9.\-]{2,20})/,
    /MATRICULA\s+([0-9.\-]{2,20})/,
  ];
  for (const p of patterns) {
    const m = n.match(p);
    if (m) return m[1].replace(/^[.\-\s]+|[.\-\s]+$/g, "");
  }
  return null;
}

export function getExtension(fileName: string): string {
  const m = fileName.match(/\.[^.]+$/);
  return m ? m[0].toLowerCase() : "";
}

export interface Proposal {
  name: string;
  docType: string;
}

export function proposeName(fileName: string, text: string): Proposal {
  const docType = detectDocumentType(text);
  const personName = extractName(text);

  let base: string;
  if (docType === "Matrícula de Imóvel") {
    const mat = extractMatricula(text);
    base = mat ? `Matrícula ${mat}` : "Matrícula de Imóvel";
  } else if (personName) {
    base = `${docType} - ${personName}`;
  } else {
    const cpf = extractCpf(text);
    base =
      cpf && ["RG", "CNH", "CPF"].includes(docType)
        ? `${docType} - CPF ${cpf}`
        : docType;
  }

  return { name: safeFilename(base) + getExtension(fileName), docType };
}

// Evita nomes duplicados dentro do mesmo lote (equivalente ao unique_target do original).
export function uniqueName(used: Set<string>, filename: string): string {
  if (!used.has(filename.toLowerCase())) return filename;
  const ext = getExtension(filename);
  const stem = ext ? filename.slice(0, -ext.length) : filename;
  for (let i = 2; ; i++) {
    const candidate = `${stem} (${i})${ext}`;
    if (!used.has(candidate.toLowerCase())) return candidate;
  }
}

// Garante que o nome editado pelo usuário mantenha a extensão do arquivo original.
export function ensureExtension(name: string, originalFileName: string): string {
  const ext = getExtension(originalFileName);
  if (!ext) return name;
  return name.toLowerCase().endsWith(ext) ? name : name + ext;
}
