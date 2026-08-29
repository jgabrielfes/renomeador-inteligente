/**
 * Anonimização — MOTOR PURO, dois passes, SEM LLM (princípio LGPD por
 * construção: nada de dado pessoal sai para serviço externo).
 *
 * Passe 1 (determinístico): CPF, CNPJ, RG, CEP, telefone, e-mail, matrícula
 * de imóvel, protocolo/prenotação, data de nascimento anunciada e endereço.
 * Passe 2 (heurística de nomes): sequências capitalizadas de 2+ palavras que
 * não sejam instituição nem constem da allowlist de PRESERVADOS (oficiais
 * registradores, juízes — dado profissional público, essencial ao modelo).
 *
 * A saída NUNCA devolve o dado original — só o tipo de cada ocorrência.
 * Testes: npx tsx lib/jurimetria/pipeline.test.ts
 */

export interface OcorrenciaAnonimizada {
  tipo:
    | 'CPF'
    | 'CNPJ'
    | 'RG'
    | 'CEP'
    | 'TELEFONE'
    | 'EMAIL'
    | 'MATRICULA'
    | 'PROTOCOLO'
    | 'NASCIMENTO'
    | 'ENDERECO'
    | 'NOME';
}

export interface ResultadoAnonimizacao {
  texto: string;
  ocorrencias: OcorrenciaAnonimizada[];
}

/** Palavras que marcam INSTITUIÇÃO — nomes com elas nunca são anonimizados. */
const MARCAS_INSTITUICAO = [
  'oficial',
  'registro',
  'registros',
  'imóveis',
  'imoveis',
  'cartório',
  'cartorio',
  'tabelião',
  'tabeliao',
  'tabelionato',
  'serventia',
  'vara',
  'juízo',
  'juizo',
  'foro',
  'comarca',
  'corregedoria',
  'justiça',
  'justica',
  'tribunal',
  'ministério',
  'ministerio',
  'público',
  'publico',
  'irib',
  'cnj',
  'cgj',
  'anoreg',
  'prefeitura',
  'municipalidade',
  'secretaria',
  'fazenda',
  'receita',
  'banco',
  'caixa',
  'lei',
  'provimento',
  'código',
  'codigo',
  'normas',
  'serviço',
  'servico',
  'capital',
  'estado',
  'município',
  'municipio',
  'paulo',
  'guarulhos',
  'itaquaquecetuba',
];

/** Títulos que anunciam agente público a PRESERVAR ("o Oficial Fulano…"). */
const TITULOS_PRESERVADOS =
  /\b(oficial[a]?|registrador[a]?|tabeli[ãa]o|tabeli[ãa]|ju[íi]z[a]?|desembargador[a]?|corregedor[a]?|escrevente|promotor[a]?|dr\.?|dra\.?|mm\.?)\s*$/i;

const de = (tipo: OcorrenciaAnonimizada['tipo']) => ({ tipo });

const PASSES_REGEX: { tipo: OcorrenciaAnonimizada['tipo']; re: RegExp; token: string }[] = [
  { tipo: 'CPF', re: /\b\d{3}\.?\d{3}\.?\d{3}[-.]?\d{2}\b/g, token: '[CPF]' },
  { tipo: 'CNPJ', re: /\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}[-.]?\d{2}\b/g, token: '[CNPJ]' },
  {
    tipo: 'RG',
    re: /\b(?:RG|R\.G\.)\s*(?:n[ºo°.]*\s*)?[:.]?\s*[\d.]{5,13}(?:-?[\dXx])?\b/g,
    token: 'RG [RG]',
  },
  {
    tipo: 'MATRICULA',
    re: /\b(?:matr[íi]culas?|mat\.|m\.)\s*(?:n[ºo°.]*\s*)?[:.]?\s*[\d.]{3,10}\b/gi,
    token: 'matrícula [MATRICULA]',
  },
  {
    tipo: 'PROTOCOLO',
    re: /\b(?:protocolos?|prenota[çc][ãa]o|prenotado sob)\s*(?:n[ºo°.]*\s*)?[:.]?\s*[\d.\/-]{3,20}\b/gi,
    token: 'protocolo [PROTOCOLO]',
  },
  {
    tipo: 'NASCIMENTO',
    re: /\b(nascid[oa]s?\s+(?:em|aos)\s+)\d{1,2}[\/.\- ]\w{2,10}[\/.\- ]\d{2,4}/gi,
    token: '$1[NASCIMENTO]',
  },
  { tipo: 'CEP', re: /\b\d{5}-?\d{3}\b/g, token: '[CEP]' },
  {
    tipo: 'TELEFONE',
    re: /(?:\(\d{2}\)\s?|\b\d{2}\s)?\b9?\d{4}[-\s]?\d{4}\b/g,
    token: '[TELEFONE]',
  },
  { tipo: 'EMAIL', re: /\b[\w.+-]+@[\w-]+\.[\w.-]+\b/g, token: '[EMAIL]' },
  {
    tipo: 'ENDERECO',
    re: /\b(?:rua|avenida|av\.|alameda|travessa|estrada|pra[çc]a)\s+[^,;\n]{3,60},?\s*(?:n[ºo°.]*\s*)?\d+[^,;\n]{0,40}/gi,
    token: '[ENDERECO]',
  },
];

const soAscii = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Conectivos aceitos DENTRO de um nome próprio ("Maria de Souza"). */
const CONECTIVOS = new Set(['de', 'da', 'do', 'das', 'dos', 'e']);

export function anonimizar(
  original: string,
  /** Nomes a PRESERVAR (titulares/juízes conhecidos) — dado profissional. */
  preservar: string[] = [],
): ResultadoAnonimizacao {
  const ocorrencias: OcorrenciaAnonimizada[] = [];
  let texto = original;

  for (const p of PASSES_REGEX) {
    texto = texto.replace(p.re, (...args) => {
      ocorrencias.push(de(p.tipo));
      // Passes com grupo de captura preservam o anúncio ("nascido em ").
      return p.token.includes('$1') ? p.token.replace('$1', String(args[1] ?? '')) : p.token;
    });
  }

  // Passe 2 — nomes de pessoa: 2+ palavras Capitalizadas em sequência.
  const preservarNorm = preservar.map(soAscii).filter(Boolean);
  const reNome = /\b([A-ZÁÀÂÃÉÊÍÓÔÕÚÇ][a-záàâãéêíóôõúç]+(?:\s+(?:[A-ZÁÀÂÃÉÊÍÓÔÕÚÇ][a-záàâãéêíóôõúç]+|de|da|do|das|dos|e)){1,6})\b/g;
  texto = texto.replace(reNome, (trecho, _g, indice: number) => {
    const palavras = trecho.split(/\s+/);
    // Só conectivo no meio não fecha nome ("Maria e" — corta a cauda).
    while (palavras.length > 1 && CONECTIVOS.has(palavras[palavras.length - 1].toLowerCase()))
      palavras.pop();
    if (palavras.length < 2) return trecho;
    const candidato = palavras.join(' ');
    const norm = soAscii(candidato);
    // Instituições ficam.
    if (norm.split(/\s+/).some((p) => MARCAS_INSTITUICAO.includes(p))) return trecho;
    // Allowlist de profissionais públicos fica.
    if (preservarNorm.some((n) => n.includes(norm) || norm.includes(n))) return trecho;
    // Título de agente público DENTRO do match ("Juíza Ana…") ou logo antes
    // ("a Oficiala Ana Souza") preserva — dado profissional público.
    if (
      /^(oficial|oficiala|registrador|registradora|tabeliao|tabelia|juiz|juiza|desembargador|desembargadora|corregedor|corregedora|escrevente|promotor|promotora|doutor|doutora)$/.test(
        soAscii(palavras[0]),
      )
    )
      return trecho;
    const antes = texto.slice(Math.max(0, indice - 30), indice);
    if (TITULOS_PRESERVADOS.test(antes)) return trecho;
    ocorrencias.push(de('NOME'));
    const cauda = trecho.slice(candidato.length);
    return `[NOME]${cauda}`;
  });

  return { texto, ocorrencias };
}
