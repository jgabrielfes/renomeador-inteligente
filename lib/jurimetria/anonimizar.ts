/**
 * Anonimização — MOTOR PURO, dois passes, SEM LLM (princípio LGPD por
 * construção: nada de dado pessoal sai para serviço externo).
 *
 * Passe 1 (determinístico): CPF, CNPJ, RG, CEP, telefone, e-mail, matrícula
 * de imóvel, protocolo/prenotação, data de nascimento anunciada e endereço.
 * Passe 2 (heurística de nomes): sequências capitalizadas de 2+ palavras que
 * não sejam instituição nem constem da allowlist de PRESERVADOS (oficiais
 * registradores, juízes — dado profissional público, essencial ao modelo);
 * o passe 2b cobre nomes em CAIXA ALTA, como as sentenças escrevem as
 * partes. Nome de pessoa vira INICIAIS ("L.S.S." — decisão do escritório,
 * 2026-08-30): acompanhável sem identificar.
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

/**
 * Palavras que as sentenças escrevem em CAIXA ALTA sem serem nome de pessoa —
 * separam as corridas do passe 2b (comparação sempre via soAscii).
 */
const GRITOS_JURIDICOS = new Set([
  'sentenca', 'vistos', 'julgo', 'procedente', 'improcedente', 'parcialmente',
  'dispositivo', 'relatorio', 'fundamentacao', 'conclusao', 'decisao',
  'publique', 'registre', 'intime', 'intimem', 'cumpra', 'transitada',
  'transito', 'julgado', 'julgada', 'deferido', 'indeferido', 'defiro',
  'indefiro', 'mantida', 'afastada', 'exigencia', 'exigencias', 'apresentar',
  'poder', 'judiciario', 'sao', 'paulo', 'brasil', 'central', 'publicos',
  'duvida', 'processo', 'digital', 'classe', 'assunto', 'assuntos',
  'requerente', 'requerido', 'requerida', 'autor', 'autora', 'reu', 're',
  'interessado', 'interessada', 'interessados', 'suscitante', 'suscitado',
  'suscitada', 'espolio', 'ltda', 'eireli', 'epp', 'sa', 's', 'me',
  'nota', 'devolucao', 'devolutiva', 'titulo', 'escritura', 'publica',
  'publico', 'inventario', 'partilha', 'arrolamento', 'formal', 'traslado',
  'certidao', 'certidoes', 'edital', 'oficio', 'prenotado', 'prenotada',
  'custas', 'emolumentos', 'doacao', 'compra', 'venda', 'cessao', 'direitos',
  'hereditarios', 'uniao', 'estavel', 'casamento', 'divorcio', 'obito',
  'herdeiro', 'herdeiros', 'meacao', 'conjuge', 'inventariante',
  'adjudicacao', 'compulsoria', 'usucapiao', 'extrajudicial', 'retificacao',
  'area', 'imovel', 'matricula', 'transcricao', 'averbacao', 'prenotacao',
  'alienacao', 'fiduciaria', 'incorporacao', 'imobiliaria', 'desmembramento',
  'englobamento', 'unificacao', 'condominio', 'loteamento',
  'cpf', 'cnpj', 'rg', 'oab', 'cnj', 'cjpg', 'tjsp', 'vrp', 'itcmd',
]);

/** Conectivos aceitos DENTRO de um nome próprio ("Maria de Souza"). */
const CONECTIVOS = new Set(['de', 'da', 'do', 'das', 'dos', 'e']);

/**
 * Nome de pessoa vira INICIAIS (pedido do escritório): "Lucineia da Silva
 * Santos" → "L.S.S." — legível para acompanhar a decisão, sem identificar.
 */
const iniciaisDe = (palavras: string[]): string =>
  palavras
    .filter((w) => !CONECTIVOS.has(w.toLowerCase()))
    .map((w) => `${w[0]!.toUpperCase()}.`)
    .join('');

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
    return `${iniciaisDe(palavras)}${cauda}`;
  });

  // Passe 2b — nomes em CAIXA ALTA ("LUCINÉIA DE CÁSSIA GARCIA FILGUEIRAS"),
  // como as sentenças escrevem as partes. A sequência pode vir colada a
  // gritos jurídicos ("SENTENÇA FULANO DE TAL") — os gritos separam corridas
  // e cada corrida com 2+ palavras substantivas vira [NOME].
  const reNomeCaps =
    /\b([A-ZÁÀÂÃÉÊÍÓÔÕÚÇ]{2,}(?:\s+(?:[A-ZÁÀÂÃÉÊÍÓÔÕÚÇ]{2,}|DE|DA|DO|DAS|DOS|E)){1,7})\b/g;
  texto = texto.replace(reNomeCaps, (trecho: string, _g: string, indice: number) => {
    const antes = texto.slice(Math.max(0, indice - 30), indice);
    if (TITULOS_PRESERVADOS.test(antes)) return trecho; // "Dr. APARECIDO…" — juiz
    const ehConectivo = (w: string) => CONECTIVOS.has(w.toLowerCase());
    const ehGrito = (w: string) => {
      const n = soAscii(w);
      return MARCAS_INSTITUICAO.includes(n) || GRITOS_JURIDICOS.has(n);
    };
    const saida: string[] = [];
    let corrida: string[] = [];
    const despejar = () => {
      const cauda: string[] = [];
      while (corrida.length > 0 && ehConectivo(corrida[corrida.length - 1]))
        cauda.unshift(corrida.pop()!);
      const substantivas = corrida.filter((w) => !ehConectivo(w));
      const norm = soAscii(corrida.join(' '));
      if (
        substantivas.length >= 2 &&
        !preservarNorm.some((n) => n.includes(norm) || norm.includes(n))
      ) {
        ocorrencias.push(de('NOME'));
        saida.push(iniciaisDe(corrida));
      } else {
        saida.push(...corrida);
      }
      saida.push(...cauda);
      corrida = [];
    };
    for (const w of trecho.split(/\s+/)) {
      if (ehGrito(w)) {
        despejar();
        saida.push(w);
      } else {
        corrida.push(w);
      }
    }
    despejar();
    return saida.join(' ');
  });

  return { texto, ocorrencias };
}
