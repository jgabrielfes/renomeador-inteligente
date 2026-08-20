// Leitura do cofre do Sucessorista: o Gemini lê os documentos da pasta do caso
// (certidão de óbito, certidão de casamento, RG/CPF, matrículas, extratos…) e
// devolve os campos da folha de trabalho já estruturados + a classificação de
// cada arquivo no catálogo do processo. Reusa a cadeia de modelos e o desenho
// de segurança do renomeador (lib/gemini.ts): a chave vive só no servidor e
// documento nenhum sai da máquina fora da rota interna /api/sucessorista.
//
// Regra de honestidade da extração: campo sem base clara no documento volta
// null — a folha continua em branco para o advogado preencher, nunca chutada.

import { AI_MIME_TYPES, GeminiError, geminiJson } from "./gemini";
import { getExtension } from "./renamer";
import { CATALOGO_DOCUMENTOS } from "./partilha/documentos";
import type { SociedadeExtraida } from "./partilha/sociedade";

export interface ArquivoCofre {
  fileName: string;
  data: ArrayBuffer;
}

export type RegimeExtraido =
  | "COMUNHAO_PARCIAL"
  | "COMUNHAO_UNIVERSAL"
  | "SEPARACAO_CONVENCIONAL"
  | "SEPARACAO_OBRIGATORIA";

export type TipoBemExtraido = "IMOVEL" | "VEICULO" | "FINANCEIRO" | "QUOTAS" | "OUTRO";

/**
 * Qualificação completa de uma parte — espelha a ficha da folha (Qualificacao
 * de lib/partilha/familia), campo a campo, para a mesclagem preencher TUDO o
 * que a planilha do escritório trouxer e deixar em branco só o que faltar.
 */
export interface QualificacaoExtraida {
  nacionalidade: string | null;
  rg: string | null;
  cpf: string | null;
  dataNascimento: string | null;
  filiacao: string | null;
  profissao: string | null;
  estadoCivil: string | null;
  email: string | null;
  endereco: string | null;
  complemento: string | null;
  bairro: string | null;
  cidade: string | null;
  uf: string | null;
  cep: string | null;
  conjugeNome: string | null;
  conjugeNacionalidade: string | null;
  conjugeRg: string | null;
  conjugeCpf: string | null;
  conjugeDataNascimento: string | null;
  conjugeFiliacao: string | null;
  conjugeProfissao: string | null;
  conjugeEmail: string | null;
  casamentoData: string | null;
  casamentoRegime: string | null;
  casamentoCertidao: string | null;
}

/** Dados da matrícula/certidões de valor venal, por imóvel. */
export interface ImovelExtraido {
  descricaoMatricula: string | null;
  aquisicao: string | null;
  /** COMO os proprietários constam no registro aquisitivo (nome + estado
   *  civil, ex.: "João da Silva, solteiro") — antecipador registral. */
  proprietariosMatricula: string | null;
  matricula: string | null;
  registroImoveis: string | null;
  municipio: string | null;
  inscricaoCadastral: string | null;
  /** Fração ideal (%) atribuída à inscrição na certidão de valor venal. */
  fracaoIdeal: string | null;
  valorVenalObito: string | null;
  exercicioObito: string | null;
  valorVenalAtual: string | null;
  exercicioAtual: string | null;
}

/** Dados do ativo financeiro (extrato na data do óbito) — campos da
 *  declaração do ITCMD-SP: instituição, agência e conta. */
export interface FinanceiroExtraido {
  instituicao: string | null;
  agencia: string | null;
  conta: string | null;
}

/** Dados do CRLV, por veículo. */
export interface VeiculoExtraido {
  marcaModelo: string | null;
  anoFabricacao: string | null;
  anoModelo: string | null;
  renavam: string | null;
  placa: string | null;
  chassi: string | null;
}

/**
 * Certidão do REGISTRO CIVIL lida no lote (nascimento/casamento/óbito), com
 * os fatos que o conferidor de qualificação cruzada usa: averbações, regime,
 * pacto e datas. Apoio, nunca verdade — a folha alerta e o advogado confere.
 */
export interface CertidaoCivilExtraida {
  tipo: "NASCIMENTO" | "CASAMENTO" | "OBITO";
  /** Titular da certidão (no casamento, um dos nubentes). */
  pessoa: string;
  conjuge: string | null;
  dataCasamento: string | null;
  /** Regime de bens como consta na certidão. */
  regime: string | null;
  pactoAntenupcial: boolean | null;
  averbacaoDivorcio: boolean | null;
  averbacaoObitoConjuge: boolean | null;
  dataNascimento: string | null;
  dataObito: string | null;
}

export interface CasoExtraido {
  falecido: {
    nome: string | null;
    cpf: string | null;
    dataObito: string | null;
    dataCasamento: string | null;
    ultimoDomicilio: string | null;
    /** Onde ocorreu o falecimento (hospital, cidade/UF). */
    localFalecimento: string | null;
    /** Certidão de óbito: "matrícula nº …, expedida pelo ORCPN …". */
    certidaoObito: string | null;
    /** Certidão de casamento do falecido: "matrícula nº …, ORCPN …". */
    certidaoCasamento: string | null;
    /** RG, nascimento, filiação etc. — a certidão de óbito costuma trazer. */
    qualificacao: QualificacaoExtraida | null;
  };
  sobrevivente: {
    existe: boolean | null;
    nome: string | null;
    vinculo: "CASAMENTO" | "UNIAO_ESTAVEL" | null;
    regime: RegimeExtraido | null;
    /** Qualificação do(a) supérstite (coluna "VIÚVO(A)" das planilhas). */
    qualificacao: QualificacaoExtraida | null;
  };
  herdeiros: Array<{
    nome: string;
    filhoDoSobrevivente: boolean | null;
    /** Qualificação quando constar (planilha do escritório, minutas): apoio, nunca verdade. */
    qualificacao: QualificacaoExtraida | null;
  }>;
  bens: Array<{
    descricao: string;
    tipo: TipoBemExtraido | null;
    valor: string | null;
    natureza: "COMUM" | "PARTICULAR" | null;
    imovel: ImovelExtraido | null;
    veiculo: VeiculoExtraido | null;
    financeiro: FinanceiroExtraido | null;
  }>;
  /**
   * Pessoas jurídicas documentadas (contrato social/alteração + balanço).
   * O VALOR das quotas não vem daqui — o motor calcula com max(PL, capital)
   * × percentual do falecido/casal conforme o regime (lib/partilha/sociedade).
   */
  sociedades: SociedadeExtraida[];
  /**
   * Outras pessoas com certidão de óbito no lote (além do autor da herança):
   * herdeiro pré-morto ou segunda sucessão — a folha alerta e marca.
   */
  outrosFalecidos: Array<{ nome: string; dataObito: string | null }>;
  /** Filhos/herdeiros DECLARADOS na certidão de óbito ("deixa filhos…"). */
  herdeirosNoObito: string[];
  /** Certidões do registro civil lidas (conferidor de qualificação cruzada). */
  certidoesCivis: CertidaoCivilExtraida[];
  /** Um por arquivo enviado, alinhado por índice (1-based). */
  arquivos: Array<{
    indice: number;
    tipoDetectado: string | null;
    /** id do CATALOGO_DOCUMENTOS em que o arquivo se encaixa (ou null). */
    documentoId: string | null;
  }>;
}

const IDS_CATALOGO = CATALOGO_DOCUMENTOS.map((d) => d.id);

const texto = { type: "string", nullable: true } as const;

/** Schema da qualificação — os MESMOS campos da ficha da folha. */
const QUALI_PROPS = {
  nacionalidade: texto,
  rg: texto,
  cpf: texto,
  dataNascimento: texto,
  filiacao: texto,
  profissao: texto,
  estadoCivil: texto,
  email: texto,
  endereco: texto,
  complemento: texto,
  bairro: texto,
  cidade: texto,
  uf: texto,
  cep: texto,
  conjugeNome: texto,
  conjugeNacionalidade: texto,
  conjugeRg: texto,
  conjugeCpf: texto,
  conjugeDataNascimento: texto,
  conjugeFiliacao: texto,
  conjugeProfissao: texto,
  conjugeEmail: texto,
  casamentoData: texto,
  casamentoRegime: texto,
  casamentoCertidao: texto,
} as const;

const IMOVEL_PROPS = {
  fracaoIdeal: texto,
  descricaoMatricula: texto,
  aquisicao: texto,
  proprietariosMatricula: texto,
  matricula: texto,
  registroImoveis: texto,
  municipio: texto,
  inscricaoCadastral: texto,
  valorVenalObito: texto,
  exercicioObito: texto,
  valorVenalAtual: texto,
  exercicioAtual: texto,
} as const;

const FINANCEIRO_PROPS = {
  instituicao: texto,
  agencia: texto,
  conta: texto,
} as const;

const VEICULO_PROPS = {
  marcaModelo: texto,
  anoFabricacao: texto,
  anoModelo: texto,
  renavam: texto,
  placa: texto,
  chassi: texto,
} as const;

const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    falecido: {
      type: "object",
      properties: {
        nome: texto,
        cpf: texto,
        dataObito: texto,
        dataCasamento: texto,
        ultimoDomicilio: texto,
        localFalecimento: texto,
        certidaoObito: texto,
        certidaoCasamento: texto,
        qualificacao: { type: "object", nullable: true, properties: QUALI_PROPS },
      },
    },
    sobrevivente: {
      type: "object",
      properties: {
        existe: { type: "boolean", nullable: true },
        nome: texto,
        vinculo: { type: "string", enum: ["CASAMENTO", "UNIAO_ESTAVEL"], nullable: true },
        regime: {
          type: "string",
          enum: [
            "COMUNHAO_PARCIAL",
            "COMUNHAO_UNIVERSAL",
            "SEPARACAO_CONVENCIONAL",
            "SEPARACAO_OBRIGATORIA",
          ],
          nullable: true,
        },
        qualificacao: { type: "object", nullable: true, properties: QUALI_PROPS },
      },
    },
    herdeiros: {
      type: "array",
      items: {
        type: "object",
        properties: {
          nome: { type: "string" },
          filhoDoSobrevivente: { type: "boolean", nullable: true },
          qualificacao: { type: "object", nullable: true, properties: QUALI_PROPS },
        },
        required: ["nome"],
      },
    },
    bens: {
      type: "array",
      items: {
        type: "object",
        properties: {
          descricao: { type: "string" },
          tipo: {
            type: "string",
            enum: ["IMOVEL", "VEICULO", "FINANCEIRO", "QUOTAS", "OUTRO"],
            nullable: true,
          },
          valor: texto,
          natureza: { type: "string", enum: ["COMUM", "PARTICULAR"], nullable: true },
          imovel: { type: "object", nullable: true, properties: IMOVEL_PROPS },
          veiculo: { type: "object", nullable: true, properties: VEICULO_PROPS },
          financeiro: { type: "object", nullable: true, properties: FINANCEIRO_PROPS },
        },
        required: ["descricao"],
      },
    },
    sociedades: {
      type: "array",
      items: {
        type: "object",
        properties: {
          empresa: { type: "string" },
          cnpj: texto,
          capitalSocial: texto,
          patrimonioLiquido: texto,
          socios: {
            type: "array",
            items: {
              type: "object",
              properties: {
                nome: { type: "string" },
                percentual: { type: "number", nullable: true },
              },
              required: ["nome"],
            },
          },
        },
        required: ["empresa", "socios"],
      },
    },
    herdeirosNoObito: { type: "array", items: { type: "string" } },
    certidoesCivis: {
      type: "array",
      items: {
        type: "object",
        properties: {
          tipo: { type: "string", enum: ["NASCIMENTO", "CASAMENTO", "OBITO"] },
          pessoa: { type: "string" },
          conjuge: texto,
          dataCasamento: texto,
          regime: texto,
          pactoAntenupcial: { type: "boolean", nullable: true },
          averbacaoDivorcio: { type: "boolean", nullable: true },
          averbacaoObitoConjuge: { type: "boolean", nullable: true },
          dataNascimento: texto,
          dataObito: texto,
        },
        required: ["tipo", "pessoa"],
      },
    },
    outrosFalecidos: {
      type: "array",
      items: {
        type: "object",
        properties: {
          nome: { type: "string" },
          dataObito: texto,
        },
        required: ["nome"],
      },
    },
    arquivos: {
      type: "array",
      items: {
        type: "object",
        properties: {
          indice: { type: "integer" },
          tipoDetectado: texto,
          documentoId: { type: "string", enum: IDS_CATALOGO, nullable: true },
        },
        required: ["indice"],
      },
    },
  },
  required: ["falecido", "sobrevivente", "herdeiros", "bens", "sociedades", "outrosFalecidos", "herdeirosNoObito", "certidoesCivis", "arquivos"],
} as const;

function prompt(total: number): string {
  const catalogo = CATALOGO_DOCUMENTOS.map((d) => `- ${d.id}: ${d.titulo}`).join("\n");
  return `Você é assistente de um escritório de direito sucessório no Brasil. Acima estão ${total} documento(s) da pasta de um inventário, cada um precedido de "DOCUMENTO n".

Extraia APENAS o que constar dos documentos, para preencher a folha de trabalho do inventário:

1. falecido — REGRA CRÍTICA: identifique primeiro a CERTIDÃO DE ÓBITO entre os documentos; o(a) falecido(a) é EXCLUSIVAMENTE a pessoa declarada morta nela (nome, CPF no formato 000.000.000-00, dataObito em YYYY-MM-DD, ultimoDomicilio como "Cidade/UF"). Preencha também falecido.qualificacao com o que os documentos trouxerem do(a) PRÓPRIO(A) falecido(a): nacionalidade, RG, data de nascimento, filiação (a certidão de óbito costuma trazer), profissão, endereço completo — a escritura qualifica o "de cujus" com esses dados. ESTADO CIVIL do(a) falecido(a) (crítico): use o campo "Estado civil" da CERTIDÃO DE ÓBITO — é o estado NA DATA DA MORTE; a certidão de CASAMENTO qualifica os nubentes como "solteiros" À ÉPOCA DO ATO, e esse "solteiro" é o estado ANTERIOR ao casamento — NUNCA o use como estado civil do(a) falecido(a): havendo certidão de casamento dele(a) no lote sem averbação de divórcio, o estado civil é casado(a). Preencha também: localFalecimento (hospital/cidade onde ocorreu o óbito), certidaoObito (ex.: "matrícula nº 1234…, expedida pelo ORCPN do 1º Subdistrito — Cidade/UF") e certidaoCasamento (mesmo formato, da certidão de casamento do falecido). NUNCA aponte como falecido: o(a) declarante da certidão de óbito, o(a) titular de CNH/RG/CPF/comprovantes (na pasta de um inventário esses documentos são normalmente do CÔNJUGE SOBREVIVENTE ou de herdeiros), nem uma das partes da certidão de casamento isoladamente. Documento mais legível NÃO significa pessoa falecida. Sem certidão de óbito legível no lote, deixe falecido.nome = null — não deduza pelo nome dos arquivos nem por quem aparece mais. dataCasamento (YYYY-MM-DD) sai da certidão de casamento. HAVENDO MAIS DE UMA certidão de óbito no lote: o(a) autor(a) da herança é quem o conjunto aponta (a certidão mais recente ou a coerente com casamento/herdeiros); as DEMAIS pessoas falecidas entram em outrosFalecidos (nome + dataObito) — típico de herdeiro pré-morto ou de dupla sucessão (os dois pais).
2. sobrevivente — existe = true se os documentos indicarem cônjuge ou companheiro(a) vivo(a) na data do óbito (false apenas com indicação clara em contrário, ex.: certidão de óbito dizendo viúvo/divorciado sem união posterior). O(a) sobrevivente é o cônjuge da certidão de casamento que NÃO é o(a) falecido(a) — tipicamente o(a) declarante do óbito e o(a) titular dos documentos pessoais da pasta. vinculo e regime saem da certidão de casamento ou escritura de união estável (regime: atenção à data do casamento — antes de 1977 o regime legal era a comunhão universal). Quando houver planilha/minuta de qualificação (a coluna "VIÚVO(A)"/"CÔNJUGE SUPÉRSTITE"), preencha sobrevivente.qualificacao com TODOS os campos que constarem.
3. herdeiros — SOMENTE pessoas que os documentos apontem como filhos(as) do falecido (certidão de óbito costuma listar; certidões de nascimento provam). Preencha TAMBÉM herdeirosNoObito: os filhos/herdeiros DECLARADOS na própria certidão de óbito (campo \"deixa filhos\"), exatamente como constarem — mesmo os que não tiverem nenhum outro documento no lote (é o que permite alertar documentação faltante). REGRAS DE UNICIDADE (críticas): cada pessoa aparece UMA ÚNICA VEZ, sempre com o nome MAIS COMPLETO que os documentos trouxerem — "Renata" e "Renata Pummer Carvalho Lavruhin" são a MESMA pessoa (una os registros; diferenças de acento como "Márcio"/"Marcio" também são a mesma pessoa); NUNCA inclua na lista o(a) falecido(a) nem o(a) cônjuge/companheiro(a) sobrevivente (o viúvo NÃO é herdeiro aqui — ele já está no item 2); NUNCA inclua o cônjuge de herdeiro como herdeiro (ele entra na qualificacao do herdeiro, campos conjuge*). filhoDoSobrevivente = true quando a filiação indicar que também é filho(a) do(a) sobrevivente; null em dúvida. PLANILHAS DE QUALIFICAÇÃO do escritório costumam ter uma COLUNA por pessoa (AUTOR(A) DA HERANÇA, VIÚVO(A), Herdeiro 1, 2, 3…) e uma LINHA por campo (NOME, RG, CPF, DATA DE NASCIMENTO, FILIAÇÃO, ESTADO CIVIL, PROFISSÃO, E-MAIL, ENDEREÇO, COMPLEMENTO, BAIRRO, CIDADE, ESTADO/UF, CEP e o bloco CÔNJUGE do herdeiro casado) — extraia TUDO o que constar para a qualificacao de cada pessoa (dataNascimento em YYYY-MM-DD; CPF como 000.000.000-00; uf com 2 letras; campo ausente = null; sem qualquer dado, qualificacao = null). Deixe em branco (null) apenas o que realmente não estiver nos documentos.
4. bens — um por bem identificado (matrícula de imóvel, CRLV, extrato). descricao curta e útil (ex.: "Apartamento — matrícula 12.345 do 1º RI de Guarulhos/SP"); valor numérico em reais com ponto decimal (ex.: "620000.00") apenas se o documento trouxer valor; natureza COMUM/PARTICULAR (crítica — decide MEAÇÃO, partilha e orçamento): DECIDA cruzando o REGISTRO AQUISITIVO da matrícula com a certidão de casamento — no regime da comunhão PARCIAL, bem adquirido ANTES do casamento (o[a] falecido[a] constando SOLTEIRO[A] no registro aquisitivo, ou a data do registro anterior à do casamento) é PARTICULAR, assim como herança/doação recebida a qualquer tempo; adquirido onerosamente NA CONSTÂNCIA do casamento é COMUM. Na comunhão UNIVERSAL, tudo é COMUM (salvo cláusula de incomunicabilidade). Na separação de bens, PARTICULAR. Sem elementos para decidir, deixe null. Para IMÓVEL, extraia da MATRÍCULA e das CERTIDÕES DE VALOR VENAL o bloco imovel: descricaoMatricula = a DESCRIÇÃO COMPLETA do imóvel tal como consta na matrícula (tipo, endereço, área, confrontações), já incorporando as averbações que alterem a especialidade objetiva (área construída, numeração, retificações) — transcreva fielmente; aquisicao = o registro/averbação pelo qual o(a) falecido(a) adquiriu (ex.: "R.4"), proprietariosMatricula = COMO o(s) proprietário(s) constam no registro aquisitivo — nome e estado civil exatamente como escritos (ex.: "João da Silva, solteiro" ou "João da Silva, casado pelo regime da comunhão parcial com Maria da Silva"), matricula, registroImoveis (ex.: "1º Registro de Imóveis de Guarulhos/SP"), municipio, inscricaoCadastral (nº do contribuinte/inscrição municipal), valorVenalObito + exercicioObito (certidão do exercício do óbito) e valorVenalAtual + exercicioAtual (certidão do exercício corrente) — valores em reais com ponto decimal; fracaoIdeal = a FRAÇÃO IDEAL (%) que a certidão de valor venal atribuir à inscrição, como número decimal em texto (ex.: \"50.00\" para 50%; \"100.00\" quando integral). Para VEÍCULO, extraia do CRLV (ou da própria descrição, quando constar) o bloco veiculo: marcaModelo, anoFabricacao, anoModelo, renavam, placa, chassi. Para ATIVO FINANCEIRO (extrato bancário, poupança, aplicação), extraia o bloco financeiro: instituicao (nome da instituição financeira como consta no extrato, ex.: "Banco do Brasil S.A."), agencia (com dígito, ex.: "1234-5") e conta (com dígito, ex.: "45.678-9") — são os campos da declaração do ITCMD-SP; o valor do bem é o SALDO NA DATA DO ÓBITO quando o extrato mostrar. ATENÇÃO: alguns municípios lançam UM MESMO imóvel em MAIS DE UMA inscrição municipal (ex.: 084.33.20.0048.01.000 e 084.33.20.0048.02.000 — a base é igual, muda só a sub-inscrição): lance UM bem só, SOMANDO os valores venais das inscrições e listando todas em inscricaoCadastral. REGRA DE IDENTIDADE DO IMÓVEL (crítica): o imóvel é identificado pela MATRÍCULA (número + Registro de Imóveis), NUNCA pelo IPTU/inscrição municipal — certidões de VALOR VENAL do mesmo imóvel em EXERCÍCIOS DIFERENTES são rotina e NÃO são dois bens: lance UM bem só, com a certidão do exercício do óbito preenchendo valorVenalObito/exercicioObito e a do exercício corrente preenchendo valorVenalAtual/exercicioAtual; case cada certidão de venal com a matrícula correspondente pelo endereço/inscrição municipal, e só lance um imóvel SEM matrícula quando nenhuma matrícula do lote corresponder a ele. TITULARIDADE (crítica): confira o registro aquisitivo da matrícula contra a CERTIDÃO DE ÓBITO — localize o(a) falecido(a) (ou o cônjuge, no bem comum) entre os proprietários; aquisicao = o R./Av. pelo qual O(A) FALECIDO(A) adquiriu o imóvel (não o último registro qualquer — pode haver registros posteriores de outros titulares); se o(a) falecido(a) NÃO constar entre os proprietários, ainda assim emita o bem com proprietariosMatricula fiel ao registro — o sistema alerta a divergência para o advogado conferir. NÃO lance participação societária (quotas/ações) em bens — ela entra em "sociedades" e o sistema calcula o valor.
5. sociedades — uma por pessoa jurídica documentada. Do CONTRATO SOCIAL (ou última alteração/consolidação): empresa (razão social), cnpj, capitalSocial em reais com ponto decimal, e socios = TODOS os sócios do quadro societário com o percentual de cada um no capital (0 a 100; calcule pela proporção das quotas se o documento só trouxer quantidades — ex.: 50.000 de 100.000 quotas = 50). Do BALANÇO PATRIMONIAL: patrimonioLiquido em reais com ponto decimal (o total do grupo "Patrimônio Líquido"). Emita a sociedade mesmo que só um dos dois documentos esteja no lote — campos ausentes ficam null. NÃO calcule o valor das quotas.
6. certidoesCivis — uma entrada por CERTIDÃO DO REGISTRO CIVIL no lote (nascimento, casamento ou óbito), com os FATOS que o conferidor de qualificação usa: tipo; pessoa (titular — no casamento, o primeiro nubente); conjuge (o outro nubente); dataCasamento (YYYY-MM-DD); regime = o regime de bens COMO ESCRITO na certidão; pactoAntenupcial = true se a certidão mencionar pacto antenupcial (escritura/registro); averbacaoDivorcio = true se houver AVERBAÇÃO de divórcio/separação; averbacaoObitoConjuge = true se houver averbação de óbito de um dos cônjuges; dataNascimento (certidão de nascimento); dataObito (certidão de óbito). Averbações aparecem no verso/campo "AVERBAÇÕES" — leia com atenção; ausência clara = false, ilegível = null.
7. arquivos — para CADA documento (indice 1 a ${total}): tipoDetectado (rótulo curto, ex.: "Certidão de Óbito") e documentoId = o id do catálogo abaixo em que o arquivo deve ser arquivado (null se nenhum servir). Documentos pessoais (RG/CNH/CPF/comprovante de endereço) classificam-se pelo DONO: do(a) falecido(a) → docs-falecido; do cônjuge/companheiro(a) sobrevivente → docs-sobrevivente; de herdeiro ou cônjuge de herdeiro → docs-herdeiros.

Catálogo do processo:
${catalogo}

REGRAS: não invente nada — campo sem base clara volta null (ou lista vazia); não deduza herdeiros de sobrenomes; datas sempre YYYY-MM-DD; responda apenas o JSON.`;
}

function limpar(v: unknown, max = 160): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim().slice(0, max);
  return t || null;
}

function dataIso(v: unknown): string | null {
  const t = limpar(v, 10);
  return t && /^\d{4}-\d{2}-\d{2}$/.test(t) ? t : null;
}

function valorDecimal(v: unknown): string | null {
  if (typeof v !== "string" && typeof v !== "number") return null;
  const n = Number(String(v).replace(/[^\d.]/g, ""));
  return Number.isFinite(n) && n > 0 ? n.toFixed(2) : null;
}

function umDe<T extends string>(v: unknown, opcoes: readonly T[]): T | null {
  return typeof v === "string" && (opcoes as readonly string[]).includes(v) ? (v as T) : null;
}

/** Sanitiza a qualificação de uma parte; devolve null quando não há nada. */
function sanitizarQualificacao(q: unknown): QualificacaoExtraida | null {
  if (!q || typeof q !== "object") return null;
  const o = q as Record<string, unknown>;
  const saida: QualificacaoExtraida = {
    nacionalidade: limpar(o.nacionalidade, 40),
    rg: limpar(o.rg, 30),
    cpf: limpar(o.cpf, 14),
    dataNascimento: dataIso(o.dataNascimento),
    filiacao: limpar(o.filiacao, 160),
    profissao: limpar(o.profissao, 60),
    estadoCivil: limpar(o.estadoCivil, 40),
    email: limpar(o.email, 120),
    endereco: limpar(o.endereco, 160),
    complemento: limpar(o.complemento, 60),
    bairro: limpar(o.bairro, 60),
    cidade: limpar(o.cidade, 60),
    uf: limpar(o.uf, 2),
    cep: limpar(o.cep, 10),
    conjugeNome: limpar(o.conjugeNome, 120),
    conjugeNacionalidade: limpar(o.conjugeNacionalidade, 40),
    conjugeRg: limpar(o.conjugeRg, 30),
    conjugeCpf: limpar(o.conjugeCpf, 14),
    conjugeDataNascimento: dataIso(o.conjugeDataNascimento),
    conjugeFiliacao: limpar(o.conjugeFiliacao, 160),
    conjugeProfissao: limpar(o.conjugeProfissao, 60),
    conjugeEmail: limpar(o.conjugeEmail, 120),
    casamentoData: dataIso(o.casamentoData),
    casamentoRegime: limpar(o.casamentoRegime, 60),
    casamentoCertidao: limpar(o.casamentoCertidao, 160),
  };
  return Object.values(saida).some((v) => v !== null) ? saida : null;
}

function sanitizarImovel(q: unknown): ImovelExtraido | null {
  if (!q || typeof q !== "object") return null;
  const o = q as Record<string, unknown>;
  const saida: ImovelExtraido = {
    descricaoMatricula: limpar(o.descricaoMatricula, 2000),
    aquisicao: limpar(o.aquisicao, 60),
    proprietariosMatricula: limpar(o.proprietariosMatricula, 300),
    matricula: limpar(o.matricula, 40),
    registroImoveis: limpar(o.registroImoveis, 120),
    municipio: limpar(o.municipio, 60),
    inscricaoCadastral: limpar(o.inscricaoCadastral, 120),
    fracaoIdeal: limpar(o.fracaoIdeal, 20),
    valorVenalObito: valorDecimal(o.valorVenalObito),
    exercicioObito: limpar(o.exercicioObito, 4),
    valorVenalAtual: valorDecimal(o.valorVenalAtual),
    exercicioAtual: limpar(o.exercicioAtual, 4),
  };
  return Object.values(saida).some((v) => v !== null) ? saida : null;
}

function sanitizarFinanceiro(q: unknown): FinanceiroExtraido | null {
  if (!q || typeof q !== "object") return null;
  const o = q as Record<string, unknown>;
  const saida: FinanceiroExtraido = {
    instituicao: limpar(o.instituicao, 120),
    agencia: limpar(o.agencia, 20),
    conta: limpar(o.conta, 30),
  };
  return Object.values(saida).some((v) => v !== null) ? saida : null;
}

function sanitizarVeiculo(q: unknown): VeiculoExtraido | null {
  if (!q || typeof q !== "object") return null;
  const o = q as Record<string, unknown>;
  const saida: VeiculoExtraido = {
    marcaModelo: limpar(o.marcaModelo, 80),
    anoFabricacao: limpar(o.anoFabricacao, 4),
    anoModelo: limpar(o.anoModelo, 4),
    renavam: limpar(o.renavam, 20),
    placa: limpar(o.placa, 10),
    chassi: limpar(o.chassi, 30),
  };
  return Object.values(saida).some((v) => v !== null) ? saida : null;
}

/* ---------- redação de peças (honorários e petição judicial) ---------- */

export type TipoPecaRedigida =
  | "PROPOSTA"
  | "CONTRATO"
  | "PETICAO_JUDICIAL"
  | "ESCRITURA"
  | "CLAUSULAS";

export interface EntradaRedacaoHonorarios {
  tipo: TipoPecaRedigida;
  /** Resumo do caso + valores montado no cliente (a IA não recebe documentos). */
  contexto: string;
  /** Texto do modelo do próprio escritório, quando anexado — a IA o segue. */
  modeloEscritorio: string | null;
  /**
   * Instruções livres do(a) profissional para esta geração (campo de prompt
   * da UI) — a IA as atende com prioridade, sem violar as regras fixas.
   */
  instrucoes?: string | null;
}

export interface SecaoHonorarios {
  titulo: string;
  paragrafos: string[];
}

const SCHEMA_HONORARIOS = {
  type: "object",
  properties: {
    secoes: {
      type: "array",
      items: {
        type: "object",
        properties: {
          titulo: { type: "string" },
          paragrafos: { type: "array", items: { type: "string" } },
        },
        required: ["titulo", "paragrafos"],
      },
    },
  },
  required: ["secoes"],
} as const;

function promptHonorarios(e: EntradaRedacaoHonorarios): string {
  const doc =
    e.tipo === "CONTRATO"
      ? "um CONTRATO de prestação de serviços advocatícios e honorários (cláusulas numeradas: objeto, obrigações do contratado, obrigações dos contratantes, honorários e forma de pagamento com base no art. 22 da Lei 8.906/1994, despesas e custas por conta dos contratantes, rescisão com honorários proporcionais, foro)"
      : e.tipo === "PETICAO_JUDICIAL"
        ? "uma PETIÇÃO INICIAL de abertura de inventário JUDICIAL, completa e robusta (seções numeradas: dos fatos — óbito, último domicílio e competência do art. 48 do CPC, estado civil/regime e herdeiros, saisine do art. 1.784 do CC; do cabimento da via judicial e do procedimento dos arts. 610 e seguintes do CPC, com o prazo do art. 611; da nomeação do inventariante na ordem do art. 617 e compromisso do art. 620; do acervo como primeiras declarações, bem a bem, com valores; do esboço de partilha com meação, frações e fundamentos legais de cada quinhão; do ITCMD com a base e o valor apurados; dos pedidos — abertura, nomeação, citações do art. 626 incluindo Fazenda Estadual e Ministério Público quando cabível, avaliação, homologação do cálculo e da partilha com formal e alvarás, provas; e o valor da causa pelo monte-mor)"
        : e.tipo === "ESCRITURA"
          ? "uma ESCRITURA PÚBLICA de inventário e partilha COMPLETA, em estilo NOTARIAL, seguindo a estrutura do MODELO DA SERVENTIA anexado (a ordem das cláusulas, os títulos e o estilo de redação são os DELE): abertura ('SAIBAM…'), qualificação completa dos comparecentes com os dados do contexto, nomeação do(a) inventariante, autor(a) da herança e óbito, rol de bens com valores, partilha/pagamentos com as frações, ITCMD, declarações fiscais e legais, e encerramento. Tabelionato, livro, folhas, escrevente e tabelião SEMPRE em lacunas '______' — a minuta serve a qualquer serventia"
          : e.tipo === "CLAUSULAS"
          ? "APENAS a(s) cláusula(s)/seção(ões) ADICIONAIS pedidas nas instruções do(a) profissional, para inserir no documento-alvo descrito no contexto (escritura pública de inventário ou petição), no estilo notarial/forense correspondente — títulos curtos em CAIXA ALTA no padrão do documento (ex.: 'DA CESSÃO DE DIREITOS HEREDITÁRIOS'); NÃO reescreva o documento inteiro nem repita cláusulas que ele já tem"
          : "uma PROPOSTA de honorários advocatícios (seções: objeto, escopo dos serviços, honorários propostos com a justificativa de complexidade, o que não está incluído, condições de pagamento, validade de 30 dias e aceite)";
  return `Você é advogado(a) redator(a) experiente em direito sucessório no Brasil. Redija ${e.tipo === "CLAUSULAS" ? "" : "o CORPO de "}${doc} para o inventário descrito no contexto abaixo, em português do Brasil, texto objetivo e eficiente de escritório de primeira linha.
${e.instrucoes?.trim() ? `\nINSTRUÇÕES ESPECÍFICAS DO(A) PROFISSIONAL (atenda com prioridade, sem violar as regras inegociáveis):\n---\n${e.instrucoes.trim()}\n---\n` : ""}

${e.modeloEscritorio ? `MODELO DO ESCRITÓRIO (siga FIELMENTE a estrutura, a ordem das cláusulas/seções e o estilo deste modelo, adaptando o conteúdo ao caso do contexto; não copie dados de outras partes que porventura constem do modelo):\n---\n${e.modeloEscritorio}\n---\n\n` : ""}CONTEXTO DO CASO (única fonte de dados):
---
${e.contexto}
---

REGRAS INEGOCIÁVEIS:
- Use SOMENTE os dados do contexto; dado ausente vira a lacuna "______" — nunca invente nome, valor, data ou percentual.
- Os VALORES de honorários, percentuais e condições de pagamento são EXATAMENTE os do contexto (o sistema ainda anexa um quadro-resumo determinístico — não contradiga os números).
${e.tipo === "ESCRITURA" ? '- A escritura é o documento INTEIRO: inclua a qualificação das partes com os dados do contexto (campo ausente = lacuna "______") e o bloco final de assinaturas em lacunas.' : "- NÃO redija cabeçalho/logotipo, qualificação das partes nem bloco de assinaturas: o sistema monta essas partes com os dados oficiais da folha."}
- Devolva apenas o JSON: secoes = lista de { titulo (curto, em CAIXA ALTA), paragrafos (parágrafos completos, sem markdown) }.`;
}

/** Redige o corpo da proposta/contrato de honorários, já saneado. */
export async function redigirHonorarios(
  apiKey: string,
  entrada: EntradaRedacaoHonorarios
): Promise<SecaoHonorarios[]> {
  const parts = [{ text: promptHonorarios(entrada) }];
  const bruto = (await geminiJson(apiKey, parts, SCHEMA_HONORARIOS)) as Record<string, unknown>;
  const secoes = Array.isArray(bruto?.secoes) ? bruto.secoes : [];
  const saida = secoes
    .map((s) => {
      const item = s as Record<string, unknown>;
      const titulo = limpar(item?.titulo, 120);
      if (!titulo) return null;
      const paragrafos = (Array.isArray(item.paragrafos) ? item.paragrafos : [])
        .map((par) => (typeof par === "string" ? par.trim().slice(0, 4000) : ""))
        .filter(Boolean)
        .slice(0, 12);
      if (paragrafos.length === 0) return null;
      return { titulo, paragrafos };
    })
    .filter((s): s is SecaoHonorarios => s !== null)
    .slice(0, 24);
  if (saida.length === 0) {
    throw new GeminiError("Redação vazia — use a redação padrão local.", 502);
  }
  return saida;
}

/** Lê o lote de documentos e devolve o caso extraído, já saneado. */
export async function extrairCasoDoCofre(
  apiKey: string,
  arquivos: ArquivoCofre[]
): Promise<CasoExtraido> {
  const parts: Array<Record<string, unknown>> = [];
  arquivos.forEach((arq, i) => {
    const ext = getExtension(arq.fileName);
    // .txt: texto já extraído no navegador (planilhas .xlsx e documentos
    // .docx viram texto plano no cliente) — segue como parte de texto.
    if (ext === ".txt") {
      const conteudo = Buffer.from(arq.data).toString("utf-8").slice(0, 60_000);
      parts.push({ text: `DOCUMENTO ${i + 1}: ${arq.fileName}\n${conteudo}` });
      return;
    }
    const mimeType = AI_MIME_TYPES[ext];
    if (!mimeType) {
      throw new GeminiError(`Formato não suportado pela IA: ${arq.fileName}`, 415);
    }
    parts.push({ text: `DOCUMENTO ${i + 1}: ${arq.fileName}` });
    parts.push({
      inline_data: {
        mime_type: mimeType,
        data: Buffer.from(arq.data).toString("base64"),
      },
    });
  });
  parts.push({ text: prompt(arquivos.length) });

  const bruto = (await geminiJson(apiKey, parts, RESPONSE_SCHEMA)) as Record<string, unknown>;
  if (!bruto || typeof bruto !== "object") {
    throw new GeminiError("Resposta do Gemini fora do formato esperado.", 502);
  }

  const f = (bruto.falecido ?? {}) as Record<string, unknown>;
  const s = (bruto.sobrevivente ?? {}) as Record<string, unknown>;
  const herdeiros = Array.isArray(bruto.herdeiros) ? bruto.herdeiros : [];
  const bens = Array.isArray(bruto.bens) ? bruto.bens : [];
  const sociedades = Array.isArray(bruto.sociedades) ? bruto.sociedades : [];
  const outrosFalecidos = Array.isArray(bruto.outrosFalecidos) ? bruto.outrosFalecidos : [];
  const herdeirosNoObito = (Array.isArray(bruto.herdeirosNoObito) ? bruto.herdeirosNoObito : [])
    .filter((n: unknown): n is string => typeof n === 'string' && n.trim().length > 1)
    .map((n: string) => n.trim().slice(0, 120))
    .slice(0, 30);
  const certidoesCivis = (Array.isArray(bruto.certidoesCivis) ? bruto.certidoesCivis : [])
    .map((c): CertidaoCivilExtraida | null => {
      const item = c as Record<string, unknown>;
      const tipo = umDe(item?.tipo, ["NASCIMENTO", "CASAMENTO", "OBITO"] as const);
      const pessoa = limpar(item?.pessoa, 120);
      if (!tipo || !pessoa) return null;
      const flag = (v: unknown): boolean | null => (typeof v === "boolean" ? v : null);
      return {
        tipo,
        pessoa,
        conjuge: limpar(item.conjuge, 120),
        dataCasamento: dataIso(item.dataCasamento),
        regime: limpar(item.regime, 80),
        pactoAntenupcial: flag(item.pactoAntenupcial),
        averbacaoDivorcio: flag(item.averbacaoDivorcio),
        averbacaoObitoConjuge: flag(item.averbacaoObitoConjuge),
        dataNascimento: dataIso(item.dataNascimento),
        dataObito: dataIso(item.dataObito),
      };
    })
    .filter((x): x is CertidaoCivilExtraida => x !== null)
    .slice(0, 30);
  const arquivosSaida = Array.isArray(bruto.arquivos) ? bruto.arquivos : [];

  return {
    falecido: {
      nome: limpar(f.nome),
      cpf: limpar(f.cpf, 14),
      dataObito: dataIso(f.dataObito),
      dataCasamento: dataIso(f.dataCasamento),
      ultimoDomicilio: limpar(f.ultimoDomicilio, 80),
      localFalecimento: limpar(f.localFalecimento, 120),
      certidaoObito: limpar(f.certidaoObito, 200),
      certidaoCasamento: limpar(f.certidaoCasamento, 200),
      qualificacao: sanitizarQualificacao(f.qualificacao),
    },
    sobrevivente: {
      existe: typeof s.existe === "boolean" ? s.existe : null,
      nome: limpar(s.nome),
      vinculo: umDe(s.vinculo, ["CASAMENTO", "UNIAO_ESTAVEL"] as const),
      regime: umDe(s.regime, [
        "COMUNHAO_PARCIAL",
        "COMUNHAO_UNIVERSAL",
        "SEPARACAO_CONVENCIONAL",
        "SEPARACAO_OBRIGATORIA",
      ] as const),
      qualificacao: sanitizarQualificacao(s.qualificacao),
    },
    herdeiros: herdeiros
      .map((h) => {
        const item = h as Record<string, unknown>;
        const nome = limpar(item?.nome);
        if (!nome) return null;
        const filho = item?.filhoDoSobrevivente;
        return {
          nome,
          filhoDoSobrevivente: typeof filho === "boolean" ? filho : null,
          qualificacao: sanitizarQualificacao(item?.qualificacao),
        };
      })
      .filter((h): h is NonNullable<typeof h> => h !== null)
      .slice(0, 20),
    bens: bens
      .map((b) => {
        const item = b as Record<string, unknown>;
        const descricao = limpar(item?.descricao, 200);
        if (!descricao) return null;
        return {
          descricao,
          tipo: umDe(item.tipo, ["IMOVEL", "VEICULO", "FINANCEIRO", "QUOTAS", "OUTRO"] as const),
          valor: valorDecimal(item.valor),
          natureza: umDe(item.natureza, ["COMUM", "PARTICULAR"] as const),
          imovel: sanitizarImovel(item.imovel),
          veiculo: sanitizarVeiculo(item.veiculo),
          financeiro: sanitizarFinanceiro(item.financeiro),
        };
      })
      .filter((b): b is NonNullable<typeof b> => b !== null)
      .slice(0, 40),
    sociedades: sociedades
      .map((item) => {
        const soc = item as Record<string, unknown>;
        const empresa = limpar(soc?.empresa, 120);
        if (!empresa) return null;
        const sociosBrutos = Array.isArray(soc.socios) ? soc.socios : [];
        const socios = sociosBrutos
          .map((x) => {
            const socio = x as Record<string, unknown>;
            const nome = limpar(socio?.nome, 120);
            if (!nome) return null;
            const p = Number(socio?.percentual);
            return {
              nome,
              percentual: Number.isFinite(p) && p > 0 && p <= 100 ? p : null,
            };
          })
          .filter((x): x is NonNullable<typeof x> => x !== null)
          .slice(0, 20);
        return {
          empresa,
          cnpj: limpar(soc.cnpj, 20),
          capitalSocial: valorDecimal(soc.capitalSocial),
          patrimonioLiquido: valorDecimal(soc.patrimonioLiquido),
          socios,
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null)
      .slice(0, 10),
    herdeirosNoObito,
    certidoesCivis,
    outrosFalecidos: outrosFalecidos
      .map((item) => {
        const nome = limpar((item as Record<string, unknown>)?.nome);
        if (!nome) return null;
        return { nome, dataObito: dataIso((item as Record<string, unknown>).dataObito) };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null)
      .slice(0, 6),
    arquivos: arquivosSaida
      .map((a) => {
        const item = a as Record<string, unknown>;
        const indice = Number(item?.indice);
        if (!Number.isInteger(indice) || indice < 1 || indice > arquivos.length) return null;
        const documentoId = limpar(item.documentoId, 60);
        return {
          indice,
          tipoDetectado: limpar(item.tipoDetectado, 60),
          documentoId: documentoId && IDS_CATALOGO.includes(documentoId) ? documentoId : null,
        };
      })
      .filter((a): a is NonNullable<typeof a> => a !== null),
  };
}
