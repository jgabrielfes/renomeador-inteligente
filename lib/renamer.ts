// Lógica de nomeação. Todas as funções são puras: recebem o texto extraído
// por OCR (e o nome original do arquivo, usado como dica) e devolvem o nome
// proposto no padrão "<Tipo> - <Identificador>.<ext>".
//
// Princípios de calibração (ver /Users/jgabrielfes/Downloads/Teste):
// 1. Tipo por pontuação, não por primeira regra que casa — um contrato que
//    cita a matrícula do imóvel continua sendo contrato.
// 2. Nome de pessoa só quando passa validação palavra a palavra — nunca
//    frases institucionais ("Ser Confirmada Por Meio do Programa...").
// 3. Sem identificação confiável, mantém o nome original do arquivo —
//    um nome ruim destrói a confiança na ferramenta inteira.

export function cleanSpaces(text: string): string {
  return (text ?? "").replace(/\s+/g, " ").trim();
}

export function normalize(text: string): string {
  return (text ?? "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase();
}

export function safeFilename(name: string): string {
  let out = name.replace(/[<>:"/\\|?*]/g, "-");
  out = out.replace(/\s+/g, " ").replace(/^[\s.\-_]+|[\s.\-_]+$/g, "");
  return out.slice(0, 180) || "Documento";
}

// ---------------------------------------------------------------------------
// Detecção do tipo de documento (pontuação por evidências)
// ---------------------------------------------------------------------------

interface DocRule {
  label: string;
  // [padrão sobre o texto normalizado, peso]
  patterns: Array<[RegExp, number]>;
  // dicas no nome original do arquivo (normalizado)
  filenameHints?: Array<[RegExp, number]>;
}

const DOC_RULES: DocRule[] = [
  {
    label: "CNH",
    patterns: [
      [/CARTEIRA NACIONAL DE HABILITACAO/, 5],
      [/PERMISSAO PARA DIRIGIR/, 4],
      [/DRIVER LICENSE/, 3],
      [/\bSENATRAN\b/, 3],
      [/\bDETRAN\b/, 2],
      [/CAT\.?\s*HAB/, 3],
      [/1[AO] HABILITACAO/, 3],
      [/\bACC\b/, 1],
    ],
    filenameHints: [[/\bCNH\b/, 4]],
  },
  {
    label: "RG",
    patterns: [
      [/CARTEIRA DE IDENTIDADE/, 5],
      [/REGISTRO GERAL/, 4],
      [/SECRETARIA.{0,30}SEGURANCA PUBLICA/, 3],
      [/INSTITUTO DE IDENTIFICACAO/, 3],
    ],
    filenameHints: [[/\bRG\b/, 3]],
  },
  {
    label: "CPF",
    patterns: [[/CADASTRO DE PESSOAS? FISICAS?/, 5]],
    filenameHints: [[/\bCPF\b/, 3]],
  },
  {
    label: "Passaporte",
    patterns: [
      [/\bPASSAPORTE\b/, 4],
      [/\bPASSPORT\b/, 3],
    ],
    filenameHints: [[/PASSAPORTE/, 3]],
  },
  {
    label: "Certidão de Casamento",
    patterns: [
      [/CERTIDAO DE CASAMENTO/, 5],
      [/REGISTRO DO CASAMENTO/, 4],
      [/REGIME DE BENS/, 3],
      [/\bCONJUGES\b/, 3],
    ],
    filenameHints: [[/CASAMENTO/, 3]],
  },
  {
    label: "Certidão de Nascimento",
    patterns: [[/CERTIDAO DE NASCIMENTO/, 5]],
    filenameHints: [[/NASCIMENTO/, 3]],
  },
  {
    label: "Certidão de Óbito",
    patterns: [
      [/CERTIDAO DE OBITO/, 5],
      [/DECLARACAO DE OBITO/, 3],
    ],
    filenameHints: [[/OBITO/, 3]],
  },
  {
    label: "Comprovante de Residência",
    patterns: [
      [/COMPROVANTE DE ENDERECO/, 4],
      [/CONTA DE ENERGIA/, 3],
      [/ENERGIA ELETRICA/, 3],
      [/CONTA DE LUZ/, 3],
      [/FATURA.{0,20}AGUA/, 3],
      [/\bSABESP\b/, 3],
      [/\bENEL\b/, 3],
      [/\bCEMIG\b/, 3],
      [/\bCOPEL\b/, 3],
      [/\bCOMGAS\b/, 3],
    ],
    filenameHints: [[/COMPROVANTE/, 2]],
  },
  {
    label: "Matrícula de Imóvel",
    patterns: [
      [/REGISTRO DE IMOVEIS/, 5],
      [/TRANSCRICAO DAS TRANSMISSOES/, 2],
      [/MATRICULA\s*(?:N[O0]?|NUMERO)?\s*[.: -]?\s*[\d.]{3,}/, 1],
    ],
    filenameHints: [[/MATRICULA/, 3]],
  },
  {
    label: "IPTU",
    patterns: [
      [/IMPOSTO PREDIAL E TERRITORIAL/, 5],
      [/\bIPTU\b/, 2],
    ],
    filenameHints: [[/\bIPTU\b/, 3]],
  },
  {
    label: "ITBI",
    patterns: [
      [/IMPOSTO SOBRE TRANSMISSAO/, 4],
      [/\bITBI\b/, 3],
    ],
    filenameHints: [[/\bITBI\b/, 3]],
  },
  {
    label: "Escritura",
    patterns: [
      [/ESCRITURA PUBLICA/, 5],
      [/SAIBAM QUANTOS/, 4],
      [/TABELIAO DE NOTAS/, 3],
    ],
    filenameHints: [[/ESCRITURA/, 3]],
  },
  {
    label: "Procuração",
    patterns: [
      [/PROCURACAO/, 4],
      [/OUTORGANTE/, 2],
      [/OUTORGAD[OA]/, 2],
      [/\bPODERES\b/, 1],
    ],
    filenameHints: [[/PROCURACAO/, 3]],
  },
  {
    label: "Contrato",
    patterns: [
      [/INSTRUMENTO PARTICULAR/, 4],
      [/COMPROMISSO DE (?:VENDA E COMPRA|COMPRA E VENDA)/, 4],
      [/\bCONTRATO\b/, 2],
      [/CONTRATANTE/, 2],
      [/CONTRATAD[OA]/, 2],
      [/PROMITENTE/, 2],
      [/PROMISSARI[OA]/, 2],
      [/LOCADOR/, 2],
      [/LOCATARI[OA]/, 2],
    ],
    filenameHints: [[/CONTRATO/, 4]],
  },
];

const MIN_TYPE_SCORE = 3;

function contractSubtype(n: string): string {
  if (/(?:VENDA E COMPRA|COMPRA E VENDA)/.test(n)) return "Contrato de Compra e Venda";
  if (/LOCACAO/.test(n)) return "Contrato de Locação";
  if (/PRESTACAO DE SERVICOS/.test(n)) return "Contrato de Prestação de Serviços";
  return "Contrato";
}

export function detectDocumentType(text: string, fileName = ""): string {
  const n = normalize(text);
  const fn = normalize(fileName);

  let best = "Documento";
  let bestScore = 0;
  for (const rule of DOC_RULES) {
    let score = 0;
    for (const [pattern, weight] of rule.patterns) if (pattern.test(n)) score += weight;
    for (const [pattern, weight] of rule.filenameHints ?? [])
      if (pattern.test(fn)) score += weight;
    if (score > bestScore) {
      bestScore = score;
      best = rule.label;
    }
  }

  if (bestScore < MIN_TYPE_SCORE) return "Documento";
  return best === "Contrato" ? contractSubtype(n) : best;
}

// ---------------------------------------------------------------------------
// Validação de nomes de pessoa (palavra a palavra)
// ---------------------------------------------------------------------------

const NAME_PARTICLES = new Set([
  "DA", "DE", "DO", "DAS", "DOS", "E", "D", "DI", "DEL", "LA", "VAN", "VON",
]);

// Palavras (normalizadas) que nunca fazem parte de nome de pessoa.
// Cobrem cabeçalhos institucionais, rótulos de campos, jargão de contratos e
// certidões, endereço e o boilerplate de assinatura digital (Serpro).
const NON_NAME_WORDS = new Set([
  // institucional / cabeçalhos
  "REPUBLICA", "FEDERATIVA", "BRASIL", "MINISTERIO", "SECRETARIA", "NACIONAL",
  "ESTADUAL", "MUNICIPAL", "FEDERAL", "GOVERNO", "PREFEITURA", "TRANSITO",
  "INFRAESTRUTURA", "ESTADO", "COMARCA", "VARA", "FORUM", "OFICIO", "OFICIAL",
  "CARTORIO", "TABELIAO", "NOTAS",
  // documentos / rótulos
  "DOCUMENTO", "DOCUMENTOS", "IDENTIDADE", "IDENTIFICACAO", "HABILITACAO",
  "CARTEIRA", "CATEGORIA", "PERMISSAO", "PASSAPORTE", "REGISTRO", "REGISTROS",
  "CADASTRO", "CERTIDAO", "CERTIFICADO", "MATRICULA", "CIVIL", "PESSOA",
  "PESSOAS", "NATURAIS", "FISICAS", "JURIDICAS", "NOME", "NOMES", "COMPLETO",
  "COMPLETOS", "TITULAR", "VALIDADE", "EMISSAO", "EXPEDICAO", "ASSINATURA",
  "DATA", "DATAS", "LIVRO", "FOLHA", "FOLHAS", "TERMO", "EXTENSO", "CNH",
  "RG", "CPF", "CNPJ", "DOC",
  // certidões / estado civil / filiação
  "NASCIMENTO", "CASAMENTO", "OBITO", "CONJUGES", "SOLTEIRO", "SOLTEIRA",
  "CASADO", "CASADA", "VIUVO", "VIUVA", "DIVORCIADO", "DIVORCIADA", "NASCIDO",
  "NASCIDA", "FALECIDO", "FALECIDA", "FALECIMENTO", "FILHO", "FILHA",
  "FILIACAO", "NATURALIDADE", "NACIONALIDADE", "BRASILEIRO", "BRASILEIRA",
  "PORTUGUES", "PORTUGUESA", "REGIME", "BENS", "AVERBACOES", "ANOTACOES",
  "ANOTACAO", "ASSENTO", "LAVRADO", "CONTRAENTE", "CONTRAENTES", "PASSOU",
  "UTILIZAR", "CONTINUA", "USAR", "MESMO", "QUANDO", "HOUVER", "ALTERACAO",
  // contratos / partes
  "CONTRATO", "INSTRUMENTO", "PARTICULAR", "PUBLICO", "COMPROMISSO", "VENDA",
  "COMPRA", "LOCACAO", "PRESTACAO", "SERVICOS", "VENDEDOR", "VENDEDORA",
  "COMPRADOR", "COMPRADORA", "PROMITENTE", "PROMISSARIO", "PROMISSARIA",
  "CONTRATANTE", "CONTRATADA", "CONTRATADO", "LOCADOR", "LOCADORA",
  "LOCATARIO", "LOCATARIA", "OUTORGANTE", "OUTORGADO", "OUTORGADA", "PARTES",
  "QUALIDADE", "DENOMINADA", "DENOMINADO", "SIMPLESMENTE", "PRESENTE",
  "SEGUINTE", "CLAUSULA", "CLAUSULAS", "PODERES",
  // pessoa jurídica
  "LTDA", "EIRELI", "SPE", "EPP", "EMPRESA", "SOCIEDADE", "EMPRESARIA",
  "INSCRITA", "INSCRITO", "SEDE", "INCORPORADORA", "CONSTRUTORA",
  "ADMINISTRADORA", "IMOBILIARIA", "RESIDENCIAL", "CONDOMINIO", "EDIFICIO",
  // endereço
  "RUA", "AVENIDA", "ALAMEDA", "TRAVESSA", "PRACA", "BAIRRO", "CIDADE",
  "MUNICIPIO", "CEP", "NUMERO", "APARTAMENTO", "CASA", "LOTE", "QUADRA",
  "VILA", "JARDIM", "PARQUE", "SAO",
  // pessoa física / contato
  "PORTADOR", "PORTADORA", "RESIDENTE", "DOMICILIADO", "DOMICILIADA",
  "APOSENTADO", "APOSENTADA", "TELEFONE", "CELULAR", "EMAIL",
  // assinatura digital / Serpro
  "ASSINADO", "DIGITALMENTE", "DIGITAL", "CONFORMIDADE", "MEDIDA",
  "PROVISORIA", "VALIDACAO", "ORIENTACOES", "DISPONIVEIS", "PODERA",
  "CONFIRMADA", "MEIO", "PROGRAMA", "ASSINADOR", "SERPRO", "SENATRAN",
  "DETRAN",
  // imóveis / tributos
  "IMOVEL", "IMOVEIS", "URBANO", "RURAL", "IMPOSTO", "PREDIAL", "TERRITORIAL",
  "TRANSMISSAO", "EXERCICIO", "COMPROVANTE", "ENDERECO", "ENERGIA",
  "ELETRICA", "AGUA", "FATURA", "CONTA",
  // nomes de arquivo comuns
  "WHATSAPP", "IMAGE", "IMG", "SCAN", "SCANNER", "FOTO", "PHOTO", "COPIA",
  "ANEXO", "PAGINA", "PDF", "JPEG", "JPG", "PNG",
]);

function isNameWord(word: string): boolean {
  const n = normalize(word).replace(/['’\-.]/g, "");
  if (!n) return false;
  if (NAME_PARTICLES.has(n)) return true;
  return n.length >= 3 && n.length <= 20 && /^[A-Z]+$/.test(n) && !NON_NAME_WORDS.has(n);
}

export function plausibleName(s: string): boolean {
  s = cleanSpaces(s);
  if (s.length < 5 || s.length > 70) return false;
  if (/[\d@]/.test(s)) return false;

  const words = s.split(" ");
  if (words.length < 2 || words.length > 6) return false;
  if (!words.every(isNameWord)) return false;
  if (NAME_PARTICLES.has(normalize(words[0]))) return false;

  const substantives = words.filter((w) => !NAME_PARTICLES.has(normalize(w)));
  return substantives.length >= 2;
}

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

// Maior sequência de palavras "com cara de nome" dentro de uma linha.
// O OCR intercala lixo ("MANUEL JORGE EIRA DA CUSTODIA [=] Fr. Ed") — a
// sequência válida para no primeiro token inválido ou em pontuação.
function longestNameRun(line: string): string | null {
  const tokens = line.split(/\s+/);
  let best: string[] = [];
  let run: string[] = [];
  const flush = () => {
    if (run.length > best.length) best = run;
    run = [];
  };
  for (const token of tokens) {
    const endsClause = /[,;:.]$/.test(token);
    const word = token.replace(/[,;:.]+$/, "");
    if (/^[A-ZÀ-Ü][A-ZÀ-Ü'’\-]*$/.test(word) && isNameWord(word)) {
      run.push(word);
      if (endsClause) flush();
    } else {
      flush();
    }
  }
  flush();
  // Mais de 6 tokens seguidos é frase corrida, não nome.
  if (best.length < 2 || best.length > 6) return null;
  const candidate = best.join(" ");
  return plausibleName(candidate) ? candidate : null;
}

// ---------------------------------------------------------------------------
// Extratores de nome
// ---------------------------------------------------------------------------

// Certidão de casamento: "ELE: FULANO ..., NASCIDO..." / "ELA: FULANA ..., NASCIDA..."
function extractCouple(text: string): string | null {
  const grab = (label: RegExp): string | null => {
    const m = text.match(label);
    if (!m) return null;
    const run = longestNameRun(m[1]);
    return run ? titleCaseName(run) : null;
  };
  const him = grab(/\bELE\s*[:;]\s*([A-ZÀ-Ü][A-ZÀ-Ü'’\- ]{4,70})/);
  const her = grab(/\bELA\s*[:;]\s*([A-ZÀ-Ü][A-ZÀ-Ü'’\- ]{4,70})/);
  if (him && her) return `${him} e ${her}`;
  return him ?? her;
}

const COMPANY_MARKERS =
  /\b(LTDA|EIRELI|SPE|EPP|MEI|S\/?A|CNPJ|SOCIEDADE|EMPRESA|INCORPORADORA|CONSTRUTORA|ADMINISTRADORA|IMOBILIARIA|RESIDENCIAL|CONDOMINIO)\b/;
const PERSON_CONTEXT =
  /\b(BRASILEIR[OA]|PORTUGU[EÊ]S|CASAD[OA]|SOLTEIR[OA]|VIUV[OA]|DIVORCIAD[OA]|APOSENTAD[OA]|PORTADOR|INSCRIT[OA]|RESIDENTE|DOMICILIAD[OA]|NASCID[OA]|CPF|RG\b)/;

// Contratos, escrituras e procurações qualificam as partes logo após o nome:
// "MANUEL JORGE EIRA DA CUSTODIA, português, viúvo, aposentado, portador...".
// Prefere pessoa física (a parte que interessa para o nome do arquivo).
function extractContractParty(text: string): string | null {
  const pattern = /([A-ZÀ-Ü][A-ZÀ-Ü'’\- ]{6,70})\s*,([\s\S]{0,160})/g;
  for (const m of text.matchAll(pattern)) {
    if (COMPANY_MARKERS.test(normalize(m[1]))) continue;
    if (!PERSON_CONTEXT.test(normalize(m[2]))) continue;
    const run = longestNameRun(m[1]);
    if (run) return titleCaseName(run);
  }
  return null;
}

// Campo "NOME" de RG/CNH/CPF: o valor vem na própria linha ou nas duas
// seguintes (na CNH-e o rótulo e o valor ficam em linhas separadas).
function extractLabeledName(lines: string[]): string | null {
  for (let i = 0; i < lines.length; i++) {
    const n = normalize(lines[i]);
    if (!/\bNOME\b/.test(n)) continue;
    if (/FILIACAO|PAI|MAE/.test(n)) continue;
    const sameLine = lines[i].replace(/^.*?\bNOME\b[\s:.\-]*/i, "");
    for (const candidate of [sameLine, lines[i + 1] ?? "", lines[i + 2] ?? ""]) {
      const run = longestNameRun(candidate);
      if (run) return titleCaseName(run);
    }
  }
  return null;
}

// Última cartada: melhor sequência de nome nas primeiras linhas do documento.
function extractBestRun(lines: string[]): string | null {
  let best: string | null = null;
  let bestScore = -1;
  lines.slice(0, 60).forEach((line, index) => {
    const run = longestNameRun(line);
    if (!run) return;
    const words = run.split(" ").length;
    const score = words * 2 - index * 0.05;
    if (words >= 3 && score > bestScore) {
      bestScore = score;
      best = run;
    }
  });
  return best ? titleCaseName(best) : null;
}

export function extractName(text: string, docType = ""): string | null {
  const lines = text.split(/\r?\n/).map(cleanSpaces).filter(Boolean);

  if (docType.startsWith("Certidão de Casamento")) {
    const couple = extractCouple(text);
    if (couple) return couple;
  }
  if (/^(Contrato|Escritura|Procuração)/.test(docType)) {
    const party = extractContractParty(text);
    if (party) return party;
  }

  return extractLabeledName(lines) ?? extractBestRun(lines);
}

// ---------------------------------------------------------------------------
// CPF (com dígito verificador) e matrícula
// ---------------------------------------------------------------------------

function validCpfDigits(digits: string): boolean {
  if (!/^\d{11}$/.test(digits) || /^(\d)\1{10}$/.test(digits)) return false;
  const dv = (len: number) => {
    let sum = 0;
    for (let i = 0; i < len; i++) sum += Number(digits[i]) * (len + 1 - i);
    const rest = (sum * 10) % 11;
    return rest === 10 ? 0 : rest;
  };
  return dv(9) === Number(digits[9]) && dv(10) === Number(digits[10]);
}

export function extractCpf(text: string): string | null {
  for (const m of text.matchAll(/\b(\d{3})\.?(\d{3})\.?(\d{3})[-. ]?(\d{2})\b/g)) {
    const digits = m.slice(1).join("");
    if (validCpfDigits(digits)) {
      return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
    }
  }
  return null;
}

export function extractMatricula(text: string): string | null {
  const n = normalize(text);
  const m = n.match(/MATRICULA\s*(?:N[O0]?|NUMERO)?\s*[.: -]?\s*([\d][\d.]{2,14}[\d])/);
  return m ? m[1] : null;
}

// ---------------------------------------------------------------------------
// Dica de nome vinda do nome original do arquivo
// ---------------------------------------------------------------------------

// "Contrato Felipe Galvão - venda.pdf" → "Felipe Galvão". Usada apenas como
// fallback quando o conteúdo não rendeu nome, e somente se o tipo foi
// detectado (senão é mais seguro manter o nome original).
function nameFromFilename(stem: string): string | null {
  const tokens = stem.split(/[\s_\-.,()[\]]+/).filter(Boolean);
  let best: string[] = [];
  let run: string[] = [];
  const flush = () => {
    if (run.length > best.length) best = run;
    run = [];
  };
  for (const token of tokens) {
    const isParticle = NAME_PARTICLES.has(normalize(token));
    const shaped = /^[A-ZÀ-Ü][a-zà-ÿ'’]+$/.test(token) || /^[A-ZÀ-Ü]{3,}$/.test(token);
    if ((isParticle || shaped) && isNameWord(token)) run.push(token);
    else flush();
  }
  flush();
  const candidate = best.join(" ");
  return best.length >= 2 && plausibleName(candidate) ? titleCaseName(candidate) : null;
}

// ---------------------------------------------------------------------------
// Montagem do nome final
// ---------------------------------------------------------------------------

export function getExtension(fileName: string): string {
  const m = fileName.match(/\.[^.]+$/);
  return m ? m[0].toLowerCase() : "";
}

export interface Proposal {
  name: string;
  docType: string;
}

const PERSONAL_DOCS = new Set(["RG", "CNH", "CPF", "Passaporte"]);

export function proposeName(fileName: string, text: string): Proposal {
  const ext = getExtension(fileName);
  const stem = ext ? fileName.slice(0, -ext.length) : fileName;

  const docType = detectDocumentType(text, fileName);
  const personName =
    extractName(text, docType) ??
    (docType !== "Documento" ? nameFromFilename(stem) : null);

  let base: string | null = null;
  if (docType === "Matrícula de Imóvel") {
    const mat = extractMatricula(text);
    base = mat ? `Matrícula ${mat}` : "Matrícula de Imóvel";
  } else if (personName) {
    base = `${docType} - ${personName}`;
  } else if (PERSONAL_DOCS.has(docType)) {
    const cpf = extractCpf(text);
    if (cpf) base = `${docType} - CPF ${cpf}`;
  }

  if (!base && docType !== "Documento") base = docType;

  // Nada confiável: mantém o nome original em vez de propor lixo.
  if (!base) return { name: safeFilename(stem) + ext, docType };

  return { name: safeFilename(base) + ext, docType };
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
