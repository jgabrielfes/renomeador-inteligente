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
}

/* ---------- helpers ---------- */

const pctFmt = (v: number) => `${v.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`;
const num2 = (n: number) => String(n).padStart(2, '0');
const numBr = (n: number) =>
  n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

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

/** Qualificação completa do cônjuge/convivente de um herdeiro. */
const conjugeDe = (q?: Qualificacao): string =>
  [
    (q?.conjugeNome?.trim() || LACUNA).toUpperCase(),
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
  const partes: string[] = [nome.toUpperCase(), q?.nacionalidade?.trim() || 'brasileiro(a)'];
  const estado = (q?.estadoCivil ?? '').toLowerCase();
  const convivente = q?.uniaoEstavel === true && !estado.includes('casad');
  const casado = !convivente && (Boolean(q?.conjugeNome?.trim()) || estado.includes('casad'));

  if (casado) {
    partes.push('maior e capaz', nucleo(q));
    if (q?.email?.trim()) partes.push(`e-mail: ${q.email.trim()}`);
    const vinculoConj = `casado(a) pelo regime da ${q?.casamentoRegime?.trim() || LACUNA}, em ${q?.casamentoData ? formatarData(q.casamentoData) : LACUNA} — (Certidão de Casamento ${certidaoCasamentoDe(q)})`;
    partes.push(
      comAssistencia
        ? `neste ato assistido(a) de seu(sua) cônjuge, ${conjugeDe(q)}, ${vinculoConj}`
        : `${vinculoConj}, com ${conjugeDe(q)}`,
    );
  } else if (convivente) {
    partes.push(q?.estadoCivil?.trim() || 'solteiro(a)', 'maior e capaz', nucleo(q));
    if (q?.email?.trim()) partes.push(`e-mail: ${q.email.trim()}`);
    partes.push(
      `convivente em união estável com ${conjugeDe(q)}${comAssistencia ? ', que comparece a este ato' : ''}`,
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

function blocoBem(b: Bem, i: number): string {
  const avaliacao = `DA AVALIAÇÃO: As partes atribuem para efeitos fiscais e de partilha o valor de ${brl(b.valor)} (${LACUNA});`;
  switch (b.tipo) {
    case 'IMOVEL': {
      const im = b.imovel ?? {};
      // Abre com a DESCRIÇÃO DA MATRÍCULA (averbações da especialidade
      // objetiva incluídas) — como no modelo: "1) DESCRIÇÃO IMÓVEL. FORMA…".
      const descricao = im.descricaoMatricula?.trim() || `${b.descricao.toUpperCase()} — descrição conforme a matrícula: ${LACUNA}`;
      return `${i + 1}) ${descricao}. FORMA DE AQUISIÇÃO: Havido pelo(a) "de cujus" por força do ${im.aquisicao?.trim() || `R.${LACUNA}`} da matrícula nº ${im.matricula?.trim() || LACUNA} do ${im.registroImoveis?.trim() || `${LACUNA}º Registro Imobiliário de ${LACUNA}`}. CADASTRO E VALOR VENAL: inscrito na Municipalidade de ${im.municipio?.trim() || LACUNA}, sob a inscrição cadastral / o contribuinte nº ${im.inscricaoCadastral?.trim() || LACUNA}, tendo recebido no exercício do falecimento (${im.exercicioObito?.trim() || LACUNA}) o valor venal de ${im.valorVenalObito ? brl(im.valorVenalObito) : `R$ ${LACUNA}`} (${LACUNA}) e no corrente exercício (${im.exercicioAtual?.trim() || LACUNA}) o valor venal de ${im.valorVenalAtual ? brl(im.valorVenalAtual) : `R$ ${LACUNA}`} (${LACUNA}). ${avaliacao}`;
    }
    case 'VEICULO': {
      const v = b.veiculo ?? {};
      return `${i + 1}) UM AUTOMÓVEL da Marca/Modelo: ${v.marcaModelo?.trim() || LACUNA} — Ano Fáb.: ${v.anoFabricacao?.trim() || LACUNA} — Ano Mod.: ${v.anoModelo?.trim() || LACUNA} — RENAVAM: ${v.renavam?.trim() || LACUNA} — Placa: ${v.placa?.trim() || LACUNA} — CHASSI: ${v.chassi?.trim() || LACUNA}. ${avaliacao}`;
    }
    case 'FINANCEIRO':
      return `${i + 1}) CRÉDITO no Banco ${LACUNA}, decorrente do saldo bancário em conta ${LACUNA} nº ${LACUNA}, agência nº ${LACUNA}, no valor de ${brl(b.valor)} (${LACUNA}) na data do óbito;`;
    case 'QUOTAS':
      return `${i + 1}) PARTICIPAÇÃO SOCIETÁRIA com ${LACUNA} quotas da empresa ${LACUNA}, inscrita no CNPJ/MF sob nº ${LACUNA}, com sede na ${LACUNA}. ${avaliacao}`;
    default:
      return `${i + 1}) ${b.descricao.toUpperCase()}. ${avaliacao}`;
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
  const nomeAto = adjudicacao ? 'ESCRITURA DE INVENTÁRIO E ADJUDICAÇÃO DE BENS' : 'ESCRITURA DE INVENTÁRIO E PARTILHA DE BENS';
  const partesRol = d.temSobrevivente ? `o(a) ${rotuloSupersMin} e os herdeiros` : 'os herdeiros';

  p(`MINUTA gerada pelo Sucessorista (${ROTULO_MODALIDADE[d.modalidade]}) — conferência do(a) escrevente/tabelião(ã) responsável é obrigatória; lacunas (______) aguardam os dados do ato.`, {
    centrado: true,
    discreto: true,
  });

  /* cabeçalho do modelo: título em retângulo + tabela-resumo */
  p(nomeAto, { centrado: true, negrito: true, moldura: true });
  const linhasResumo: { celulas: string[] }[] = [
    { celulas: ['Autor(a) da Herança:', `${nomeFalecido}.`] },
  ];
  if (d.temSobrevivente)
    linhasResumo.push({ celulas: [`${ehUniao ? 'Companheiro(a)' : 'Cônjuge'} Supérstite:`, `${(d.nomeSobrev.trim() || LACUNA).toUpperCase()}.`] });
  linhasResumo.push(
    { celulas: ['Herdeiros(as):', `${vivos.map((h) => h.nome).join('; ') || LACUNA}.`] },
    { celulas: ['Advogado(a):', `Dr(a). ${LACUNA}.`] },
    { celulas: ['Monte Mor:', r ? `${brl(r.acervo.massaPartilhavel)}.` : `R$ ${LACUNA}.`] },
  );
  if (r?.meacao) linhasResumo.push({ celulas: ['Meação:', `${brl(r.meacao.valor)}.`] });
  linhasResumo.push({ celulas: ['Legítima:', r ? `${brl(r.heranca.total)}.` : `R$ ${LACUNA}.`] });
  tabela(linhasResumo, COLS_RESUMO, 18);

  /* SAIBAM — abertura do modelo, com a variante da modalidade; fecha em
   * "a saber:" porque a qualificação dos comparecentes vem NA SEQUÊNCIA,
   * por papel, como nos atos lavrados. */
  const abertura = `SAIBAM todos os que virem esta pública escritura que, aos ${LACUNA} (${LACUNA}) dias do mês de ${LACUNA} (${LACUNA}) do ano de ${LACUNA} (${LACUNA}), nesta cidade e comarca de ${LACUNA}, Estado de ${LACUNA}`;
  const serventia = `neste ${LACUNA}º Tabelionato de Notas, instalado na ${LACUNA} — (CEP. ${LACUNA}), perante mim, Escrevente Notarial, e o(a) Tabelião(ã) que esta subscreve`;
  const fechoIntro = 'compareceram partes entre si, justas e convencionadas, como outorgantes e reciprocamente outorgados, a saber:';
  p(
    d.modalidade === 'PRESENCIAL'
      ? `${abertura}, em cartório, ${serventia}, ${fechoIntro}`
      : d.modalidade === 'VIDEOCONFERENCIA'
        ? `${abertura}, em VIDEOCONFERÊNCIA, nos termos do Provimento CNJ nº 149/2023, do Conselho Nacional de Justiça, e presencialmente ${serventia}, ${fechoIntro}`
        : `${abertura}, de forma HÍBRIDA — comparecendo por videoconferência, nos termos do Provimento CNJ nº 149/2023: ${d.partesRemotas.trim() || LACUNA}; e, presencialmente, as demais partes —, ${serventia}, ${fechoIntro}`,
    { negrito: true },
  );

  /* comparecentes por PAPEL — blocos rotulados, como nos modelos */
  if (d.temSobrevivente) {
    const qs = d.qualificacoes['__sobrevivente__'];
    p(
      `${rotuloSupers}: ${(d.nomeSobrev.trim() || LACUNA).toUpperCase()}, ${qs?.nacionalidade?.trim() || 'brasileiro(a)'}, ${ehUniao ? 'companheiro(a) supérstite' : 'viúvo(a)'} de ${nomeFalecido} — "autor(a) da herança" — (Certidão de Óbito ${d.falecido.certidaoObito?.trim() ? `extraída da ${d.falecido.certidaoObito.trim()}` : `extraída da matrícula nº ${LACUNA}, expedida pelo ORCPN ${LACUNA}`}), ${nucleo(qs)}${qs?.email?.trim() ? `, e-mail: ${qs.email.trim()}` : ''}, residente e domiciliado(a) na ${endereco(qs)};`,
      { negrito: true, sublinhado: true, tamanho: 21 },
    );
  }
  p('HERDEIROS:', { negrito: true });
  vivos.forEach((h, i) => {
    p(`${i + 1}) ${qualificarHerdeiro(h.nome, d.qualificacoes[h.id], temImovel)};`, {
      negrito: true,
      sublinhado: true,
      tamanho: 21,
    });
  });
  p(
    `ADVOGADO(A): Dr(a). ${LACUNA}, brasileiro(a), ${LACUNA}, inscrito(a) na OAB/${LACUNA} sob nº ${LACUNA} — inscrito(a) no CPF/MF sob nº ${LACUNA}, nascido(a) aos ${LACUNA}, filho(a) de ${LACUNA}, e-mail: ${LACUNA}, com escritório na ${LACUNA}; nomeado(a) pelos presentes, para o fim específico de assisti-los neste ato jurídico, bem como para eventuais retificações e ratificações que se fizerem necessárias.`,
    { negrito: true, sublinhado: true, tamanho: 21 },
  );

  secao('DAS IDENTIFICAÇÕES');
  p(`${d.temSobrevivente ? `O(A) ${rotuloSupersMin}, os herdeiros e o(a) advogado(a)` : 'Os herdeiros e o(a) advogado(a)'} foram identificados à vista dos documentos apresentados, nos originais, do que dou fé.`);

  /* requerimento nomeando o ato — fórmula das declarações preliminares */
  secao('DAS DECLARAÇÕES PRELIMINARES');
  p(
    `Por ${partesRol}, assistidos por seu(sua) advogado(a) nomeado(a), foi-me requerida a lavratura desta escritura de inventário e ${adjudicacao ? 'adjudicação' : 'partilha'} dos bens deixados pelo falecimento de ${nomeFalecido}, declarando o seguinte:`,
  );

  /* autor(a) da herança — qualificação póstuma completa + óbito + certidão */
  secao(`DO(A) "AUTOR(A) DA HERANÇA"`);
  p(
    `${nomeFalecido}, era ${qf?.nacionalidade?.trim() || 'brasileiro(a)'}, ${d.temSobrevivente ? (ehUniao ? 'convivente em união estável' : 'casado(a)') : estadoCivilDoFalecido(qf)}, ${qf?.profissao?.trim() || LACUNA}, RG. nº ${qf?.rg?.trim() || LACUNA} — inscrito(a) no CPF/MF sob nº ${d.falecido.cpf?.trim() || qf?.cpf?.trim() || LACUNA}, nascido(a) aos ${qf?.dataNascimento ? formatarData(qf.dataNascimento) : LACUNA}, filho(a) de ${qf?.filiacao?.trim() || LACUNA}, e residia na ${[qf?.endereco, qf?.complemento, qf?.bairro].filter((x) => x?.trim()).join(', ') || d.falecido.ultimoDomicilio?.trim() || LACUNA}${qf?.cidade?.trim() ? `, ${qf.cidade.trim()}${qf.uf?.trim() ? `/${qf.uf.trim()}` : ''}` : ''}${qf?.cep?.trim() ? ` (CEP. ${qf.cep.trim()})` : ''}. O falecimento ocorreu no dia ${d.falecido.dataObito ? `${dataPorExtenso(d.falecido.dataObito)} (${formatarData(d.falecido.dataObito)})` : `${LACUNA} (__/__/____)`}, ${d.falecido.localFalecimento?.trim() ? `no(a) ${d.falecido.localFalecimento.trim()}` : `no(a) ${LACUNA}, ${LACUNA}`}, conforme Certidão de Óbito ${d.falecido.certidaoObito?.trim() ? `extraída da ${d.falecido.certidaoObito.trim()}` : `extraída da matrícula nº ${LACUNA}, expedida pelo ORCPN ${LACUNA}º Subdistrito — ${LACUNA}, Município e Comarca de ${LACUNA}`}.`,
    { negrito: true },
  );

  /* casamento/união — só com sobrevivente (sem ele, o estado civil já saiu
   * na qualificação póstuma, com a certidão respectiva) */
  if (d.temSobrevivente) {
    secao(ehUniao ? 'DA UNIÃO ESTÁVEL' : 'DO CASAMENTO');
    p(
      ehUniao
        ? `O(A) "autor(a) da herança" convivia em união estável, sob o regime da ${ROTULO_REGIME[d.regime]}${d.falecido.dataCasamento ? `, desde ${formatarData(d.falecido.dataCasamento)}` : `, desde ${LACUNA}`}, conforme ${d.falecido.certidaoCasamento?.trim() ? d.falecido.certidaoCasamento.trim() : `escritura/registro de união estável ${LACUNA}`}, com o(a) companheiro(a) supérstite, ${(d.nomeSobrev.trim() || LACUNA).toUpperCase()}, já qualificado(a).`
        : `O(A) "autor(a) da herança" era casado(a) pelo regime da ${ROTULO_REGIME[d.regime]}${d.falecido.dataCasamento ? `, desde ${formatarData(d.falecido.dataCasamento)}` : `, desde ${LACUNA}`} — conforme Certidão de Casamento ${d.falecido.certidaoCasamento?.trim() ? `extraída da ${d.falecido.certidaoCasamento.trim()}` : `extraída da matrícula nº ${LACUNA}, expedida pelo ORCPN ${LACUNA}`} —, com o(a) cônjuge supérstite, ${(d.nomeSobrev.trim() || LACUNA).toUpperCase()}, já qualificado(a).`,
    );
  }

  /* rol dos herdeiros — negrito sublinhado, como no modelo */
  secao('DOS HERDEIROS');
  const linhaVivos = vivos
    .map((h) => {
      const q = d.qualificacoes[h.id];
      const estado = q?.estadoCivil?.trim() || (q?.conjugeNome?.trim() ? 'casado(a)' : LACUNA);
      return `${h.nome.toUpperCase()} (no estado civil de ${estado})`;
    })
    .join('; ');
  let relacao = `O(A) "autor(a) da herança" deixou, à época de seu passamento, os(as) seguintes herdeiros(as): ${linhaVivos || LACUNA}.`;
  if (preMortos.length > 0) {
    relacao += ` Cumpre consignar que deixou também herdeiro(s) pré-morto(s): ${preMortos
      .map((h) => `${h.nome.toUpperCase()}, falecido(a) em ${LACUNA}, conforme Certidão de Óbito extraída da matrícula nº ${LACUNA}`)
      .join('; ')} — sucedido(s) por representação, na forma dos arts. 1.851 a 1.856 do Código Civil.`;
  }
  p(relacao, { negrito: true, sublinhado: true });

  /* renúncia — só com herdeiro renunciante (texto do modelo) */
  if (renunciantes.length > 0) {
    secao('DA RENÚNCIA À HERANÇA');
    for (const h of renunciantes) {
      p(
        `O(A) herdeiro(a) ${h.nome.toUpperCase()}, anteriormente qualificado(a), me foi dito que, por motivos pessoais, não deseja concorrer a essa herança, conforme dispõem o parágrafo único do art. 1.804 e o art. 1.806 do Código Civil brasileiro, e RENÚNCIA, como de fato RENUNCIADO tem, à referida herança, sem importar qualquer condição ou termo.`,
      );
    }
  }

  secao('DA DISPOSIÇÃO DE ÚLTIMA VONTADE');
  p(
    `O(A) "de cujus" não deixou testamento, tendo sido apresentada a informação negativa de existência de testamento expedida pelo Colégio Notarial do Brasil — Seção de São Paulo, responsável pelo Registro Central de Testamentos do Estado de São Paulo, emitida aos ${LACUNA}.`,
  );

  /* patrimônio */
  secao('DO PATRIMÔNIO');
  if (d.bens.length === 0) {
    p(`O referido Espólio deixou os seguintes bens: ${LACUNA} (lançar o acervo na folha antes de gerar a minuta).`);
  } else {
    p('O referido Espólio deixou, livre e desembaraçado de quaisquer dúvidas, ônus reais ou fiscais, os seguintes bens:');
    d.bens.forEach((b, i) => p(blocoBem(b, i)));
  }

  /* obrigações + inventariante — fórmula fixa do balcão */
  secao('DAS OBRIGAÇÕES');
  p(
    `Embora as partes desconheçam obrigações ativas ou passivas pendentes eventualmente deixadas pelo(a) "autor(a) da herança", de comum acordo, nomeiam como inventariante do Espólio de ${nomeFalecido} o(a) Sr(a). ${inventariante ? inventariante.toUpperCase() : LACUNA}, já qualificado(a), conferindo-lhe poderes para representar o espólio junto às repartições públicas e instituições financeiras, podendo liquidar, resgatar e encerrar contas, em juízo ou fora dele, praticar todos os atos de administração dos bens que possam eventualmente estar fora deste inventário e que serão objeto de futura sobrepartilha, nomear advogado, ingressar em juízo, ativa ou passivamente, e praticar todos os atos necessários à defesa do espólio e ao cumprimento de suas eventuais obrigações formais, tais como outorga de escritura de imóveis já vendidos e quitados, inclusive receber e dar quitação. O(A) nomeado(a) declara que aceita o encargo, prestando compromisso de cumprir eficazmente seu mister e comprometendo-se, desde já, a prestar contas aos possíveis interessados, se por eles solicitado.`,
  );

  secao('DA COLAÇÃO');
  p(
    'Pelo fato de o(a) autor(a) da herança não ter praticado atos "inter vivos" que avançassem a parte disponível ou adiantassem alguma legítima, não há bem a ser trazido à colação.',
  );

  secao('DO MONTE MOR');
  p(
    `O monte mor é constituído pelos bens descritos no item "DO PATRIMÔNIO" e importa em ${r ? brl(r.acervo.massaPartilhavel) : `R$ ${LACUNA}`} (${LACUNA}).`,
  );
  if (r?.meacao) {
    secao('DA MEAÇÃO');
    p(`A meação do(a) ${rotuloSupersMin} importa em ${brl(r.meacao.valor)} (${LACUNA}).`);
  }
  secao('DA LEGÍTIMA');
  p(`A(s) legítima(s) do(s) herdeiro(s) importa(m) em ${r ? brl(r.heranca.total) : `R$ ${LACUNA}`} (${LACUNA}).`);

  /* ---------- ATO DISPOSITIVO (o coração): partilha ou adjudicação ---------- */
  const ordinal = (n: number) =>
    ['PRIMEIRO', 'SEGUNDO', 'TERCEIRO', 'QUARTO', 'QUINTO', 'SEXTO', 'SÉTIMO', 'OITAVO', 'NONO', 'DÉCIMO'][n] ?? `${n + 1}º`;
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
    p(
      `Pela presente escritura e na melhor forma de direito, ressalvados eventuais erros, omissões e direitos de terceiros, por força de sua legítima, o(a) herdeiro(a) ${unico.nome.toUpperCase()}, já identificado(a) e qualificado(a), ADJUDICA, como de fato ADJUDICADO tem, todo o acervo inventariado, no valor de ${brl(unico.valor)} (${LACUNA}), pelo valor individual de atribuição dos bens, a saber:`,
      { negrito: true },
    );
    tabela([CABECA_PARTILHA, ...linhasDoQuinhao(unico)]);
  } else {
    secao('DA PARTILHA');
    p(
      `Pela presente escritura e na melhor forma de direito, ressalvados eventuais erros, omissões e direitos de terceiros, ${partesRol}, já identificados e qualificados, avençam a partilha do patrimônio do(a) "autor(a) da herança", da seguinte forma:`,
    );

    if (d.diferenciada) {
      for (const pg of d.diferenciada.pagamentos) {
        p(
          `${ordinal(pagamento)} PAGAMENTO: é feito a ${pg.nome.toUpperCase()}, que haverá, no valor total de ${brl(pg.valorRecebido)} (${LACUNA}):`,
          { negrito: true },
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
          `DA TORNA: em razão das atribuições acima, ${onerosas
            .map((t) => `${t.de.toUpperCase()} repõe a ${t.para.toUpperCase()} a diferença de ${brl(t.valor)}`)
            .join('; ')} — reposição onerosa, sujeita, quanto a imóveis, ao ITBI municipal —, o que as partes declaram e aceitam expressamente.`,
        );
      }
      if (gratuitas.length > 0) {
        secao('DA CESSÃO DA TORNA');
        for (const t of gratuitas) {
          p(
            `${t.de.toUpperCase()}, neste ato, CEDE, como de fato CEDIDO tem, a título gratuito, a quantia de ${brl(t.valor)} (${LACUNA}) a ${t.para.toUpperCase()}, quantia essa integralizada no pagamento de sua legítima, a título de torna. Ainda, pelo(a) ora cedente, foi dito e declarado, sob as penas da lei, o seguinte: (i) dá a mais ampla, geral e irrevogável quitação, para nunca mais reclamar, em tempo e sob pretexto algum; (ii) que esta liberalidade sai de sua parte disponível, ficando o(a) beneficiário(a) dispensado(a) de levá-la à colação; (iii) que a liberalidade é feita inteiramente livre de cláusulas e condições resolutivas; e (iv) que é a ${LACUNA} liberalidade feita por ele(a) ao(à) beneficiário(a) no decurso deste ano civil. A cessão gratuita sujeita-se ao ITCMD de doação (Lei nº 10.705/2000), observada, quando cabível, a isenção do art. 6º, II, "a".`,
          );
        }
      }
    } else if (r) {
      /* 1º pagamento: a meação (bens meados, 1/2 de cada) */
      if (r.meacao) {
        p(
          `${ordinal(pagamento)} PAGAMENTO: é feito ao(à) ${rotuloSupersMin}, ${(d.nomeSobrev.trim() || LACUNA).toUpperCase()}, que, para satisfação de sua meação no valor de ${brl(r.meacao.valor)} (${LACUNA}), haverá a metade ideal, ou seja, 50% (cinquenta por cento), de cada um dos bens adiante relacionados:`,
          { negrito: true },
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
          `${ordinal(pagamento)} PAGAMENTO: é feito ao(à) ${rotuloSupersMin}, ${quinhaoSobrev.nome.toUpperCase()}, que, para satisfação de sua concorrência sucessória no valor de ${brl(quinhaoSobrev.valor)} (${quinhaoSobrev.fracaoHeranca} da herança)${quinhaoSobrev.reservaUmQuartoAplicada ? ' — observada a reserva de 1/4 do art. 1.832 do Código Civil' : ''}, haverá:`,
          { negrito: true },
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
        const nomes = quinhoesHerdeiros.map((q) => q.nome.toUpperCase());
        const listaNomes =
          nomes.length > 1 ? `${nomes.slice(0, -1).join(', ')} e ${nomes[nomes.length - 1]}` : nomes[0];
        p(
          `${ordinal(pagamento)} PAGAMENTO: é feito aos herdeiros ${listaNomes}, que, para satisfação de suas legítimas no valor total de ${brl(total.toFixed(2))} (${LACUNA}), cada um, haverá:`,
          { negrito: true },
        );
        tabela([CABECA_PARTILHA, ...linhasDoQuinhao(quinhoesHerdeiros[0])]);
        pagamento += 1;
      } else {
        for (const q of quinhoesHerdeiros) {
          p(
            `${ordinal(pagamento)} PAGAMENTO: é feito a ${q.nome.toUpperCase()}, que, para satisfação de ${q.papel === 'LEGATARIO' ? 'seu legado' : 'sua legítima'} no valor de ${brl(q.valor)} (${q.fracaoHeranca} da herança)${q.reservaUmQuartoAplicada ? ' — observada a reserva de 1/4 do art. 1.832 do Código Civil' : ''}, haverá:`,
            { negrito: true },
          );
          tabela([CABECA_PARTILHA, ...linhasDoQuinhao(q)]);
          pagamento += 1;
        }
      }
    } else {
      p(`Plano de partilha: ${LACUNA} (calcule o espelho na folha antes de gerar a minuta).`);
    }
  }

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
    `Pelo(a) Dr(a). ${LACUNA}, na qualidade de advogado(a) das partes, me foi dito que assessorou e aconselhou seus constituintes, bem como conferiu a correção da ${adjudicacao ? 'adjudicação' : 'partilha'} e seus valores de acordo com a vontade deles, na forma da lei — que, inclusive, estabelece que a transferência dos bens e direitos aos herdeiros ou legatários pode ser efetuada pelo valor constante na última Declaração de Bens e Direitos apresentada pelo(a) "de cujus" ou pelo valor de mercado, nos termos do art. 23 da Lei nº 9.532/1997 e do art. 10 da Instrução Normativa nº 81/2001 da Secretaria da Receita Federal. Deste modo, advertiu seus constituintes de que: (a) a opção por qualquer dos critérios de avaliação deve ser informada na Declaração Final de Espólio, sendo vedada a sua retificação; e (b) há possibilidade de eles virem a ser notificados pelo Fisco para pagamento de eventual imposto sobre ganho de capital, de que trata a Lei nº 8.981/1995, alterada pela Lei nº 13.259/2016.`,
  );

  /* declarações ulteriores — (c) união estável só com supérstite; item das
   * certidões de imóvel só com imóvel */
  secao('DAS DECLARAÇÕES ULTERIORES');
  const ulteriores = [
    'desconhecem a existência de outros herdeiros do(a) "autor(a) da herança"',
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
  p(
    `${partesRol.charAt(0).toUpperCase()}${partesRol.slice(1)} do Espólio de ${nomeFalecido}, sempre assistidos de seu(sua) advogado(a), Dr(a). ${LACUNA}, declaram expressamente, sob as penas da lei, o seguinte: ${ulteriores
      .map((t, i) => `(${String.fromCharCode(97 + i)}) ${t}`)
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
    `Os outorgantes e reciprocamente outorgados rogam e autorizam as Autoridades competentes o cumprimento do presente${destinatarios.length > 0 ? `, em especial ${destinatarios.join(', ')},` : ','} a praticarem todos os atos que se fizerem necessários ao registro desta, a fim de que usem, utilizem e conservem os seus direitos na plenitude da lei. A presente Escritura Pública é dotada da mesma validade e eficácia jurídica atribuídas, por lei, ao Formal de Partilha e ao Alvará Judicial, como prescrito pelo art. 610, § 1º, do Código de Processo Civil (Lei nº 13.105/2015) e pelo art. 3º da Resolução nº 35/2007 do Conselho Nacional de Justiça, não dependendo de homologação judicial e constituindo título hábil para o registro civil e para a transferência de propriedade dos bens ${adjudicacao ? 'adjudicados' : 'partilhados'}, bem como para o levantamento de valores, perante Oficiais de Registro, repartições públicas, instituições financeiras e concessionárias de serviços públicos.`,
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
  const memoriaUfesp =
    pv && !isento && pv.ufespAtualizacao > pv.ufespObito
      ? ` (correspondente a ${brl((pv.baseEmUfesps * pv.ufespObito).toFixed(2))} ÷ R$ ${numBr(pv.ufespObito)} — UFESP do exercício do óbito — × R$ ${numBr(pv.ufespAtualizacao)} — UFESP de ${pv.anoAtualizacao} — × 4%, com os acréscimos legais)`
      : '';
  p(
    isento
      ? `Os herdeiros ficam ISENTOS do Tributo Causa-Mortis (DARE-ITCMD), face o que dispõe a alínea "${LACUNA}" do inciso I do art. 6º da Lei nº 10.705/2000, conforme resumo da declaração do ITCMD nº ${LACUNA}, arquivado nestas notas em pasta própria nº ${LACUNA}, às fls. ${LACUNA}, para os devidos fins e efeitos de direito.`
      : `As partes apresentaram ${LACUNA} (${LACUNA}) guia(s) do imposto de transmissão "causa mortis" (DARE/ITCMD), no valor total de ${pv ? brl(pv.total.toFixed(2)) : `R$ ${LACUNA}`}${memoriaUfesp}, devidamente recolhida(s), a(s) qual(is) fica(m) arquivada(s) nestas notas em pasta própria, para os devidos fins e efeitos de direito, nos termos da Declaração de Transmissão por Escritura Pública nº ${LACUNA}.`,
  );

  /* cláusulas padrão de fechamento — ordem dos atos lavrados */
  secao('DA CERTIDÃO NEGATIVA DE DÉBITOS TRABALHISTAS — CNDT');
  p(
    'Atendendo à Recomendação nº 3 do Conselho Nacional de Justiça, datada de 15/03/2012, cientifico os contratantes, nesta data, da possibilidade de obtenção de certidões negativas de débitos trabalhistas — CNDT, expedidas gratuita e eletronicamente, nos termos da Lei nº 12.440/2011, diretamente no sítio do Tribunal Superior do Trabalho, no endereço: http://www.tst.jus.br.',
  );
  secao('DA CONSULTA À CENTRAL DE INDISPONIBILIDADE');
  p(
    `Este Tabelionato, nos termos do art. 6º, item III, da Lei nº 8.935/1994, e para cumprimento das normas da CGJ, faz constar neste ato notarial que, nesta data, procedeu junto ao site https://www.indisponibilidade.org.br da "Central de Indisponibilidade de Bens", criada pelo Provimento CGJ-SP nº 13/2012, prévia consulta à base de dados, obtendo o resultado "${LACUNA}" para o CPF do(a) "de cujus", conforme comprova(m) o(s) respectivo(s) código(s) HASH gerado(s) para essa(s) consulta(s): ${LACUNA}, dou fé.`,
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
  for (const nome of assinantes) {
    p('_________________________________________', { centrado: true });
    p(nome, { centrado: true, negrito: true });
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
