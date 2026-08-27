/**
 * Minuta da ESCRITURA de inventário e partilha — perfil Escrevente Notarial.
 *
 * Gerada sobre o ESQUELETO CANÔNICO consolidado de ~23 escrituras REAIS do
 * balcão (minutas e traslados de tabelionatos paulistas), NA FORMATAÇÃO do
 * modelo: fonte Tahoma, corpo justificado, cada TÍTULO DE CLÁUSULA dentro de
 * um RETÂNGULO (moldura de parágrafo), tabela-resumo na abertura e a PARTILHA
 * em tabelas Patrimônio · Proporção · Valor, uma por pagamento. A identificação
 * do tabelionato, do escrevente e do tabelião fica SEMPRE em branco (______) —
 * a minuta serve a qualquer serventia.
 *
 * Ordem das cláusulas = a dos modelos lavrados: SAIBAM → comparecentes por
 * papel (cônjuge supérstite · herdeiros numerados · advogado(a)) → DAS
 * IDENTIFICAÇÕES → DAS DECLARAÇÕES PRELIMINARES (requerimento nomeando o ato)
 * → bloco do falecido (autor da herança · casamento · herdeiros · testamento)
 * → DO PATRIMÔNIO → DAS OBRIGAÇÕES (inventariante) → DA COLAÇÃO → contas
 * (monte mor · meação · legítima) → ato dispositivo (PARTILHA por pagamentos
 * ordinais, ou ADJUDICAÇÃO com herdeiro único; cessão gratuita de torna em
 * seção própria) → DO(A) ADVOGADO(A) → DAS DECLARAÇÕES ULTERIORES → DO TÍTULO
 * HÁBIL (destinatário adaptado ao acervo) → fiscal (ITCMD pago × isento, com
 * memória de cálculo pela UFESP em óbito antigo) → burocrático-notarial (CNDT
 * · Central de Indisponibilidade com HASH · documentos do art. 117 ·
 * microfilmagem · DOI · LGPD · autenticidade nos atos eletrônicos) →
 * encerramento com assinaturas, selos ES/TR e emolumentos discriminados.
 *
 * Preenchimento DETERMINÍSTICO e condicional à folha: introdução/encerramento
 * por MODALIDADE (presencial · videoconferência e-Notariado · híbrida);
 * herdeiro casado com imóvel no acervo comparece "assistido(a) de seu(sua)
 * cônjuge" (outorga uxória); RENÚNCIA (arts. 1.804/1.806 CC) só com herdeiro
 * renunciante; Detran só com veículo; parágrafo bancário (art. 168 CP) só com
 * crédito; DOI só com imóvel. Nenhuma tabela sai vazia: sem fração por bem, a
 * linha usa a fração da herança sobre cada bem.
 *
 * Campo sem base na folha vira lacuna. Toda saída é MINUTA para conferência.
 */

import type { Bem, Herdeiro, Regime, Resultado, Vinculo, QuinhaoSaida } from './types';
import { formatarData, type DadosFalecido, type Qualificacao } from './familia';
import type { ProvisaoItcmd } from './itcmd';
import { montarDocxRico, type BlocoDocx, type Paragrafo } from './docx';
import { dataPorExtenso, brl, LACUNA, ROTULO_REGIME } from './peticao';

export type ModalidadeEscritura = 'PRESENCIAL' | 'VIDEOCONFERENCIA' | 'HIBRIDA';

export const ROTULO_MODALIDADE: Record<ModalidadeEscritura, string> = {
  PRESENCIAL: 'Presencial',
  VIDEOCONFERENCIA: 'Por videoconferência (e-Notariado)',
  HIBRIDA: 'Híbrida (parte presencial, parte por vídeo)',
};

export interface PagamentoDiferenciado {
  nome: string;
  itens: { numero: number; descricao: string; pct: number }[];
  valorRecebido: string;
}

/** Sucessão CUMULADA que entra na MESMA escritura (dois ou mais óbitos). */
export interface SucessaoEscritura {
  /** Id da sucessão no caso — chave das colunas por sucessão do acervo. */
  id: string;
  nome: string;
  dataObito: string;
  /** Monte partível (base transmitida) apurado para a sucessão. */
  base: number;
  /** Partilha sintética da sucessão ("mesmos herdeiros") — null vira lacuna. */
  resultado: Resultado | null;
  provisao: ProvisaoItcmd | null;
  /** Ficha completa do(a) autor(a) desta sucessão (item I — A família):
   *  preenche o bloco "º FALECIMENTO"; campo vazio segue virando lacuna. */
  qualificacao?: Qualificacao;
}

export interface DadosEscritura {
  modalidade: ModalidadeEscritura;
  /** Quem participa por videoconferência — obrigatório na híbrida. */
  partesRemotas: string;
  falecido: DadosFalecido;
  /** Ficha completa do "de cujus" (RG, nascimento, filiação, endereço…). */
  qualificacaoFalecido?: Qualificacao;
  temSobrevivente: boolean;
  nomeSobrev: string;
  vinculo: Vinculo;
  regime: Regime;
  herdeiros: Herdeiro[];
  qualificacoes: Record<string, Qualificacao>;
  inventarianteId: string | null;
  bens: Bem[];
  resultado: Resultado | null;
  provisao: ProvisaoItcmd | null;
  /** Partilha diferenciada da matriz (null = segue o espelho). */
  diferenciada: {
    pagamentos: PagamentoDiferenciado[];
    tornas: { de: string; para: string; valor: string; titulo: string }[];
  } | null;
  /**
   * Cláusulas adicionais pedidas pelo(a) escrevente no campo de instruções
   * (redigidas pela IA) — entram antes do encerramento, com o retângulo.
   */
  clausulasExtras?: { titulo: string; paragrafos: string[] }[] | null;
  /**
   * SOBREPARTILHA (CPC, arts. 669/670): o ato vira "escritura de
   * sobrepartilha" — seção DA SOBREPARTILHA com a remissão à escritura
   * anterior (em lacunas), patrimônio "além dos bens mencionados na
   * escritura de inventário" e dispositivo sobre o acervo ora
   * sobrepartilhado, como no modelo do balcão.
   */
  sobrepartilha?: boolean;
  /**
   * SUCESSÕES CUMULADAS: com entradas aqui, a escritura vira o ato de DOIS
   * (ou mais) óbitos — DAS SUCESSÕES, PRIMEIRO/SEGUNDO FALECIMENTO, monte e
   * legítima POR sucessão, uma partilha por sucessão, inventariante dos
   * espólios e ITCMD por óbito, como no modelo cumulado do balcão.
   */
  sucessoes?: SucessaoEscritura[];
}

/* ---------- helpers ---------- */

const pctFmt = (v: number) => `${v.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`;
const num2 = (n: number) => String(n).padStart(2, '0');
const numBr = (n: number) =>
  n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const ORDINAL = ['PRIMEIRO', 'SEGUNDO', 'TERCEIRO', 'QUARTO', 'QUINTO', 'SEXTO', 'SÉTIMO', 'OITAVO', 'NONO', 'DÉCIMO'];
const ordinal = (n: number) => ORDINAL[n] ?? `${n + 1}º`;
const ORDINAL_F = ['primeira', 'segunda', 'terceira', 'quarta', 'quinta', 'sexta', 'sétima', 'oitava', 'nona', 'décima'];
const ROMANO = ['i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii', 'viii', 'ix', 'x'];
const romano = (n: number) => ROMANO[n] ?? String(n + 1);

/** "A, B e C" — enumeração com o "e" final, como nos atos. */
const listaE = (nomes: string[]): string =>
  nomes.length > 1 ? `${nomes.slice(0, -1).join(', ')} e ${nomes[nomes.length - 1]}` : nomes[0] ?? LACUNA;

/**
 * Memória de cálculo do ITCMD pela UFESP (óbito antigo), como nos modelos:
 * "base ÷ UFESP do óbito × UFESP atual × 4%, com os acréscimos legais".
 */
const memoriaUfesp = (pv: ProvisaoItcmd | null): string =>
  pv && Number(pv.imposto) > 0 && pv.ufespAtualizacao > pv.ufespObito
    ? ` (correspondente a ${brl((pv.baseEmUfesps * pv.ufespObito).toFixed(2))} ÷ R$ ${numBr(pv.ufespObito)} — UFESP do exercício do óbito — × R$ ${numBr(pv.ufespAtualizacao)} — UFESP de ${pv.anoAtualizacao} — × 4%, com os acréscimos legais)`
    : '';

/** "1/6" → 0.1666…; "1" → 1; inválido → null. */
function fracaoParaNumero(f: string | undefined): number | null {
  if (!f) return null;
  const m = /^(\d+)(?:\/(\d+))?$/.exec(f.trim());
  if (!m) return null;
  const num = Number(m[1]);
  const den = m[2] ? Number(m[2]) : 1;
  return den > 0 ? num / den : null;
}

const endereco = (q?: Qualificacao): string => {
  const rua = [q?.endereco, q?.complemento, q?.bairro].filter((x) => x?.trim()).join(', ');
  const cidade = [q?.cidade, q?.uf].filter((x) => x?.trim()).join('/');
  return `${rua || LACUNA}${cidade ? `, ${cidade}` : `, ${LACUNA}`}${q?.cep?.trim() ? ` (CEP. ${q.cep.trim()})` : ''}`;
};

/** Bloco comum "profissão, RG, CPF, nascido aos, filho de" da qualificação. */
const nucleo = (q?: Qualificacao): string =>
  [
    q?.profissao?.trim() || `profissão ${LACUNA}`,
    `RG. nº ${q?.rg?.trim() || LACUNA}`,
    `inscrito(a) no CPF/MF sob nº ${q?.cpf?.trim() || LACUNA}`,
    `nascido(a) aos ${q?.dataNascimento ? formatarData(q.dataNascimento) : LACUNA}`,
    `filho(a) de ${q?.filiacao?.trim() || LACUNA}`,
  ].join(', ');

/** Certidão de casamento da ficha, ou a lacuna-padrão do modelo. */
const certidaoCasamentoDe = (q?: Qualificacao): string =>
  q?.casamentoCertidao?.trim()
    ? `extraída da ${q.casamentoCertidao.trim()}`
    : `extraída da matrícula nº ${LACUNA}, expedida pelo ORCPN ${LACUNA}`;

/**
 * Qualificação completa do cônjuge/convivente de um herdeiro. Formatação do
 * modelo: cônjuge que COMPARECE ao ato (assistência com imóvel no acervo)
 * sai NEGRITO + SUBLINHADO; apenas referido, só negrito.
 */
const conjugeDe = (q: Qualificacao | undefined, comparece: boolean): string =>
  [
    comparece
      ? `Sr(a). __**${(q?.conjugeNome?.trim() || LACUNA).toUpperCase()}**__`
      : `Sr(a). **${(q?.conjugeNome?.trim() || LACUNA).toUpperCase()}**`,
    q?.conjugeNacionalidade?.trim() || 'brasileiro(a)',
    q?.conjugeProfissao?.trim() || `profissão ${LACUNA}`,
    `RG. nº ${q?.conjugeRg?.trim() || LACUNA}`,
    `inscrito(a) no CPF/MF sob nº ${q?.conjugeCpf?.trim() || LACUNA}`,
    `nascido(a) aos ${q?.conjugeDataNascimento ? formatarData(q.conjugeDataNascimento) : LACUNA}`,
    `filho(a) de ${q?.conjugeFiliacao?.trim() || LACUNA}`,
  ].join(', ');

/**
 * Qualificação de HERDEIRO nas variantes do modelo: solteiro (com certidão
 * de nascimento), casado (cônjuge completo + data/regime/certidão — com
 * IMÓVEL no acervo, "neste ato assistido(a) de seu(sua) cônjuge", que
 * comparece e assina), convivente em união estável (não é estado civil — o
 * convivente mantém o próprio) ou divorciado (averbação na certidão).
 */
function qualificarHerdeiro(nome: string, q: Qualificacao | undefined, comAssistencia: boolean): string {
  // Nome do herdeiro em NEGRITO + SUBLINHADO (caixa alta), corpo normal.
  const partes: string[] = [`Sr(a). __**${nome.toUpperCase()}**__`, q?.nacionalidade?.trim() || 'brasileiro(a)'];
  const estado = (q?.estadoCivil ?? '').toLowerCase();
  const convivente = q?.uniaoEstavel === true && !estado.includes('casad');
  const casado = !convivente && (Boolean(q?.conjugeNome?.trim()) || estado.includes('casad'));

  if (casado) {
    partes.push('maior e capaz', nucleo(q));
    if (q?.email?.trim()) partes.push(`e-mail: ${q.email.trim()}`);
    const vinculoConj = `casado(a) pelo regime da ${q?.casamentoRegime?.trim() || LACUNA}, em ${q?.casamentoData ? formatarData(q.casamentoData) : LACUNA} — (Certidão de Casamento ${certidaoCasamentoDe(q)})`;
    partes.push(
      comAssistencia
        ? `neste ato assistido(a) de seu(sua) cônjuge, ${conjugeDe(q, true)}, ${vinculoConj}`
        : `${vinculoConj}, com ${conjugeDe(q, false)}`,
    );
  } else if (convivente) {
    partes.push(q?.estadoCivil?.trim() || 'solteiro(a)', 'maior e capaz', nucleo(q));
    if (q?.email?.trim()) partes.push(`e-mail: ${q.email.trim()}`);
    partes.push(
      `convivente em união estável com ${conjugeDe(q, comAssistencia)}${comAssistencia ? ', que comparece a este ato' : ''}`,
    );
  } else if (estado.includes('divorc')) {
    partes.push('maior e capaz', nucleo(q));
    partes.push(`divorciado(a) — conforme averbação constante em sua Certidão de Casamento ${certidaoCasamentoDe(q)}`);
    if (q?.email?.trim()) partes.push(`e-mail: ${q.email.trim()}`);
  } else {
    partes.push(q?.estadoCivil?.trim() || 'solteiro(a)', 'maior e capaz', nucleo(q));
    partes.push(`conforme Certidão de Nascimento extraída da matrícula nº ${LACUNA}, expedida pelo ORCPN ${LACUNA}`);
    if (q?.email?.trim()) partes.push(`e-mail: ${q.email.trim()}`);
  }
  partes.push(`residente e domiciliado(a) na ${endereco(q)}`);
  return partes.join(', ');
}

/** Estado civil do falecido na qualificação póstuma (sem cônjuge supérstite). */
function estadoCivilDoFalecido(qf?: Qualificacao): string {
  const estado = (qf?.estadoCivil ?? '').toLowerCase();
  if (estado.includes('solteir'))
    return `solteiro(a) — conforme Certidão de Nascimento extraída da matrícula nº ${LACUNA}, expedida pelo ORCPN ${LACUNA} —`;
  if (estado.includes('viuv') || estado.includes('viúv'))
    return `viúvo(a) de ${LACUNA} — conforme averbação constante na Certidão de Casamento extraída da matrícula nº ${LACUNA}, expedida pelo ORCPN ${LACUNA} —`;
  if (estado.includes('divorc'))
    return `divorciado(a) — conforme averbação constante na Certidão de Casamento extraída da matrícula nº ${LACUNA}, expedida pelo ORCPN ${LACUNA} —`;
  return `no estado civil de ${qf?.estadoCivil?.trim() || LACUNA}`;
}

/* ---------- blocos do acervo (esqueletos do modelo, por tipo de bem) ---------- */

function blocoBem(b: Bem, i: number, sucessoes: SucessaoEscritura[] = []): string {
  // Sucessões cumuladas: avaliação POR FATO GERADOR, como no modelo do
  // balcão ("a) para o primeiro falecimento ...; b) para a sucessão de ...").
  const colunas = sucessoes
    .map((s) => {
      const av = b.sucessoes?.[s.id];
      if (!av?.valor && !av?.fracaoPct) return null;
      return `para a sucessão de ${s.nome}${av.fracaoPct?.trim() ? ` (fração de ${av.fracaoPct.trim()}%)` : ''}, o valor de ${av.valor ? `**${brl(av.valor)}**` : `R$ ${LACUNA}`}`;
    })
    .filter((x): x is string => x !== null);
  // Formatação do modelo: numeração + espécie do bem e os SUB-RÓTULOS
  // ("FORMA DE AQUISIÇÃO:", "CADASTRO E VALOR VENAL:", "DA AVALIAÇÃO:") em
  // negrito, a matrícula sublinhada, a inscrição cadastral e os VALORES em
  // negrito — o extenso entre parênteses fica normal.
  const avaliacao =
    colunas.length > 0
      ? `**DA AVALIAÇÃO:** As partes atribuem para efeitos fiscais e de partilha: **a)** para o primeiro falecimento, o valor de **${brl(b.valor)}** (${LACUNA}); ${colunas.map((c, j) => `**${String.fromCharCode(98 + j)})** ${c}`).join('; ')};`
      : `**DA AVALIAÇÃO:** As partes atribuem para efeitos fiscais e de partilha o valor de **${brl(b.valor)}** (${LACUNA});`;
  switch (b.tipo) {
    case 'IMOVEL': {
      const im = b.imovel ?? {};
      // Abre com a DESCRIÇÃO DA MATRÍCULA (averbações da especialidade
      // objetiva incluídas) — como no modelo: "1) DESCRIÇÃO IMÓVEL. FORMA…".
      const descricao = im.descricaoMatricula?.trim() || `${b.descricao.toUpperCase()} — descrição conforme a matrícula: ${LACUNA}`;
      return `**${i + 1})** ${descricao}. **FORMA DE AQUISIÇÃO:** Havido pelo(a) "de cujus" por força do ${im.aquisicao?.trim() || `R.${LACUNA}`} da __matrícula nº ${im.matricula?.trim() || LACUNA} do ${im.registroImoveis?.trim() || `${LACUNA}º Registro Imobiliário de ${LACUNA}`}__. **CADASTRO E VALOR VENAL:** inscrito na Municipalidade de ${im.municipio?.trim() || LACUNA}, sob a inscrição cadastral / o contribuinte nº **${im.inscricaoCadastral?.trim() || LACUNA}**, tendo recebido no exercício do falecimento (${im.exercicioObito?.trim() || LACUNA}) o valor venal de ${im.valorVenalObito ? brl(im.valorVenalObito) : `R$ ${LACUNA}`} (${LACUNA}) e no corrente exercício (${im.exercicioAtual?.trim() || LACUNA}) o valor venal de ${im.valorVenalAtual ? brl(im.valorVenalAtual) : `R$ ${LACUNA}`} (${LACUNA}). ${avaliacao}`;
    }
    case 'VEICULO': {
      const v = b.veiculo ?? {};
      return `**${i + 1}) UM AUTOMÓVEL** da Marca/Modelo: ${v.marcaModelo?.trim() || LACUNA} — Ano Fáb.: ${v.anoFabricacao?.trim() || LACUNA} — Ano Mod.: ${v.anoModelo?.trim() || LACUNA} — RENAVAM: ${v.renavam?.trim() || LACUNA} — Placa: ${v.placa?.trim() || LACUNA} — CHASSI: ${v.chassi?.trim() || LACUNA}. ${avaliacao}`;
    }
    case 'FINANCEIRO':
      return `**${i + 1}) CRÉDITO** no Banco ${LACUNA}, decorrente do saldo bancário em conta ${LACUNA} nº ${LACUNA}, agência nº ${LACUNA}, no valor de **${brl(b.valor)}** (${LACUNA}) na data do óbito;`;
    case 'QUOTAS':
      return `**${i + 1}) PARTICIPAÇÃO SOCIETÁRIA** com ${LACUNA} quotas da empresa ${LACUNA}, inscrita no CNPJ/MF sob nº ${LACUNA}, com sede na ${LACUNA}. ${avaliacao}`;
    default:
      return `**${i + 1})** ${b.descricao.toUpperCase()}. ${avaliacao}`;
  }
}

/* ---------- montagem ---------- */

/** Colunas das tabelas do modelo (twips). */
const COLS_RESUMO = [2514, 6065];
const COLS_PARTILHA = [2784, 2784, 2785];
const CABECA_PARTILHA = { celulas: ['PATRIMÔNIO', 'PROPORÇÃO', 'VALOR'], negrito: true };

export async function montarEscrituraDocx(d: DadosEscritura): Promise<Blob> {
  const blocos: BlocoDocx[] = [];
  const p = (texto: string, o?: Omit<Paragrafo, 'texto'>) =>
    blocos.push({ tipo: 'p', texto, ...o });
  // Título de cláusula: centralizado, negrito e DENTRO DO RETÂNGULO (modelo).
  const secao = (t: string) => p(t, { titulo: true, moldura: true });
  const tabela = (linhas: { celulas: string[]; negrito?: boolean }[], colunas = COLS_PARTILHA, tamanho?: number) =>
    blocos.push({ tipo: 'tabela', colunas, linhas, tamanho });

  const nomeFalecido = (d.falecido.nome?.trim() || LACUNA).toUpperCase();
  const temVeiculo = d.bens.some((b) => b.tipo === 'VEICULO');
  const temCreditoBancario = d.bens.some((b) => b.tipo === 'FINANCEIRO');
  const temImovel = d.bens.some((b) => b.tipo === 'IMOVEL');
  const r = d.resultado && d.resultado.bloqueios.length === 0 ? d.resultado : null;
  const qf = d.qualificacaoFalecido;
  const inventariante =
    d.inventarianteId === '__sobrevivente__'
      ? d.nomeSobrev.trim() || null
      : d.herdeiros.find((h) => h.id === d.inventarianteId)?.nome ?? null;
  const vivos = d.herdeiros.filter((h) => h.status === 'ATIVO');
  const renunciantes = d.herdeiros.filter((h) => h.status === 'RENUNCIANTE');
  const preMortos = d.herdeiros.filter((h) => h.status === 'PRE_MORTO');
  const ehUniao = d.vinculo !== 'CASAMENTO';
  const rotuloSupers = ehUniao ? 'COMPANHEIRO(A) SUPÉRSTITE' : 'CÔNJUGE SUPÉRSTITE';
  const rotuloSupersMin = ehUniao ? 'companheiro(a) supérstite' : 'cônjuge supérstite';
  // ADJUDICAÇÃO no lugar da partilha: herdeiro único, sem meação a pagar e
  // sem partilha diferenciada — como nos modelos de herdeira única do balcão.
  const adjudicacao = !d.diferenciada && r !== null && !r.meacao && r.quinhoes.length === 1;
  // Sucessões cumuladas (dois ou mais óbitos na MESMA escritura) — não se
  // combinam com a sobrepartilha, que é um ato posterior próprio.
  const sucessoes = d.sobrepartilha ? [] : d.sucessoes ?? [];
  const cumuladas = sucessoes.length > 0;
  const nomesFalecidos = [nomeFalecido, ...sucessoes.map((s) => s.nome.toUpperCase())];
  const nomeAto = d.sobrepartilha
    ? 'ESCRITURA DE SOBREPARTILHA DE BENS'
    : cumuladas
      ? 'ESCRITURA DE INVENTÁRIOS E PARTILHAS DE BENS'
      : adjudicacao
        ? 'ESCRITURA DE INVENTÁRIO E ADJUDICAÇÃO DE BENS'
        : 'ESCRITURA DE INVENTÁRIO E PARTILHA DE BENS';
  const nomeAtoMin = d.sobrepartilha
    ? 'sobrepartilha'
    : cumuladas
      ? 'inventários e partilhas'
      : adjudicacao
        ? 'inventário e adjudicação'
        : 'inventário e partilha';
  const partesRol = d.temSobrevivente ? `o(a) ${rotuloSupersMin} e os herdeiros` : 'os herdeiros';
  const autorRef = cumuladas ? 'dos(as) "autores(as) das heranças"' : 'do(a) "autor(a) da herança"';

  p(`MINUTA gerada pelo Sucessorista (${ROTULO_MODALIDADE[d.modalidade]}) — conferência do(a) escrevente/tabelião(ã) responsável é obrigatória; lacunas (______) aguardam os dados do ato.`, {
    centrado: true,
    discreto: true,
  });

  /* cabeçalho do modelo: título em retângulo + tabela-resumo */
  p(nomeAto, { centrado: true, negrito: true, moldura: true });
  // Rótulos da tabela-resumo em NEGRITO com o valor normal — como nos modelos.
  const linhasResumo: { celulas: string[] }[] = cumuladas
    ? [
        { celulas: ['**1º Falecimento:**', `${nomeFalecido}.`] },
        ...sucessoes.map((s, i) => ({ celulas: [`**${i + 2}º Falecimento:**`, `${s.nome.toUpperCase()}.`] })),
      ]
    : [{ celulas: ['**Autor(a) da Herança:**', `${nomeFalecido}.`] }];
  if (d.temSobrevivente)
    linhasResumo.push({ celulas: [`**${ehUniao ? 'Companheiro(a)' : 'Cônjuge'} Supérstite:**`, `${(d.nomeSobrev.trim() || LACUNA).toUpperCase()}.`] });
  linhasResumo.push(
    { celulas: ['**Herdeiros(as):**', `${vivos.map((h) => h.nome).join('; ') || LACUNA}.`] },
    { celulas: ['**Advogado(a):**', `Dr(a). ${LACUNA}.`] },
    { celulas: ['**Monte Mor:**', r ? `${brl(r.acervo.massaPartilhavel)}.` : `R$ ${LACUNA}.`] },
  );
  if (r?.meacao) linhasResumo.push({ celulas: ['**Meação:**', `${brl(r.meacao.valor)}.`] });
  linhasResumo.push({ celulas: ['**Legítima:**', r ? `${brl(r.heranca.total)}.` : `R$ ${LACUNA}.`] });
  sucessoes.forEach((s, i) =>
    linhasResumo.push({ celulas: [`**Base da ${i + 2}ª sucessão:**`, `${brl(s.base.toFixed(2))}.`] }),
  );
  tabela(linhasResumo, COLS_RESUMO, 18);

  /* SAIBAM — abertura do modelo, com a variante da modalidade; fecha em
   * "a saber:" porque a qualificação dos comparecentes vem NA SEQUÊNCIA,
   * por papel, como nos atos lavrados. */
  // Formatação do modelo: só "SAIBAM" e os numerais entre parênteses em
  // negrito — o corpo da abertura é texto normal.
  const abertura = `**SAIBAM** todos os que virem esta pública escritura que, aos ${LACUNA} (**${LACUNA}**) dias do mês de ${LACUNA} (**${LACUNA}**) do ano de ${LACUNA} (**${LACUNA}**), nesta cidade e comarca de ${LACUNA}, Estado de ${LACUNA}`;
  const serventia = `neste ${LACUNA}º Tabelionato de Notas, instalado na ${LACUNA} — (CEP. ${LACUNA}), perante mim, Escrevente Notarial, e o(a) Tabelião(ã) que esta subscreve`;
  const fechoIntro = 'compareceram partes entre si, justas e convencionadas, como outorgantes e reciprocamente outorgados, a saber:';
  p(
    d.modalidade === 'PRESENCIAL'
      ? `${abertura}, em cartório, ${serventia}, ${fechoIntro}`
      : d.modalidade === 'VIDEOCONFERENCIA'
        ? `${abertura}, em VIDEOCONFERÊNCIA, nos termos do Provimento CNJ nº 149/2023, do Conselho Nacional de Justiça, e presencialmente ${serventia}, ${fechoIntro}`
        : `${abertura}, de forma HÍBRIDA — comparecendo por videoconferência, nos termos do Provimento CNJ nº 149/2023: ${d.partesRemotas.trim() || LACUNA}; e, presencialmente, as demais partes —, ${serventia}, ${fechoIntro}`,
  );

  /* comparecentes por PAPEL — blocos rotulados, como nos modelos */
  // Formatação do modelo: o RÓTULO do papel em negrito, o NOME da parte em
  // NEGRITO + SUBLINHADO (caixa alta) e o corpo da qualificação normal —
  // nunca o parágrafo inteiro.
  if (d.temSobrevivente) {
    const qs = d.qualificacoes['__sobrevivente__'];
    p(
      `**${rotuloSupers}:** Sr(a). __**${(d.nomeSobrev.trim() || LACUNA).toUpperCase()}**__, ${qs?.nacionalidade?.trim() || 'brasileiro(a)'}, ${ehUniao ? 'companheiro(a) supérstite' : 'viúvo(a)'} de ${nomeFalecido} — "autor(a) da herança" — (Certidão de Óbito ${d.falecido.certidaoObito?.trim() ? `extraída da ${d.falecido.certidaoObito.trim()}` : `extraída da matrícula nº ${LACUNA}, expedida pelo ORCPN ${LACUNA}`}), ${nucleo(qs)}${qs?.email?.trim() ? `, e-mail: ${qs.email.trim()}` : ''}, residente e domiciliado(a) na ${endereco(qs)};`,
      { tamanho: 21 },
    );
  }
  vivos.forEach((h, i) => {
    p(
      `${i === 0 ? `**HERDEIRO${vivos.length > 1 ? 'S' : ''}: ${i + 1})**` : `**${i + 1})**`} ${qualificarHerdeiro(h.nome, d.qualificacoes[h.id], temImovel)};`,
      { tamanho: 21 },
    );
  });
  p(
    `**ADVOGADO(A):** Dr(a). __**${LACUNA}**__, brasileiro(a), ${LACUNA}, inscrito(a) na OAB/${LACUNA} sob nº ${LACUNA} — inscrito(a) no CPF/MF sob nº ${LACUNA}, nascido(a) aos ${LACUNA}, filho(a) de ${LACUNA}, e-mail: ${LACUNA}, com escritório na ${LACUNA}; nomeado(a) pelos presentes, para o fim específico de assisti-los neste ato jurídico, bem como para eventuais retificações e ratificações que se fizerem necessárias.`,
    { tamanho: 21 },
  );

  secao('DAS IDENTIFICAÇÕES');
  p(`${d.temSobrevivente ? `O(A) ${rotuloSupersMin}, os herdeiros e o(a) advogado(a)` : 'Os herdeiros e o(a) advogado(a)'} foram identificados à vista dos documentos apresentados, nos originais, do que dou fé.`);

  /* requerimento nomeando o ato — fórmula das declarações preliminares */
  secao('DAS DECLARAÇÕES PRELIMINARES');
  p(
    `Por ${partesRol}, assistidos por seu(sua) advogado(a) nomeado(a), foi-me requerida a lavratura desta escritura de ${nomeAtoMin} dos bens deixados pelo${cumuladas ? 's falecimentos' : ' falecimento'} de ${listaE(nomesFalecidos.map((n) => `**${n}**`))}, declarando o seguinte:`,
  );

  /* sobrepartilha — remissão à escritura anterior (fórmula do modelo) */
  if (d.sobrepartilha) {
    secao('DA SOBREPARTILHA');
    p(
      `Por ocasião da Escritura de Inventário e Partilha dos bens deixados pelo falecimento de ${nomeFalecido}, datada de ${LACUNA}, lavrada no ${LACUNA}º Tabelionato de Notas de ${LACUNA}, às fls. ${LACUNA} do Livro nº ${LACUNA}, foram involuntariamente excluídos da partilha os bens adiante descritos e caracterizados, que ora se sobrepartilham na forma dos arts. 669 e 670 do Código de Processo Civil.`,
    );
  }

  /* sucessões cumuladas — enumeração das aberturas, como no modelo */
  if (cumuladas) {
    secao('DAS SUCESSÕES');
    const aberturas = [
      { nome: nomeFalecido, dataObito: d.falecido.dataObito },
      ...sucessoes.map((s) => ({ nome: s.nome.toUpperCase(), dataObito: s.dataObito })),
    ];
    p(
      `${aberturas
        .map(
          (s, i) =>
            `${romano(i)}) a ${ORDINAL_F[i] ?? `${i + 1}ª`} sucessão aberta foi a de ${s.nome}, ocorrida no dia ${s.dataObito ? formatarData(s.dataObito) : LACUNA}, deixando os herdeiros indicados no item "DOS HERDEIROS"`,
        )
        .join('; e, ')}.`,
    );
  }

  /* autor(a) da herança — qualificação póstuma completa + óbito + certidão;
   * nas sucessões cumuladas os blocos viram PRIMEIRO/SEGUNDO FALECIMENTO */
  secao(cumuladas ? 'PRIMEIRO FALECIMENTO' : `DO(A) "AUTOR(A) DA HERANÇA"`);
  // Formatação do modelo: só o NOME do(a) falecido(a) e a DATA numérica do
  // óbito em negrito — o corpo da qualificação póstuma é texto normal.
  p(
    `**${nomeFalecido}**, era ${qf?.nacionalidade?.trim() || 'brasileiro(a)'}, ${d.temSobrevivente ? (ehUniao ? 'convivente em união estável' : 'casado(a)') : estadoCivilDoFalecido(qf)}, ${qf?.profissao?.trim() || LACUNA}, RG. nº ${qf?.rg?.trim() || LACUNA} — inscrito(a) no CPF/MF sob nº ${d.falecido.cpf?.trim() || qf?.cpf?.trim() || LACUNA}, nascido(a) aos ${qf?.dataNascimento ? formatarData(qf.dataNascimento) : LACUNA}, filho(a) de ${qf?.filiacao?.trim() || LACUNA}, e residia na ${[qf?.endereco, qf?.complemento, qf?.bairro].filter((x) => x?.trim()).join(', ') || d.falecido.ultimoDomicilio?.trim() || LACUNA}${qf?.cidade?.trim() ? `, ${qf.cidade.trim()}${qf.uf?.trim() ? `/${qf.uf.trim()}` : ''}` : ''}${qf?.cep?.trim() ? ` (CEP. ${qf.cep.trim()})` : ''}. O falecimento ocorreu no dia ${d.falecido.dataObito ? `${dataPorExtenso(d.falecido.dataObito)} (**${formatarData(d.falecido.dataObito)}**)` : `${LACUNA} (___/___/_____)`}, ${d.falecido.localFalecimento?.trim() ? `no(a) ${d.falecido.localFalecimento.trim()}` : `no(a) ${LACUNA}, ${LACUNA}`}, conforme Certidão de Óbito ${d.falecido.certidaoObito?.trim() ? `extraída da ${d.falecido.certidaoObito.trim()}` : `extraída da matrícula nº ${LACUNA}, expedida pelo ORCPN ${LACUNA}º Subdistrito — ${LACUNA}, Município e Comarca de ${LACUNA}`}.`,
  );

  /* demais falecimentos — qualificação póstuma da FICHA da sucessão (item I);
   * campo vazio segue virando lacuna para o balcão */
  sucessoes.forEach((s, i) => {
    secao(`${ORDINAL[i + 1] ?? `${i + 2}º`} FALECIMENTO`);
    const q = s.qualificacao;
    const enderecoSu =
      [q?.endereco, q?.complemento, q?.bairro].filter((x) => x?.trim()).join(', ') || LACUNA;
    p(
      `**${s.nome.toUpperCase()}**, era ${q?.nacionalidade?.trim() || LACUNA}, ${q?.estadoCivil?.trim() || LACUNA}, ${q?.profissao?.trim() || LACUNA}, RG. nº ${q?.rg?.trim() || LACUNA} — inscrito(a) no CPF/MF sob nº ${q?.cpf?.trim() || LACUNA}, nascido(a) aos ${q?.dataNascimento ? formatarData(q.dataNascimento) : LACUNA}, filho(a) de ${q?.filiacao?.trim() || LACUNA}, e residia na ${enderecoSu}${q?.cidade?.trim() ? `, ${q.cidade.trim()}${q.uf?.trim() ? `/${q.uf.trim()}` : ''}` : ''}${q?.cep?.trim() ? ` (CEP. ${q.cep.trim()})` : ''}. O falecimento ocorreu no dia ${s.dataObito ? `${dataPorExtenso(s.dataObito)} (**${formatarData(s.dataObito)}**)` : `${LACUNA} (___/___/_____)`}, no(a) ${LACUNA}, conforme Certidão de Óbito extraída da matrícula nº ${LACUNA}, expedida pelo ORCPN ${LACUNA}.`,
    );
  });

  /* casamento/união — só com sobrevivente (sem ele, o estado civil já saiu
   * na qualificação póstuma, com a certidão respectiva) */
  if (d.temSobrevivente) {
    secao(ehUniao ? 'DA UNIÃO ESTÁVEL' : 'DO CASAMENTO');
    p(
      ehUniao
        ? `O(A) "autor(a) da herança" convivia em união estável, sob o regime da ${ROTULO_REGIME[d.regime]}${d.falecido.dataCasamento ? `, desde ${formatarData(d.falecido.dataCasamento)}` : `, desde ${LACUNA}`}, conforme ${d.falecido.certidaoCasamento?.trim() ? d.falecido.certidaoCasamento.trim() : `escritura/registro de união estável ${LACUNA}`}, com o(a) companheiro(a) supérstite, __${(d.nomeSobrev.trim() || LACUNA).toUpperCase()}__, já qualificado(a).`
        : `O(A) "autor(a) da herança" era casado(a) pelo regime da ${ROTULO_REGIME[d.regime]}${d.falecido.dataCasamento ? `, desde ${formatarData(d.falecido.dataCasamento)}` : `, desde ${LACUNA}`} — conforme Certidão de Casamento ${d.falecido.certidaoCasamento?.trim() ? `extraída da ${d.falecido.certidaoCasamento.trim()}` : `extraída da matrícula nº ${LACUNA}, expedida pelo ORCPN ${LACUNA}`} —, com o(a) cônjuge supérstite, __${(d.nomeSobrev.trim() || LACUNA).toUpperCase()}__, já qualificado(a).`,
    );
  }

  /* rol dos herdeiros — negrito sublinhado, como no modelo */
  secao('DOS HERDEIROS');
  // Formatação do modelo: NOME sublinhado (caixa alta) e o resto normal.
  const linhaVivos = vivos
    .map((h) => {
      const q = d.qualificacoes[h.id];
      const estado = q?.estadoCivil?.trim() || (q?.conjugeNome?.trim() ? 'casado(a)' : LACUNA);
      return `__${h.nome.toUpperCase()}__ (no estado civil de ${estado})`;
    })
    .join('; ');
  let relacao = `O(A) "autor(a) da herança" deixou, à época de seu passamento, os(as) seguintes herdeiros(as): ${linhaVivos || LACUNA}.`;
  if (preMortos.length > 0) {
    relacao += ` Cumpre consignar que deixou também herdeiro(s) pré-morto(s): ${preMortos
      .map((h) => `__${h.nome.toUpperCase()}__, falecido(a) em ${LACUNA}, conforme Certidão de Óbito extraída da matrícula nº ${LACUNA}`)
      .join('; ')} — sucedido(s) por representação, na forma dos arts. 1.851 a 1.856 do Código Civil.`;
  }
  p(relacao);

  /* renúncia — só com herdeiro renunciante (texto do modelo) */
  if (renunciantes.length > 0) {
    secao('DA RENÚNCIA À HERANÇA');
    for (const h of renunciantes) {
      p(
        `O(A) herdeiro(a) __${h.nome.toUpperCase()}__, anteriormente qualificado(a), me foi dito que, por motivos pessoais, não deseja concorrer a essa herança, conforme dispõem o parágrafo único do art. 1.804 e o art. 1.806 do Código Civil brasileiro, e **RENÚNCIA**, como de fato **RENUNCIADO** tem, à referida herança, sem importar qualquer condição ou termo.`,
      );
    }
  }

  secao('DA DISPOSIÇÃO DE ÚLTIMA VONTADE');
  p(
    cumuladas
      ? `Os "de cujus" não deixaram testamento, tendo sido apresentadas as informações negativas de existência de testamento expedidas pelo Colégio Notarial do Brasil — Seção de São Paulo, responsável pelo Registro Central de Testamentos do Estado de São Paulo, emitidas aos ${LACUNA}.`
      : `O(A) "de cujus" não deixou testamento, tendo sido apresentada a informação negativa de existência de testamento expedida pelo Colégio Notarial do Brasil — Seção de São Paulo, responsável pelo Registro Central de Testamentos do Estado de São Paulo, emitida aos ${LACUNA}.`,
  );

  /* patrimônio */
  secao('DO PATRIMÔNIO');
  if (d.bens.length === 0) {
    p(`O referido Espólio deixou os seguintes bens: ${LACUNA} (lançar o acervo na folha antes de gerar a minuta).`);
  } else {
    p(
      d.sobrepartilha
        ? 'O referido Espólio deixou, além dos bens mencionados na escritura de inventário e partilha, livre e desembaraçado de quaisquer dúvidas, ônus reais ou fiscais, os seguintes bens:'
        : cumuladas
          ? 'Os "autores das heranças" deixaram, livres e desembaraçados de quaisquer dúvidas, ônus reais ou fiscais, os seguintes bens:'
          : 'O referido Espólio deixou, livre e desembaraçado de quaisquer dúvidas, ônus reais ou fiscais, os seguintes bens:',
    );
    d.bens.forEach((b, i) => p(blocoBem(b, i, sucessoes)));
  }

  /* obrigações + inventariante — fórmula fixa do balcão */
  secao('DAS OBRIGAÇÕES');
  p(
    `Embora as partes desconheçam obrigações ativas ou passivas pendentes eventualmente deixadas ${cumuladas ? 'pelos(as) "autores(as) das heranças"' : 'pelo(a) "autor(a) da herança"'}, de comum acordo, nomeiam como **inventariante** ${cumuladas ? `dos Espólios de ${listaE(nomesFalecidos.map((n) => `__${n}__`))}` : `do Espólio de __${nomeFalecido}__`} o(a) Sr(a). ${inventariante ? `__**${inventariante.toUpperCase()}**__` : LACUNA}, já qualificado(a), conferindo-lhe poderes para representar ${cumuladas ? 'os espólios' : 'o espólio'} junto às repartições públicas e instituições financeiras, podendo liquidar, resgatar e encerrar contas, em juízo ou fora dele, praticar todos os atos de administração dos bens que possam eventualmente estar fora ${cumuladas ? 'destes inventários' : 'deste inventário'} e que serão objeto de futura sobrepartilha, nomear advogado, ingressar em juízo, ativa ou passivamente, e praticar todos os atos necessários à defesa ${cumuladas ? 'dos espólios' : 'do espólio'} e ao cumprimento de suas eventuais obrigações formais, tais como outorga de escritura de imóveis já vendidos e quitados, inclusive receber e dar quitação. O(A) nomeado(a) declara que aceita o encargo, prestando compromisso de cumprir eficazmente seu mister e comprometendo-se, desde já, a prestar contas aos possíveis interessados, se por eles solicitado.`,
  );

  secao('DA COLAÇÃO');
  p(
    'Pelo fato de o(a) autor(a) da herança não ter praticado atos "inter vivos" que avançassem a parte disponível ou adiantassem alguma legítima, não há bem a ser trazido à colação.',
  );

  if (cumuladas) {
    /* contas FUNDIDAS e por sucessão, como no modelo cumulado */
    secao('DO MONTE MOR E DAS LEGÍTIMAS');
    // Formatação do modelo cumulado: subtítulo da sucessão em NEGRITO +
    // SUBLINHADO, romanos em negrito e VALORES em negrito (extenso normal).
    const contas1 = [
      `**i)** o monte mor é representado pela totalidade dos bens, no valor de ${r ? `**${brl(r.acervo.massaPartilhavel)}**` : `R$ ${LACUNA}`}`,
    ];
    if (r?.meacao)
      contas1.push(`**ii)** a meação do(a) ${rotuloSupersMin} importa em **${brl(r.meacao.valor)}**`);
    contas1.push(
      `**${romano(contas1.length)})** a legítima dos herdeiros importa em ${r ? `**${brl(r.heranca.total)}**` : `R$ ${LACUNA}`}`,
    );
    p(`__**DA PRIMEIRA SUCESSÃO:**__ ${contas1.join('; ')}.`);
    sucessoes.forEach((s, i) => {
      p(
        `__**DA ${(ORDINAL_F[i + 1] ?? `${i + 2}ª`).toUpperCase()} SUCESSÃO (${s.nome.toUpperCase()}):**__ **i)** o monte mor é representado pela base transmitida nesta sucessão, no valor de **${brl(s.base.toFixed(2))}**; e, **ii)** a legítima dos herdeiros importa em **${brl(s.base.toFixed(2))}**.`,
      );
    });
  } else {
    secao('DO MONTE MOR');
    p(
      `O monte mor ${d.sobrepartilha ? 'da sobrepartilha ' : ''}é constituído pelos bens descritos no item "DO PATRIMÔNIO" e importa em ${r ? `**${brl(r.acervo.massaPartilhavel)}**` : `R$ ${LACUNA}`} (${LACUNA}).`,
    );
    if (r?.meacao) {
      secao('DA MEAÇÃO');
      p(`A meação do(a) ${rotuloSupersMin} importa em **${brl(r.meacao.valor)}** (${LACUNA}).`);
    }
    secao('DA LEGÍTIMA');
    p(`A(s) legítima(s) do(s) herdeiro(s) importa(m) em ${r ? `**${brl(r.heranca.total)}**` : `R$ ${LACUNA}`} (${LACUNA}).`);
  }

  /* ---------- ATO DISPOSITIVO (o coração): partilha ou adjudicação ---------- */
  let pagamento = 0;

  /** Linhas Patrimônio·Proporção·Valor de um quinhão — nunca sai vazia. */
  const linhasDoQuinhao = (q: QuinhaoSaida): { celulas: string[] }[] => {
    const linhas = d.bens
      .map((b, i) => {
        const fr = b.natureza === 'COMUM' ? q.fracaoBemComum : q.fracaoBemParticular;
        const n = fracaoParaNumero(fr);
        if (!fr || n === null) return null;
        return { celulas: [num2(i + 1), fr, brl((Number(b.valor) * n).toFixed(2))] };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);
    if (linhas.length > 0) return linhas;
    // Fallback: sem fração por bem calculada, a fração da HERANÇA incide
    // sobre cada bem — tabela sempre íntegra, nunca lacunas soltas.
    const n = fracaoParaNumero(q.fracaoHeranca) ?? 0;
    return d.bens.map((b, i) => ({
      celulas: [num2(i + 1), q.fracaoHeranca, brl((Number(b.valor) * n).toFixed(2))],
    }));
  };

  if (adjudicacao && r) {
    /* herdeiro único: ADJUDICAÇÃO em bloco, como nos modelos do balcão */
    secao('DA ADJUDICAÇÃO');
    const unico = r.quinhoes[0];
    // Formatação do modelo: herdeiro sublinhado, ADJUDICA/ADJUDICADO e o
    // valor em negrito — o corpo do dispositivo é texto normal.
    p(
      `Pela presente escritura e na melhor forma de direito, ressalvados eventuais erros, omissões e direitos de terceiros, por força de sua legítima, o(a) herdeiro(a) __${unico.nome.toUpperCase()}__, já identificado(a) e qualificado(a), **ADJUDICA**, como de fato **ADJUDICADO** tem, todo o acervo ${d.sobrepartilha ? 'ora sobrepartilhado' : 'inventariado'}, no valor de **${brl(unico.valor)}** (${LACUNA}), pelo valor individual de atribuição dos bens, a saber:`,
    );
    tabela([CABECA_PARTILHA, ...linhasDoQuinhao(unico)]);
  } else {
    secao(cumuladas ? 'DA PARTILHA DA 1ª SUCESSÃO' : 'DA PARTILHA');
    p(
      `Pela presente escritura e na melhor forma de direito, ressalvados eventuais erros, omissões e direitos de terceiros, ${partesRol}, já identificados e qualificados, avençam a ${d.sobrepartilha ? 'sobrepartilha' : 'partilha'} do patrimônio ${cumuladas ? 'transmitido na primeira sucessão' : 'do(a) "autor(a) da herança"'}, da seguinte forma:`,
    );

    if (d.diferenciada) {
      for (const pg of d.diferenciada.pagamentos) {
        // Formatação do modelo: "PRIMEIRO PAGAMENTO:" em negrito, o nome do
        // beneficiário sublinhado e o valor em negrito — corpo normal.
        p(
          `**${ordinal(pagamento)} PAGAMENTO:** é feito a __${pg.nome.toUpperCase()}__, que haverá, no valor total de **${brl(pg.valorRecebido)}** (${LACUNA}):`,
        );
        tabela([
          CABECA_PARTILHA,
          ...pg.itens.map((it) => ({
            celulas: [
              num2(it.numero),
              pctFmt(it.pct),
              brl(((Number(d.bens[it.numero - 1]?.valor ?? 0) * it.pct) / 100).toFixed(2)),
            ],
          })),
        ]);
        pagamento += 1;
      }
      /* tornas: cessão GRATUITA ganha seção própria com as declarações do
       * doador (modelo do balcão); reposição onerosa fica no parágrafo. */
      const gratuitas = d.diferenciada.tornas.filter((t) => t.titulo === 'GRATUITO');
      const onerosas = d.diferenciada.tornas.filter((t) => t.titulo !== 'GRATUITO');
      if (onerosas.length > 0) {
        p(
          `**DA TORNA:** em razão das atribuições acima, ${onerosas
            .map((t) => `__${t.de.toUpperCase()}__ repõe a __${t.para.toUpperCase()}__ a diferença de **${brl(t.valor)}**`)
            .join('; ')} — reposição onerosa, sujeita, quanto a imóveis, ao ITBI municipal —, o que as partes declaram e aceitam expressamente.`,
        );
      }
      if (gratuitas.length > 0) {
        secao('DA CESSÃO DA TORNA');
        for (const t of gratuitas) {
          p(
            `__${t.de.toUpperCase()}__, neste ato, CEDE, como de fato CEDIDO tem, a título gratuito, a quantia de **${brl(t.valor)}** (${LACUNA}) a __${t.para.toUpperCase()}__, quantia essa integralizada no pagamento de sua legítima, a título de torna. Ainda, pelo(a) ora cedente, foi dito e declarado, sob as penas da lei, o seguinte: **i)** dá a mais ampla, geral e irrevogável quitação, para nunca mais reclamar, em tempo e sob pretexto algum; **ii)** que esta liberalidade sai de sua parte disponível, ficando o(a) beneficiário(a) dispensado(a) de levá-la à colação; **iii)** que a liberalidade é feita inteiramente livre de cláusulas e condições resolutivas; e, **iv)** que é a ${LACUNA} liberalidade feita por ele(a) ao(à) beneficiário(a) no decurso deste ano civil. A cessão gratuita sujeita-se ao ITCMD de doação (Lei nº 10.705/2000), observada, quando cabível, a isenção do art. 6º, II, "a".`,
          );
        }
      }
    } else if (r) {
      /* 1º pagamento: a meação (bens meados, 1/2 de cada) */
      if (r.meacao) {
        p(
          `**${ordinal(pagamento)} PAGAMENTO:** é feito ao(à) ${rotuloSupersMin}, __${(d.nomeSobrev.trim() || LACUNA).toUpperCase()}__, que, para satisfação de sua meação no valor de **${brl(r.meacao.valor)}** (${LACUNA}), haverá a METADE IDEAL, ou seja, 50% (cinquenta por cento), de cada um dos bens adiante relacionados:`,
        );
        const bensMeados = d.bens.filter(
          (b) => d.regime === 'COMUNHAO_UNIVERSAL' || b.natureza === 'COMUM',
        );
        tabela([
          CABECA_PARTILHA,
          ...(bensMeados.length > 0 ? bensMeados : d.bens).map((b) => ({
            celulas: [num2(d.bens.indexOf(b) + 1), '1/2', brl((Number(b.valor) / 2).toFixed(2))],
          })),
        ]);
        pagamento += 1;
      }

      /* concorrência do sobrevivente (quinhão próprio), quando existir */
      const quinhaoSobrev = r.quinhoes.find((q) => q.papel === 'SOBREVIVENTE');
      if (quinhaoSobrev) {
        p(
          `**${ordinal(pagamento)} PAGAMENTO:** é feito ao(à) ${rotuloSupersMin}, __${quinhaoSobrev.nome.toUpperCase()}__, que, para satisfação de sua concorrência sucessória no valor de **${brl(quinhaoSobrev.valor)}** (${quinhaoSobrev.fracaoHeranca} da herança)${quinhaoSobrev.reservaUmQuartoAplicada ? ' — observada a reserva de 1/4 do art. 1.832 do Código Civil' : ''}, haverá:`,
        );
        tabela([CABECA_PARTILHA, ...linhasDoQuinhao(quinhaoSobrev)]);
        pagamento += 1;
      }

      /* herdeiros: quinhões IGUAIS saem num pagamento único, como no modelo */
      const quinhoesHerdeiros = r.quinhoes.filter((q) => q.papel !== 'SOBREVIVENTE');
      // Igualdade pelo QUINHÃO JURÍDICO (frações) — o rateio de centavos do
      // resíduo não pode separar pagamentos que são o mesmo direito.
      const iguais =
        quinhoesHerdeiros.length > 1 &&
        quinhoesHerdeiros.every(
          (q) =>
            q.fracaoHeranca === quinhoesHerdeiros[0].fracaoHeranca &&
            q.fracaoBemComum === quinhoesHerdeiros[0].fracaoBemComum &&
            q.fracaoBemParticular === quinhoesHerdeiros[0].fracaoBemParticular,
        );
      if (iguais) {
        const total = quinhoesHerdeiros.reduce((a, q) => a + Number(q.valor), 0);
        const nomes = quinhoesHerdeiros.map((q) => `__${q.nome.toUpperCase()}__`);
        const listaNomes =
          nomes.length > 1 ? `${nomes.slice(0, -1).join(', ')} e ${nomes[nomes.length - 1]}` : nomes[0];
        p(
          `**${ordinal(pagamento)} PAGAMENTO:** é feito aos herdeiros ${listaNomes}, que, para satisfação de suas legítimas no valor total de **${brl(total.toFixed(2))}** (${LACUNA}), __**cada um**__, haverá:`,
        );
        tabela([CABECA_PARTILHA, ...linhasDoQuinhao(quinhoesHerdeiros[0])]);
        pagamento += 1;
      } else {
        for (const q of quinhoesHerdeiros) {
          p(
            `**${ordinal(pagamento)} PAGAMENTO:** é feito a __${q.nome.toUpperCase()}__, que, para satisfação de ${q.papel === 'LEGATARIO' ? 'seu legado' : 'sua legítima'} no valor de **${brl(q.valor)}** (${q.fracaoHeranca} da herança)${q.reservaUmQuartoAplicada ? ' — observada a reserva de 1/4 do art. 1.832 do Código Civil' : ''}, haverá:`,
          );
          tabela([CABECA_PARTILHA, ...linhasDoQuinhao(q)]);
          pagamento += 1;
        }
      }
    } else {
      p(`Plano de partilha: ${LACUNA} (calcule o espelho na folha antes de gerar a minuta).`);
    }
  }

  /* sucessões cumuladas: UMA partilha POR sucessão, sobre a base transmitida
   * (a partilha sintética de "mesmos herdeiros" do item III) */
  sucessoes.forEach((s, i) => {
    secao(`DA PARTILHA DA ${i + 2}ª SUCESSÃO`);
    const rs = s.resultado && s.resultado.bloqueios.length === 0 ? s.resultado : null;
    if (!rs) {
      p(
        `Partilha da sucessão de ${s.nome.toUpperCase()}: ${LACUNA} (marque "mesmos herdeiros" na sucessão, no item I, para a partilha dela sair calculada — ou lance-a em caso próprio quando os herdeiros forem outros).`,
      );
      return;
    }
    p(
      `Pela presente escritura e na melhor forma de direito, ressalvados eventuais erros, omissões e direitos de terceiros, os herdeiros, já identificados e qualificados, avençam a partilha da base transmitida na sucessão de __${s.nome.toUpperCase()}__, da seguinte forma:`,
    );
    const qsu = rs.quinhoes;
    const iguaisSu = qsu.length > 1 && qsu.every((q) => q.fracaoHeranca === qsu[0].fracaoHeranca);
    if (iguaisSu) {
      const totalSu = qsu.reduce((a, q) => a + Number(q.valor), 0);
      p(
        `**PAGAMENTO ÚNICO:** é feito aos herdeiros ${listaE(qsu.map((q) => `__${q.nome.toUpperCase()}__`))}, que, para satisfação de suas legítimas no valor total de **${brl(totalSu.toFixed(2))}** (${LACUNA}), __**cada um**__, haverá a fração de ${qsu[0].fracaoHeranca} da base transmitida, no valor de **${brl(qsu[0].valor)}**.`,
      );
    } else {
      qsu.forEach((q, j) => {
        p(
          `**${ordinal(j)} PAGAMENTO:** é feito a __${q.nome.toUpperCase()}__, que, para satisfação de ${q.papel === 'LEGATARIO' ? 'seu legado' : 'sua legítima'}, haverá a fração de ${q.fracaoHeranca} da base transmitida, no valor de **${brl(q.valor)}**.`,
        );
      });
    }
  });

  /* carta de anuência — só com veículo no acervo */
  if (temVeiculo) {
    secao('DA CARTA DE ANUÊNCIA DO DETRAN');
    p(
      `Com relação ao(s) veículo(s), todos os contratantes, por esta escritura, decidem por realizar o registro desse(s) bem(ns) tão somente em nome do(a) Sr(a). ${LACUNA}, ficando, desde já, autorizadas as subsequentes transferências e os seus registros, servindo-se a presente como "Carta de Anuência", conforme instruções no portal do Departamento Estadual de Trânsito de São Paulo — Detran-SP (https://www.detran.sp.gov.br); sendo certo que, no futuro, esse(s) veículo(s) será(ão) livremente vendido(s) e o seu produto partilhado entre os herdeiros, segundo suas proporções aquisitivas.`,
    );
  }

  /* declaração do advogado — fórmula do balcão + advertência do art. 23 */
  secao('DO(A) ADVOGADO(A)');
  p(
    `Pelo(a) Dr(a). __**${LACUNA}**__, na qualidade de advogado(a) das partes, me foi dito que assessorou e aconselhou seus constituintes, bem como conferiu a correção ${cumuladas ? 'das partilhas' : adjudicacao ? 'da adjudicação' : d.sobrepartilha ? 'da sobrepartilha' : 'da partilha'} e seus valores de acordo com a vontade deles, na forma da lei — que, inclusive, estabelece que a transferência dos bens e direitos aos herdeiros ou legatários pode ser efetuada pelo valor constante na última Declaração de Bens e Direitos apresentada pelo(a) "de cujus" ou pelo valor de mercado, nos termos do art. 23 da Lei nº 9.532/1997 e do art. 10 da Instrução Normativa nº 81/2001 da Secretaria da Receita Federal. Deste modo, advertiu seus constituintes de que: (a) a opção por qualquer dos critérios de avaliação deve ser informada na Declaração Final de Espólio, sendo vedada a sua retificação; e (b) há possibilidade de eles virem a ser notificados pelo Fisco para pagamento de eventual imposto sobre ganho de capital, de que trata a Lei nº 8.981/1995, alterada pela Lei nº 13.259/2016.`,
  );

  /* declarações ulteriores — (c) união estável só com supérstite; item das
   * certidões de imóvel só com imóvel */
  secao('DAS DECLARAÇÕES ULTERIORES');
  const ulteriores = [
    `desconhecem a existência de outros herdeiros ${autorRef}`,
    'estão de acordo e aceitam a presente escritura em seus expressos termos e na forma redigida',
  ];
  if (d.temSobrevivente)
    ulteriores.push(
      `o(a) ${rotuloSupersMin} não mantém convivência pública, contínua e duradoura com o intuito de constituir família`,
    );
  if (temImovel)
    ulteriores.push(
      'os herdeiros declaram ter inequívoco conhecimento do inteiro teor das certidões de propriedade dos imóveis aqui tratados, quanto a eventuais ônus ou restrições, isentando esta Serventia de quaisquer responsabilidades neste sentido',
    );
  // Formatação do modelo: "Espólio de NOME" e as letras a) b) c) em negrito.
  p(
    `${partesRol.charAt(0).toUpperCase()}${partesRol.slice(1)} ${cumuladas ? `dos **Espólios de ${listaE(nomesFalecidos)}**` : `do **Espólio de ${nomeFalecido}**`}, sempre assistidos de seu(sua) advogado(a), Dr(a). **${LACUNA}**, declaram expressamente, sob as penas da lei, o seguinte: ${ulteriores
      .map((t, i) => `**${String.fromCharCode(97 + i)})** ${t}`)
      .join('; ')}.`,
  );

  /* título hábil — rogo do modelo, com o destinatário adaptado ao acervo */
  secao('DO TÍTULO HÁBIL');
  const destinatarios = [
    ...(temImovel ? ['ao Oficial do Registro Imobiliário competente'] : []),
    ...(temCreditoBancario ? ['aos gerentes das instituições bancárias'] : []),
    ...(temVeiculo ? ['ao Departamento Estadual de Trânsito'] : []),
  ];
  p(
    `Os outorgantes e reciprocamente outorgados rogam e autorizam as Autoridades competentes o cumprimento do presente${destinatarios.length > 0 ? `, em especial ${destinatarios.join(', ')},` : ','} a praticarem todos os atos que se fizerem necessários ao registro desta, a fim de que usem, utilizem e conservem os seus direitos na plenitude da lei. A presente Escritura Pública é dotada da mesma validade e eficácia jurídica atribuídas, por lei, ao Formal de Partilha e ao Alvará Judicial, como prescrito pelo art. 610, § 1º, do Código de Processo Civil (Lei nº 13.105/2015) e pelo art. 3º da Resolução nº 35/2007 do Conselho Nacional de Justiça, não dependendo de homologação judicial e constituindo título hábil para o registro civil e para a transferência de propriedade dos bens ${adjudicacao ? 'adjudicados' : d.sobrepartilha ? 'sobrepartilhados' : 'partilhados'}, bem como para o levantamento de valores, perante Oficiais de Registro, repartições públicas, instituições financeiras e concessionárias de serviços públicos.`,
  );
  if (temCreditoBancario) {
    p(
      'Ademais, em relação às instituições financeiras, fica ressalvado que os valores utilizados para fins de partilha são considerados conforme o período do óbito, em observância ao direito sucessório brasileiro, os quais são atribuídos com seus devidos acréscimos e atualizações, inexistindo óbice à liberação de quaisquer valores em conta/ativos financeiros que sejam de período posterior à data do fato gerador (o dia do óbito). Parágrafo único: os dirigentes dos bancos e instituições financeiras em geral também deverão autorizar, sob pena de incorrer, s.m.j., na tipificação do art. 168 do Código Penal ("apropriação indébita"), quaisquer saques e/ou transferências eletrônicas de eventuais diferenças que venham a ser contabilizadas nas contas supramencionadas, em decorrência dos "aniversários" dessas contas — diferenças essas a título de rendimentos dos valores até então declarados —, tudo em consonância com: (i) o art. 1.784 do Código Civil, que diz "aberta a sucessão, a herança transmite-se, desde logo, aos herdeiros legítimos e testamentários", combinado com (ii) o art. 29 do Decreto Estadual nº 46.655, de 01/04/2002, que preceitua caber aos Agentes Fiscais de Rendas investigar a existência de heranças sujeitas ao imposto, podendo, para esse fim, solicitar o exame de livros e informações junto aos bancos e instituições financeiras.',
    );
  }

  /* tributo — variante paga × isenta; óbito antigo leva a memória de
   * cálculo pela UFESP, como nos modelos ("base ÷ UFESP do óbito × UFESP
   * atual × 4% + acréscimos") */
  secao('DO TRIBUTO "CAUSA MORTIS"');
  const isento = d.provisao !== null && Number(d.provisao.imposto) === 0;
  const pv = d.provisao;
  p(
    isento
      ? `${cumuladas ? '**(i)** __do primeiro falecimento__: os' : 'Os'} herdeiros ficam ISENTOS do Tributo Causa-Mortis (DARE-ITCMD), face o que dispõe a alínea "${LACUNA}" do inciso I do art. 6º da Lei nº 10.705/2000, conforme resumo da declaração do ITCMD nº ${LACUNA}, arquivado nestas notas em pasta própria nº ${LACUNA}, às fls. ${LACUNA}, para os devidos fins e efeitos de direito.`
      : `${cumuladas ? '**(i)** __do primeiro falecimento__: as' : 'As'} partes apresentaram ${LACUNA} (${LACUNA}) guia(s) do imposto de transmissão "causa mortis" (DARE/ITCMD), no valor total de ${pv ? `**${brl(pv.total.toFixed(2))}**` : `R$ ${LACUNA}`}${memoriaUfesp(isento ? null : pv)}, devidamente recolhida(s), a(s) qual(is) fica(m) arquivada(s) nestas notas em pasta própria, para os devidos fins e efeitos de direito, nos termos da Declaração de Transmissão por Escritura Pública nº ${LACUNA}.`,
  );
  /* sucessões cumuladas: um recolhimento POR ÓBITO, cada qual com o próprio
   * fato gerador (e a memória da UFESP quando o óbito é antigo) */
  sucessoes.forEach((s, i) => {
    p(
      `**(${romano(i + 1)})** __da sucessão de ${s.nome.toUpperCase()}__: as partes apresentaram ${LACUNA} (${LACUNA}) guia(s) DARE/ITCMD, no valor total de ${s.provisao ? `**${brl(s.provisao.total.toFixed(2))}**` : `R$ ${LACUNA}`}${memoriaUfesp(s.provisao)}, devidamente recolhida(s) — fato gerador próprio: o óbito de ${s.dataObito ? formatarData(s.dataObito) : LACUNA}.`,
    );
  });

  /* cláusulas padrão de fechamento — ordem dos atos lavrados */
  secao('DA CERTIDÃO NEGATIVA DE DÉBITOS TRABALHISTAS — CNDT');
  p(
    'Atendendo à Recomendação nº 3 do Conselho Nacional de Justiça, datada de 15/03/2012, cientifico os contratantes, nesta data, da possibilidade de obtenção de certidões negativas de débitos trabalhistas — CNDT, expedidas gratuita e eletronicamente, nos termos da Lei nº 12.440/2011, diretamente no sítio do Tribunal Superior do Trabalho, no endereço: http://www.tst.jus.br.',
  );
  secao('DA CONSULTA À CENTRAL DE INDISPONIBILIDADE');
  p(
    `Este Tabelionato, nos termos do art. 6º, item III, da Lei nº 8.935/1994, e para cumprimento das normas da CGJ, faz constar neste ato notarial que, nesta data, procedeu junto ao site https://www.indisponibilidade.org.br da "Central de Indisponibilidade de Bens", criada pelo Provimento CGJ-SP nº 13/2012, prévia consulta à base de dados, obtendo o resultado "${LACUNA}" para ${cumuladas ? 'os CPFs dos' : 'o CPF do(a)'} "de cujus", conforme comprova(m) o(s) respectivo(s) código(s) HASH gerado(s) para essa(s) consulta(s): ${LACUNA}, dou fé.`,
  );
  secao('DOS DOCUMENTOS');
  p(
    `As partes, para os fins do art. 117 do Provimento nº 40/2012, apresentaram todos os documentos pertinentes para a lavratura da presente — inclusive a Declaração de Transmissão por Escritura Pública (DEPE) nº ${LACUNA} —, os quais foram arquivados nestas notas, em pasta própria nº ${LACUNA}, às fls. ${LACUNA}.`,
  );
  secao('DA MICROFILMAGEM');
  p('Nesta data, os documentos relacionados no item anterior foram microfilmados.');
  if (temImovel) {
    secao('DA DECLARAÇÃO DA RECEITA FEDERAL');
    p(
      'Que da presente é emitida à Secretaria da Receita Federal a Declaração sobre Operação Imobiliária (DOI), conforme Instrução Normativa vigente.',
    );
  }

  /* LGPD — cláusula padrão do modelo-mestre, sempre presente */
  secao('DO CONSENTIMENTO PARA TRATAMENTO DE DADOS PESSOAIS');
  p(
    'As partes foram cientificadas de que, de acordo com a Lei nº 6.015/1973, os dados pessoais constantes neste ato são públicos, mas, mesmo assim, dão seu expresso consentimento para a divulgação dos mesmos com a finalidade de emissão de certidões, segundas vias, envio aos órgãos fiscalizadores e para cumprimento de exigências legais e regimentais, conforme o art. 7º da Lei Geral de Proteção de Dados (LGPD).',
  );

  /* autenticidade — só nos atos eletrônicos, como nos modelos lavrados */
  if (d.modalidade !== 'PRESENCIAL') {
    secao('DA AUTENTICIDADE');
    p(
      'Nos termos do Provimento CNJ nº 149/2023, fica consignado, para validade, consulta e verificação da autenticidade deste ato notarial: (a) que a Matrícula Notarial Eletrônica — MNE serve como chave de identificação individualizada do presente escrito notarial; (b) "Consulte a validade deste ato notarial em: www.docautentico.com.br/valida"; e (c) que a MNE, a chave de acesso e o QR Code deste ato notarial constam do respectivo "Manifesto de Assinaturas", gerado na plataforma e-Notariado, e que integra o ato.',
    );
  }

  /* cláusulas adicionais das instruções do(a) escrevente (redação por IA) */
  for (const extra of d.clausulasExtras ?? []) {
    secao(extra.titulo.toUpperCase());
    for (const texto of extra.paragrafos) p(texto);
  }

  /* encerramento — variantes do modelo por modalidade + assinaturas,
   * selos ES/TR e emolumentos discriminados (sempre em lacunas) */
  secao('DO ENCERRAMENTO E ASSINATURAS');
  const encerramentoBase =
    'E, de como assim disseram, do que dou fé, a pedido lhes lavrei a presente, que, lida em voz alta, aceitam, outorgam e assinam, do que dou fé.';
  const lavratura = `Eu, ${LACUNA}, Escrevente Habilitado(a), a lavrei. Eu, ${LACUNA}, Tabelião(ã), a subscrevi.`;
  p(
    d.modalidade === 'PRESENCIAL'
      ? `${encerramentoBase} ${lavratura}`
      : d.modalidade === 'VIDEOCONFERENCIA'
        ? `${encerramentoBase} As partes assinam o presente instrumento digitalmente, através da plataforma e-Notariado, disponibilizada pelo Provimento CNJ nº 149/2023, do que dou fé. ${lavratura}`
        : `${encerramentoBase} ${d.partesRemotas.trim() || LACUNA} assina(m) o presente instrumento digitalmente, através da plataforma e-Notariado, disponibilizada pelo Provimento CNJ nº 149/2023, e as demais partes assinam fisicamente nesta Serventia, do que dou fé. ${lavratura}`,
  );
  p(`${LACUNA}, ${dataPorExtenso()}.`);

  // Linhas de assinatura FÍSICA: no ato por vídeo, só o(a) advogado(a) (as
  // partes assinam digitalmente); nos demais, todas as partes + advogado(a).
  const assinantes: string[] = [];
  if (d.modalidade !== 'VIDEOCONFERENCIA') {
    if (d.temSobrevivente) assinantes.push((d.nomeSobrev.trim() || LACUNA).toUpperCase());
    for (const h of vivos) assinantes.push(h.nome.toUpperCase());
    for (const h of renunciantes) assinantes.push(h.nome.toUpperCase());
  }
  assinantes.push(`Dr(a). ${LACUNA} — ADVOGADO(A)`);
  // Assinaturas como nos modelos: linha + nome em caixa alta SEM negrito.
  for (const nome of assinantes) {
    p('_________________________________________', { centrado: true });
    p(nome, { centrado: true });
  }
  p(`Selo: ${LACUNA}ES${LACUNA} · Selo: ${LACUNA}TR${LACUNA}`, { discreto: true });
  p(
    `EMOLS.: R$ ${LACUNA} · ESTADO: R$ ${LACUNA} · SEC. FAZ.: R$ ${LACUNA} · ISSQN: R$ ${LACUNA} · MP: R$ ${LACUNA} · REG. CIVIL: R$ ${LACUNA} · TRIB. JUSTIÇA: R$ ${LACUNA} · STA. CASA: R$ ${LACUNA} · TOTAL: R$ ${LACUNA}`,
    { discreto: true },
  );
  p(`Ao Cartório — R$ ${LACUNA}`, { discreto: true });

  // Formatação do MODELO: Tahoma, corpo 11pt, títulos centralizados em caixa.
  return montarDocxRico(blocos, { estilo: { fonte: 'Tahoma', tamanho: 22, tituloCentrado: true } });
}
