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
      [/IMPOSTO SOBRE (?:A )?TRANSMISSAO/, 4],
      [/INTER-?VIVOS/, 3],
      [/\bITBI\b/, 3],
      [/NUMERO DE GUIA/, 2],
    ],
    filenameHints: [[/\bITBI\b/, 3]],
  },
  {
    // "Valor venal" também aparece como campo em guias de ITBI — só o título
    // da certidão pesa de verdade.
    label: "Certidão de Valor Venal",
    patterns: [
      [/CERTIDAO DE VALOR VENAL/, 5],
      [/VALOR VENAL/, 2],
    ],
    filenameHints: [[/VENAL/, 3]],
  },
  {
    label: "Certidão Negativa de Tributos Imobiliários",
    patterns: [
      [/NEGATIVA DE (DEBITOS DE )?TRIBUTOS/, 5],
      [/TRIBUTOS IMOBILIARIOS/, 4],
    ],
  },
  {
    label: "Certidão Negativa de Débitos Trabalhistas",
    patterns: [
      [/NEGATIVA DE DEBITOS TRABALHISTAS/, 5],
      [/DEBITOS TRABALHISTAS/, 4],
      [/JUSTICA DO TRABALHO/, 2],
    ],
    filenameHints: [[/TRABALHISTA/, 3]],
  },
  {
    label: "Certidão Negativa de Débitos",
    patterns: [
      [/CERTIDAO NEGATIVA DE DEBITOS/, 4],
      [/\bCND\b/, 3],
      [/NADA CONSTA/, 2],
    ],
  },
  {
    label: "Certidão de Distribuição",
    patterns: [
      [/CERTIDAO DE DISTRIBUICAO/, 5],
      [/DISTRIBUIDOR (CIVEL|JUDICIAL|CRIMINAL)/, 3],
    ],
  },
  {
    label: "Certidão de Protesto",
    patterns: [
      [/TABELIAO DE PROTESTO|CERTIDAO DE PROTESTO/, 5],
      [/\bPROTESTOS?\b/, 2],
    ],
  },
  {
    label: "Certidão de Ônus",
    patterns: [[/ONUS E ACOES|CERTIDAO DE ONUS/, 5]],
  },
  {
    label: "Certidão Vintenária",
    patterns: [[/VINTENARIA/, 5]],
    filenameHints: [[/VINTENARIA/, 3]],
  },
  {
    label: "Habite-se",
    patterns: [[/HABITE-?SE/, 5]],
  },
  {
    label: "Comprovante de Pagamento",
    patterns: [
      [/COMPROVANTE DE PAGAMENTO/, 5],
      [/RECIBO DE PAGAMENTO|PAGAMENTO (EFETUADO|REALIZADO)/, 4],
      [/COMPROVANTE DE TRANSFERENCIA|\bPIX\b/, 2],
    ],
    filenameHints: [
      [/PAGAMENTO/, 3],
      [/COMPROVANTE/, 2],
    ],
  },
  {
    label: "Boleto",
    patterns: [
      [/FICHA DE COMPENSACAO/, 5],
      [/LINHA DIGITAVEL/, 4],
      [/LOCAL DE PAGAMENTO/, 3],
      [/AGENCIA\/?CODIGO (DO )?(CEDENTE|BENEFICIARIO)/, 3],
      [/\bBOLETO\b/, 2],
    ],
    filenameHints: [[/BOLETO/, 3]],
  },
  {
    label: "Termo de Quitação",
    patterns: [
      [/TERMO DE QUITACAO/, 5],
      [/(OUTORGA|PLENA|GERAL|RASA).{0,30}QUITACAO/, 3],
      [/QUITACAO/, 2],
    ],
    filenameHints: [[/QUITACAO/, 3]],
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

// Padrões encontrados no "título" (o começo do texto) pesam o dobro: é onde
// documentos declaram o que são — e o que desempata um contrato que menciona
// a matrícula do imóvel lá pela página dois.
const TITLE_ZONE = 600;

function contractSubtype(n: string): string {
  if (/(?:VENDA E COMPRA|COMPRA E VENDA)/.test(n)) return "Contrato de Compra e Venda";
  if (/LOCACAO/.test(n)) return "Contrato de Locação";
  if (/PRESTACAO DE SERVICOS/.test(n)) return "Contrato de Prestação de Serviços";
  if (/HONORARIOS/.test(n)) return "Contrato de Honorários";
  return "Contrato";
}

function refineType(label: string, n: string): string {
  if (label === "Contrato") return contractSubtype(n);
  if (label === "ITBI" && /\bGUIA\b/.test(n)) return "Guia de ITBI";
  if (label === "Escritura" && /(?:VENDA E COMPRA|COMPRA E VENDA)/.test(n)) {
    return "Escritura de Venda e Compra";
  }
  return label;
}

export function detectDocumentType(text: string, fileName = ""): string {
  const n = normalize(text);
  const fn = normalize(fileName);

  let best = "Documento";
  let bestScore = 0;
  for (const rule of DOC_RULES) {
    let score = 0;
    for (const [pattern, weight] of rule.patterns) {
      const m = pattern.exec(n);
      if (m) score += weight * (m.index < TITLE_ZONE ? 2 : 1);
    }
    for (const [pattern, weight] of rule.filenameHints ?? [])
      if (pattern.test(fn)) score += weight;
    if (score > bestScore) {
      bestScore = score;
      best = rule.label;
    }
  }

  if (bestScore < MIN_TYPE_SCORE) return "Documento";
  return refineType(best, n);
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
  "ELETRICA", "AGUA", "FATURA", "CONTA", "TRIBUTOS", "TRIBUTO", "DEBITOS",
  "DEBITO", "NEGATIVA", "POSITIVA", "VENAL", "CONTRIBUINTE", "GUIA",
  "DISTRIBUICAO", "DISTRIBUIDOR", "PROTESTO", "PROTESTOS", "TRABALHISTA",
  "TRABALHISTAS", "JUSTICA", "TRABALHO", "ELETRONICA", "ELETRONICO", "ACOES",
  "PORTAL", "EMITIDA", "EMITIDO", "EXPEDIDA", "EXPEDIDO", "CONSTA", "CONSTAM",
  "AUTENTICIDADE", "VERIFICACAO", "CODIGO", "SELO",
  // fazenda municipal / repartições / cobranças
  "FAZENDA", "PUBLICA", "RECEITA", "ARRECADACAO", "DEPARTAMENTO", "DIVISAO",
  "SECAO", "TECNICA", "CERTIFICAMOS", "COBRANCA", "DESPESAS", "DEMAIS",
  "EMOLUMENTOS", "TAXAS", "MULTAS", "MUNICIPAIS", "IMOBILIARIOS",
  "IMOBILIARIAS", "INSCRICAO", "INSCRICOES", "CADASTRAIS", "CADASTRAL",
  "QUITE", "RESSALVADO", "DIREITO",
  // boleto / banco / pagamento
  "BOLETO", "QUITACAO", "PAGAMENTO", "VENCIMENTO", "BENEFICIARIO", "CEDENTE",
  "SACADO", "PAGADOR", "AGENCIA", "BANCO", "CAIXA", "BRADESCO", "ITAU",
  "SANTANDER", "ECONOMICA", "NUBANK", "SICREDI", "SICOOB", "COMPENSACAO",
  "DIGITAVEL", "CUSTAS", "PARCELA", "EXPRESS",
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
  // Empata por soma de letras, não por contagem: "AMAURI RODRIGUES" ganha de
  // lixo curto de OCR ("TUE EEN") que aparece antes na linha.
  const letters = (arr: string[]) => arr.reduce((acc, w) => acc + w.length, 0);
  let best: string[] = [];
  let run: string[] = [];
  const flush = () => {
    if (letters(run) > letters(best)) best = run;
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
  // Partículas soltas nas pontas ("Jacira Miranda dos") saem.
  const particle = (w: string) => NAME_PARTICLES.has(normalize(w).replace(/['’\-.]/g, ""));
  while (best.length && particle(best[0])) best.shift();
  while (best.length && particle(best[best.length - 1])) best.pop();
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

// Documentos formais qualificam a pessoa logo após o nome: "MANUEL JORGE EIRA
// DA CUSTODIA, português, viúvo, aposentado..." (contratos, escrituras,
// procurações) ou "AMAURI RODRIGUES, nascido aos..." (certidões). Coleta até
// `limit` pessoas físicas distintas, na ordem em que aparecem. Roda sobre o
// texto com espaços colapsados para nomes quebrados em duas linhas não serem
// cortados no meio.
function extractQualifiedNames(text: string, limit: number): string[] {
  const flat = cleanSpaces(text);
  const found: string[] = [];
  const seen = new Set<string>();
  const pattern = /([A-ZÀ-Ü][A-ZÀ-Ü'’\- ]{6,70})\s*,([\s\S]{0,160})/g;
  for (const m of flat.matchAll(pattern)) {
    if (COMPANY_MARKERS.test(normalize(m[1]))) continue;
    if (!PERSON_CONTEXT.test(normalize(m[2]))) continue;
    const run = longestNameRun(m[1]);
    if (!run) continue;
    const key = normalize(run);
    if (seen.has(key)) continue;
    seen.add(key);
    found.push(titleCaseName(run));
    if (found.length >= limit) break;
  }
  return found;
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

const PERSONAL_DOCS = new Set(["RG", "CNH", "CPF", "Passaporte"]);

export function extractName(text: string, docType = ""): string | null {
  const lines = text.split(/\r?\n/).map(cleanSpaces).filter(Boolean);

  if (docType.startsWith("Certidão de Casamento")) {
    const couple = extractCouple(text);
    if (couple) return couple;
    // Layout sem ELE:/ELA:: os cônjuges aparecem qualificados no corpo
    // ("AMAURI RODRIGUES, nascido aos...").
    const spouses = extractQualifiedNames(text, 2);
    if (spouses.length > 0) return spouses.join(" e ");
  }
  if (/^(Contrato|Escritura|Procuração|Termo|Certidão de Nascimento|Certidão de Óbito)/.test(docType)) {
    const [person] = extractQualifiedNames(text, 1);
    if (person) return person;
  }

  const labeled = extractLabeledName(lines);
  if (labeled) return labeled;

  // Em documento pessoal com OCR ruim, a varredura genérica produz lixo com
  // aparência de nome — melhor devolver nada e deixar o fallback do nome do
  // arquivo agir ("RG ANA PAULA.pdf" → "Ana Paula").
  if (PERSONAL_DOCS.has(docType)) return null;

  return extractBestRun(lines);
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

// Conteúdo primeiro; nome do arquivo como fallback ("MATRÍCULA 150.407.pdf"
// resolve mesmo quando o OCR tropeça no carimbo do cartório).
export function extractMatricula(text: string, fileName = ""): string | null {
  for (const source of [normalize(text), normalize(fileName)]) {
    const m = source.match(
      /MATRICULA\s*(?:N[O0]?|NUMERO)?\s*[.: -]?\s*([\d][\d.]{2,14}[\d])/
    );
    if (m) return m[1];
  }
  return null;
}

// Cartório de Registro de Imóveis emissor da matrícula/certidão de
// propriedade, em forma curta ("1º RI de Guarulhos-SP") — o número da
// matrícula só identifica o imóvel DENTRO de um cartório, então o nome do
// arquivo precisa dos dois. Âncoras: "REGISTRO DE IMÓVEIS" + a cidade, que
// vem como "COMARCA DE X" ou "REGISTRO DE IMÓVEIS DE X".
export function extractCartorioRI(text: string): string | null {
  const n = normalize(text).replace(/\s+/g, " ");
  const ri = n.match(
    /(?:(\d{1,2})\s*[ºO°.]?\s*)?(?:OFICIAL(?:IA)?|OFICIO|CARTORIO|SERVICO|REGISTRADOR)?[A-Z,\s]{0,40}?REGISTRO\s+DE\s+IMOVEIS/
  );
  if (!ri) return null;
  const inicio = ri.index ?? 0;
  const trecho = n.slice(inicio, inicio + ri[0].length + 90);
  // A cidade termina onde começa outra coisa: pontuação, número, ou as
  // palavras que tipicamente vêm depois do cabeçalho do cartório.
  const termino =
    /(?=$|\s*[,;.()—–]|\s*\d|\s+(?:MATRICULA|LIVRO|CERTIDAO|CERTIFICO|ESTADO|CEP|COMARCA|RUA|AV\b|AVENIDA))/
      .source;
  const cidadeM =
    trecho.match(
      new RegExp(`COMARCA\\s+DE\\s+([A-Z][A-Z' ]{2,38}?)(?:\\s*[-–/]\\s*([A-Z]{2}))?${termino}`)
    ) ??
    trecho.match(
      new RegExp(
        `IMOVEIS\\s+D[EAO]\\s+(?!TITULOS|DOCUMENTOS|PESSOA)([A-Z][A-Z' ]{2,38}?)(?:\\s*[-–/]\\s*([A-Z]{2}))?${termino}`
      )
    );
  if (!cidadeM) return null;
  const cidade = titleCaseName(cidadeM[1].trim());
  if (!cidade) return null;
  const uf = cidadeM[2] ? `-${cidadeM[2]}` : "";
  const ordinal = ri[1] ? `${Number(ri[1])}º ` : "";
  return `${ordinal}RI de ${cidade}${uf}`;
}

// Nº do contribuinte ou inscrição cadastral (IPTU/valor venal/certidões de
// tributos municipais) — o identificador que resta quando o documento não
// traz nome de pessoa.
export function extractContribuinte(text: string): string | null {
  const m = normalize(text).match(
    /(?:CONTRIBUINTE|INSCRIC(?:AO|OES)(?:\s+CADASTRA(?:L|IS))?)\s*(?:N[O0.]*|NUMERO)?\s*[.:]?\s*([\d][\d.\-/]{4,20}[\d])/
  );
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
  if (best.length === 1) {
    // Uma palavra só serve quando é claramente um prenome ("RG JACIRA.pdf").
    const only = best[0];
    const core = normalize(only).replace(/['’\-.]/g, "");
    return core.length >= 4 && isNameWord(only) ? titleCaseName(only) : null;
  }
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

// Documentos de tributo de imóvel: sem nome de pessoa, o nº do contribuinte
// é o identificador que diferencia um do outro.
const PROPERTY_TAX_DOCS = new Set([
  "IPTU",
  "ITBI",
  "Guia de ITBI",
  "Certidão de Valor Venal",
  "Certidão Negativa de Tributos Imobiliários",
  "Certidão Negativa de Débitos",
]);

export function proposeName(fileName: string, text: string): Proposal {
  const ext = getExtension(fileName);
  const stem = ext ? fileName.slice(0, -ext.length) : fileName;

  const docType = detectDocumentType(text, fileName);
  const personName =
    extractName(text, docType) ??
    (docType !== "Documento" ? nameFromFilename(stem) : null);

  let base: string | null = null;
  if (docType === "Matrícula de Imóvel") {
    const mat = extractMatricula(text, fileName);
    const cartorio = mat ? extractCartorioRI(text) : null;
    base = mat
      ? `Matrícula ${mat}${cartorio ? ` - ${cartorio}` : ""}`
      : "Matrícula de Imóvel";
  } else if (personName) {
    base = `${docType} - ${personName}`;
  } else if (PERSONAL_DOCS.has(docType)) {
    const cpf = extractCpf(text);
    if (cpf) base = `${docType} - CPF ${cpf}`;
  } else if (PROPERTY_TAX_DOCS.has(docType)) {
    const contribuinte = extractContribuinte(text);
    if (contribuinte) base = `${docType} - ${contribuinte}`;
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

// Prefixo sequencial para montar processo: "01 - RG - João.pdf". A largura vem
// do total, então 9 arquivos viram 01..09 e 150 viram 001..150 — assim a ordem
// alfabética da pasta bate com a ordem do processo (sem isso, "10" viria antes
// de "2"). Mínimo de 2 dígitos, que é como se numera papel.
export function withSequence(
  position: number,
  total: number,
  filename: string
): string {
  const width = Math.max(2, String(total).length);
  return `${String(position).padStart(width, "0")} - ${filename}`;
}

// Garante que o nome editado pelo usuário mantenha a extensão do arquivo original.
export function ensureExtension(name: string, originalFileName: string): string {
  const ext = getExtension(originalFileName);
  if (!ext) return name;
  return name.toLowerCase().endsWith(ext) ? name : name + ext;
}
