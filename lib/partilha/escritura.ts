/**
 * Minuta da ESCRITURA de inventário e partilha — perfil Escrevente Notarial.
 *
 * Gerada sobre o MODELO REAL do balcão (v2) e NA FORMATAÇÃO DELE: fonte
 * Tahoma, corpo justificado, cada TÍTULO DE CLÁUSULA dentro de um RETÂNGULO
 * (moldura de parágrafo), tabela-resumo na abertura (Autor · Cônjuge ·
 * Herdeiros · Advogado · Monte Mor · Meação · Legítima) e a PARTILHA em
 * tabelas Patrimônio · Proporção · Valor, uma por pagamento. A identificação
 * do tabelionato, do escrevente e do tabelião fica SEMPRE em branco (______).
 *
 * Preenchimento DETERMINÍSTICO e condicional à folha:
 * - Introdução e encerramento por MODALIDADE (presencial · videoconferência
 *   e-Notariado · híbrida), como as variantes "Se presencial/Se por
 *   videoconferência" do modelo.
 * - Autor da herança com local do falecimento e certidão de óbito; estado
 *   civil com a certidão de casamento; RENÚNCIA (arts. 1.804/1.806 CC) só
 *   com herdeiro renunciante.
 * - Qualificação completa das partes nas variantes do modelo (viúvo(a) do
 *   autor da herança · solteiro com certidão de nascimento · casado com o
 *   cônjuge qualificado + data/regime/certidão · divorciado com averbação).
 * - IMÓVEL abre com a DESCRIÇÃO DA MATRÍCULA (com averbações da
 *   especialidade objetiva), forma de aquisição, cadastro e valores venais
 *   do exercício do óbito e do corrente, e a avaliação das partes.
 * - PARTILHA (o coração): 1º pagamento a meação com a tabela dos bens
 *   meados; herdeiros com quinhões IGUAIS saem num pagamento único ("cada
 *   um, haverá") como no modelo; quinhões desiguais saem um pagamento por
 *   herdeiro; partilha diferenciada usa a matriz. Nenhuma tabela sai vazia:
 *   sem fração por bem, a linha usa a fração da herança sobre cada bem.
 * - Detran só com veículo; parágrafo bancário (art. 168 CP) só com crédito;
 *   tributo pago × isento; LGPD e autenticidade sempre.
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
}

/* ---------- helpers ---------- */

const pctFmt = (v: number) => `${v.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`;
const num2 = (n: number) => String(n).padStart(2, '0');

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

/**
 * Qualificação de HERDEIRO nas variantes do modelo: solteiro (com certidão
 * de nascimento), casado (cônjuge completo + data/regime/certidão) ou
 * divorciado (averbação na certidão de casamento).
 */
function qualificarHerdeiro(nome: string, q?: Qualificacao): string {
  const partes: string[] = [nome.toUpperCase(), q?.nacionalidade?.trim() || 'brasileiro(a)'];
  const estado = (q?.estadoCivil ?? '').toLowerCase();
  const casado = Boolean(q?.conjugeNome?.trim()) || estado.includes('casad');

  if (casado) {
    partes.push('maior e capaz', nucleo(q));
    if (q?.email?.trim()) partes.push(`e-mail: ${q.email.trim()}`);
    const conj = [
      (q?.conjugeNome?.trim() || LACUNA).toUpperCase(),
      q?.conjugeNacionalidade?.trim() || 'brasileiro(a)',
      q?.conjugeProfissao?.trim() || `profissão ${LACUNA}`,
      `RG. nº ${q?.conjugeRg?.trim() || LACUNA}`,
      `inscrito(a) no CPF/MF sob nº ${q?.conjugeCpf?.trim() || LACUNA}`,
      `nascido(a) aos ${q?.conjugeDataNascimento ? formatarData(q.conjugeDataNascimento) : LACUNA}`,
      `filho(a) de ${q?.conjugeFiliacao?.trim() || LACUNA}`,
    ].join(', ');
    partes.push(
      `casado(a) pelo regime da ${q?.casamentoRegime?.trim() || LACUNA}, em ${q?.casamentoData ? formatarData(q.casamentoData) : LACUNA}, com ${conj} - (Certidão de Casamento ${q?.casamentoCertidao?.trim() ? `extraída da ${q.casamentoCertidao.trim()}` : `extraída da matrícula nº ${LACUNA}, expedida pelo ORCPN ${LACUNA}`})`,
    );
  } else if (estado.includes('divorc')) {
    partes.push('maior e capaz', nucleo(q));
    partes.push(
      `divorciado(a) - conforme averbação constante em sua Certidão de Casamento ${q?.casamentoCertidao?.trim() ? `extraída da ${q.casamentoCertidao.trim()}` : `extraída da matrícula nº ${LACUNA}, expedida pelo ORCPN ${LACUNA}`}`,
    );
    if (q?.email?.trim()) partes.push(`e-mail: ${q.email.trim()}`);
  } else {
    partes.push(q?.estadoCivil?.trim() || 'solteiro(a)', 'maior e capaz', nucleo(q));
    partes.push(`conforme Certidão de Nascimento extraída da matrícula nº ${LACUNA}, expedida pelo ORCPN ${LACUNA}`);
    if (q?.email?.trim()) partes.push(`e-mail: ${q.email.trim()}`);
  }
  partes.push(`residente e domiciliado(a) na ${endereco(q)}`);
  return partes.join(', ');
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

  p(`MINUTA gerada pelo Sucessorista (${ROTULO_MODALIDADE[d.modalidade]}) — conferência do(a) escrevente/tabelião(ã) responsável é obrigatória; lacunas (______) aguardam os dados do ato.`, {
    centrado: true,
    discreto: true,
  });

  /* cabeçalho do modelo: título em retângulo + tabela-resumo */
  p('ESCRITURA DE INVENTÁRIO E PARTILHA DE BENS', { centrado: true, negrito: true, moldura: true });
  const linhasResumo: { celulas: string[] }[] = [
    { celulas: ['Autor(a) da Herança:', `${nomeFalecido}.`] },
  ];
  if (d.temSobrevivente)
    linhasResumo.push({ celulas: ['Cônjuge Supérstite:', `${(d.nomeSobrev.trim() || LACUNA).toUpperCase()}.`] });
  linhasResumo.push(
    { celulas: ['Herdeiros(as):', `${vivos.map((h) => h.nome).join('; ') || LACUNA}.`] },
    { celulas: ['Advogado(a):', `Dr(a). ${LACUNA}.`] },
    { celulas: ['Monte Mor:', r ? `${brl(r.acervo.massaPartilhavel)}.` : `R$ ${LACUNA}.`] },
  );
  if (r?.meacao) linhasResumo.push({ celulas: ['Meação:', `${brl(r.meacao.valor)}.`] });
  linhasResumo.push({ celulas: ['Legítima:', r ? `${brl(r.heranca.total)}.` : `R$ ${LACUNA}.`] });
  tabela(linhasResumo, COLS_RESUMO, 18);

  /* introdução — variantes do modelo por modalidade */
  secao('INTRODUÇÃO');
  const abertura = `SAIBAM todos os que virem esta pública escritura que, aos ${LACUNA} (${LACUNA}) dias do mês de ${LACUNA} (${LACUNA}) do ano de ${LACUNA} (${LACUNA}), nesta cidade e comarca de ${LACUNA}, Estado de ${LACUNA}`;
  const serventia = `neste ${LACUNA}º Tabelionato de Notas, instalado na ${LACUNA} — (CEP. ${LACUNA}), perante mim, Escrevente Notarial, e o(a) Tabelião(ã) que esta subscreve`;
  const fechoIntro = `compareceram partes entre si, justas e convencionadas, assistidas por seu(sua) advogado(a), as quais me solicitaram a lavratura desta Escritura de Inventário e Partilha de Bens do Espólio de ${nomeFalecido}, declarando o seguinte:`;
  p(
    d.modalidade === 'PRESENCIAL'
      ? `${abertura}, ${serventia}, ${fechoIntro}`
      : d.modalidade === 'VIDEOCONFERENCIA'
        ? `${abertura}, em VIDEOCONFERÊNCIA, nos termos do Provimento CNJ nº 149/2023, ${serventia}, ${fechoIntro}`
        : `${abertura}, de forma HÍBRIDA — comparecendo por videoconferência, nos termos do Provimento CNJ nº 149/2023: ${d.partesRemotas.trim() || LACUNA}; e, presencialmente, as demais partes —, ${serventia}, ${fechoIntro}`,
    { negrito: true },
  );

  /* autor(a) da herança — texto do modelo com a ficha completa */
  secao(`DO(A) "AUTOR(A) DA HERANÇA"`);
  p(
    `${nomeFalecido}, era ${qf?.nacionalidade?.trim() || 'brasileiro(a)'}, ${qf?.profissao?.trim() || LACUNA}, RG. nº ${qf?.rg?.trim() || LACUNA} — inscrito(a) no CPF/MF sob nº ${d.falecido.cpf?.trim() || qf?.cpf?.trim() || LACUNA}, nascido(a) aos ${qf?.dataNascimento ? formatarData(qf.dataNascimento) : LACUNA}, filho(a) de ${qf?.filiacao?.trim() || LACUNA}, e residia na ${[qf?.endereco, qf?.complemento, qf?.bairro].filter((x) => x?.trim()).join(', ') || d.falecido.ultimoDomicilio?.trim() || LACUNA}${qf?.cidade?.trim() ? `, ${qf.cidade.trim()}${qf.uf?.trim() ? `/${qf.uf.trim()}` : ''}` : ''}${qf?.cep?.trim() ? ` (CEP. ${qf.cep.trim()})` : ''}. O falecimento ocorreu no dia ${d.falecido.dataObito ? `${dataPorExtenso(d.falecido.dataObito)} (${formatarData(d.falecido.dataObito)})` : `${LACUNA} (__/__/____)`}, ${d.falecido.localFalecimento?.trim() ? `no(a) ${d.falecido.localFalecimento.trim()}` : `no Hospital ${LACUNA}, ${LACUNA}/SP`}, conforme Certidão de Óbito ${d.falecido.certidaoObito?.trim() ? `extraída da ${d.falecido.certidaoObito.trim()}` : `extraída da matrícula nº ${LACUNA}, expedida pelo ORCPN ${LACUNA}º Subdistrito — ${LACUNA}, Município e Comarca de ${LACUNA}`}.`,
    { negrito: true },
  );

  /* estado civil — texto do modelo com a certidão de casamento */
  secao(`DO ESTADO CIVIL DO(A) "AUTOR(A) DA HERANÇA"`);
  p(
    d.temSobrevivente
      ? `O(A) "autor(a) da herança" era ${d.vinculo === 'CASAMENTO' ? `casado(a) pelo regime da ${ROTULO_REGIME[d.regime]}` : `convivente em união estável, com o regime da ${ROTULO_REGIME[d.regime]}`}${d.falecido.dataCasamento ? `, desde ${formatarData(d.falecido.dataCasamento)}` : `, desde ${LACUNA}`}, conforme ${d.vinculo === 'CASAMENTO' ? 'Certidão de Casamento' : 'escritura/registro de união estável'} ${d.falecido.certidaoCasamento?.trim() ? `extraída da ${d.falecido.certidaoCasamento.trim()}` : `extraída da matrícula nº ${LACUNA}, expedida pelo ORCPN ${LACUNA}`}, com o(a) cônjuge/companheiro(a) supérstite, ${(d.nomeSobrev.trim() || LACUNA).toUpperCase()}, adiante qualificado(a).`
      : `O(A) "autor(a) da herança" não deixou cônjuge nem companheiro(a) sobrevivente, conforme ${LACUNA}.`,
  );

  /* relação dos herdeiros — negrito sublinhado, como no modelo */
  secao('DA RELAÇÃO DOS HERDEIROS');
  const linhaVivos = vivos
    .map((h) => {
      const q = d.qualificacoes[h.id];
      const estado = q?.estadoCivil?.trim() || (q?.conjugeNome?.trim() ? 'casado(a)' : LACUNA);
      return `${h.nome.toUpperCase()} (no estado civil de ${estado})`;
    })
    .join('; e, ');
  let relacao = `O(A) "autor(a) da herança" deixou, à época de seu passamento, os(as) seguintes herdeiros(as) descendentes (filhos(as)): ${linhaVivos || LACUNA}.`;
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

  /* qualificação das partes — variantes do modelo */
  secao(d.temSobrevivente ? 'DA QUALIFICAÇÃO DO CÔNJUGE SUPÉRSTITE E DOS HERDEIROS' : 'DA QUALIFICAÇÃO DOS HERDEIROS');
  p('Comparecem neste ato, como outorgantes e reciprocamente outorgados, a saber:');
  if (d.temSobrevivente) {
    const qs = d.qualificacoes['__sobrevivente__'];
    p(
      `CÔNJUGE SUPÉRSTITE: ${(d.nomeSobrev.trim() || LACUNA).toUpperCase()}, ${qs?.nacionalidade?.trim() || 'brasileiro(a)'}, viúvo(a) de ${nomeFalecido} — "autor(a) da herança" — (Certidão de Óbito ${d.falecido.certidaoObito?.trim() ? `extraída da ${d.falecido.certidaoObito.trim()}` : `extraída da matrícula nº ${LACUNA}, expedida pelo ORCPN ${LACUNA}`}), ${nucleo(qs)}${qs?.email?.trim() ? `, e-mail: ${qs.email.trim()}` : ''}, residente e domiciliado(a) na ${endereco(qs)};`,
      { negrito: true, sublinhado: true, tamanho: 21 },
    );
  }
  p('HERDEIROS:', { negrito: true });
  vivos.forEach((h, i) => {
    p(`${i + 1}) ${qualificarHerdeiro(h.nome, d.qualificacoes[h.id])};`, {
      negrito: true,
      sublinhado: true,
      tamanho: 21,
    });
  });

  /* advogado(a) — texto do modelo, sempre em lacunas */
  secao('DO(A) ADVOGADO(A)');
  p(
    `As partes constituem o(a) Dr(a). ${LACUNA}, brasileiro(a), ${LACUNA}, inscrito(a) na OAB/${LACUNA} sob nº ${LACUNA} — inscrito(a) no CPF/MF sob nº ${LACUNA}, nascido(a) aos ${LACUNA}, filho(a) de ${LACUNA}, e-mail: ${LACUNA}, residente e domiciliado(a) na ${LACUNA}; nomeado(a) pelos presentes, para o fim específico de assisti-los neste ato jurídico, e para eventuais retificações e ratificações que se fizerem necessárias.`,
    { negrito: true, sublinhado: true, tamanho: 21 },
  );

  secao('DAS IDENTIFICAÇÕES');
  p('As partes e o(a) advogado(a) foram identificados à vista dos documentos apresentados, nos originais, do que dou fé.');

  secao('DA DISPOSIÇÃO DE ÚLTIMA VONTADE');
  p(
    `O(A) "de cujus" não deixou testamento, tendo sido apresentada a informação negativa de existência de testamento expedida pelo Colégio Notarial do Brasil — Seção de São Paulo, responsável pelo Registro Central de Testamentos do Estado de São Paulo, emitida aos ${LACUNA}.`,
  );

  /* patrimônio */
  secao('DO PATRIMÔNIO');
  if (d.bens.length === 0) {
    p(`O referido Espólio deixou os seguintes bens: ${LACUNA} (lançar o acervo na folha antes de gerar a minuta).`);
  } else {
    p('O referido Espólio deixou, livre e desembaraçado de quaisquer dúvidas, os seguintes bens:');
    d.bens.forEach((b, i) => p(blocoBem(b, i)));
  }

  /* inventariante — texto padrão do modelo */
  secao('DA NOMEAÇÃO DE INVENTARIANTE');
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
    p(`A meação do(a) cônjuge supérstite importa em ${brl(r.meacao.valor)} (${LACUNA}).`);
  }
  secao('DAS LEGÍTIMAS');
  p(`As legítimas dos herdeiros importam em ${r ? brl(r.heranca.total) : `R$ ${LACUNA}`} (${LACUNA}).`);

  /* ---------- PARTILHA (o coração) ---------- */
  secao('DA PARTILHA');
  p(
    'Pela presente escritura e na melhor forma de direito, ressalvados eventuais erros, omissões e direitos de terceiros, o cônjuge supérstite e os herdeiros, já identificados e qualificados, avençam a partilha do patrimônio do(a) "autor(a) da herança", da seguinte forma:',
  );
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
    if (d.diferenciada.tornas.length > 0) {
      p(
        `DA TORNA: em razão das atribuições acima, ${d.diferenciada.tornas
          .map(
            (t) =>
              `${t.de.toUpperCase()} repõe a ${t.para.toUpperCase()} a diferença de ${brl(t.valor)} (${t.titulo === 'GRATUITO' ? 'cessão gratuita — sujeita ao ITCMD de doação' : 'reposição onerosa — sujeita ao ITBI municipal quanto a imóveis'})`,
          )
          .join('; ')}, o que as partes declaram e aceitam expressamente.`,
      );
    }
  } else if (r) {
    /* 1º pagamento: a meação (bens meados, 1/2 de cada) */
    if (r.meacao) {
      p(
        `${ordinal(pagamento)} PAGAMENTO: é feito ao(à) cônjuge supérstite: ${(d.nomeSobrev.trim() || LACUNA).toUpperCase()}, que, para satisfação de sua meação no valor de ${brl(r.meacao.valor)} (${LACUNA}), haverá:`,
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
        `${ordinal(pagamento)} PAGAMENTO: é feito ao(à) cônjuge supérstite, ${quinhaoSobrev.nome.toUpperCase()}, que, para satisfação de sua concorrência sucessória no valor de ${brl(quinhaoSobrev.valor)} (${quinhaoSobrev.fracaoHeranca} da herança)${quinhaoSobrev.reservaUmQuartoAplicada ? ' — observada a reserva de 1/4 do art. 1.832 do Código Civil' : ''}, haverá:`,
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
        `${ordinal(pagamento)} PAGAMENTO: é feito aos herdeiros ${listaNomes}; que, para satisfação de suas legítimas no valor total de ${brl(total.toFixed(2))} (${LACUNA}), cada um, haverá:`,
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

  /* carta de anuência — só com veículo no acervo */
  if (temVeiculo) {
    secao('DA CARTA DE ANUÊNCIA DO DETRAN');
    p(
      `Com relação ao(s) veículo(s), todos os contratantes, por esta escritura, decidem por realizar o registro desse(s) bem(ns) tão somente em nome do(a) Sr(a). ${LACUNA}, ficando, desde já, autorizadas as subsequentes transferências e os seus registros, servindo-se a presente como "Carta de Anuência", conforme instruções no portal do Departamento Estadual de Trânsito de São Paulo — Detran-SP (https://www.detran.sp.gov.br); sendo certo que, no futuro, esse(s) veículo(s) será(ão) livremente vendido(s) e o seu produto partilhado entre os herdeiros, segundo suas proporções aquisitivas.`,
    );
  }

  /* declaração do advogado — cláusula padrão do modelo */
  secao('DA DECLARAÇÃO DO(A) ADVOGADO(A)');
  p(
    'O(A) advogado(a), que nos termos do § 1º do art. 2º da Lei nº 8.906/1994 (Estatuto da Advocacia), no seu ministério privado, presta serviço público e exerce função social, declara que, na qualidade de advogado(a) dos herdeiros, assessorou e aconselhou seus constituintes, tendo conferido seus valores de acordo com a lei que, inclusive, estabelece que a transferência dos bens e direitos aos herdeiros ou legatários pode ser efetuada pelo valor constante na última Declaração de Bens e Direitos apresentada pelo "de cujus" ou pelo valor de mercado, nos termos do art. 23 da Lei nº 9.532/1997 e do art. 10 da Instrução Normativa nº 81/2001 da Secretaria da Receita Federal. Deste modo, advertiu seus constituintes de que: (a) a opção por qualquer dos critérios de avaliação deve ser informada na Declaração Final de Espólio, sendo vedada a sua retificação; e (b) há possibilidade de eles virem a ser notificados pelo Fisco para pagamento de eventual imposto sobre ganho de capital, de que trata a Lei nº 8.981/1995, alterada pela Lei nº 13.259/2016.',
  );

  /* declarações ulteriores — item das certidões de imóvel só com imóvel */
  secao('DAS DECLARAÇÕES ULTERIORES');
  p(
    `O cônjuge supérstite e os herdeiros do Espólio de ${nomeFalecido}, sempre assistidos de seu(sua) advogado(a), Dr(a). ${LACUNA}, declaram expressamente, sob as penas da lei, o seguinte: (a) desconhecem a existência de outros herdeiros do(a) "autor(a) da herança"; (b) estão de acordo e aceitam a presente escritura em seus expressos termos e na forma redigida${
      temImovel
        ? '; e (c) os herdeiros declaram ter inequívoco conhecimento do inteiro teor das certidões de propriedade dos imóveis aqui tratados, quanto a eventuais ônus ou restrições, isentando esta Serventia de quaisquer responsabilidades neste sentido'
        : ''
    }.`,
  );

  /* eficácia — parágrafo bancário SÓ com crédito bancário no acervo */
  secao('DA EFICÁCIA E EFEITOS DA ESCRITURA DE INVENTÁRIO E PARTILHA');
  p(
    'A presente Escritura Pública de Inventário e Partilha Extrajudicial é dotada da mesma validade e eficácia jurídica atribuídas, por lei, ao Formal de Partilha e ao Alvará Judicial emitidos em inventário processado pelo Poder Judiciário, como assim está prescrito pelo art. 610, § 1º, do Código de Processo Civil (Lei nº 13.105/2015) e pelo art. 3º da Resolução nº 35/2007 do Conselho Nacional de Justiça, ao que não depende de homologação judicial e constitui título hábil para a averbação nos cartórios de registro civil das pessoas naturais e para a transferência de propriedade dos bens partilhados ou adjudicados, bem como para a promoção de todos os atos necessários à materialização das transferências de bens e levantamento de valores, perante Oficiais de Registro de Imóveis, Registro Civil de Pessoas Jurídicas e autarquias equiparadas, Departamento Estadual de Trânsito, Registro de Empresas Mercantis, Prefeitura Municipal, Secretaria do Patrimônio da União, instituições financeiras e bancárias, concessionárias de serviços públicos e onde houver necessidade de conferir execução plena às declarações de vontade manifestadas pelas partes constantes do presente instrumento.',
  );
  if (temCreditoBancario) {
    p(
      'Ademais, em relação às instituições financeiras, fica ressalvado que os valores utilizados para fins de partilha são considerados conforme o período do óbito, em observância ao direito sucessório brasileiro, os quais são atribuídos com seus devidos acréscimos e atualizações, inexistindo óbice à liberação de quaisquer valores em conta/ativos financeiros que sejam de período posterior à data do fato gerador (o dia do óbito). Parágrafo único: os dirigentes dos bancos e instituições financeiras em geral também deverão autorizar, sob pena de incorrer, s.m.j., na tipificação do art. 168 do Código Penal ("apropriação indébita"), quaisquer saques e/ou transferências eletrônicas de eventuais diferenças que venham a ser contabilizadas nas contas supramencionadas, em decorrência dos "aniversários" dessas contas — diferenças essas a título de rendimentos dos valores até então declarados —, tudo em consonância com: (i) o art. 1.784 do Código Civil, que diz "aberta a sucessão, a herança transmite-se, desde logo, aos herdeiros legítimos e testamentários", combinado com (ii) o art. 29 do Decreto Estadual nº 46.655, de 01/04/2002, que preceitua caber aos Agentes Fiscais de Rendas investigar a existência de heranças sujeitas ao imposto, podendo, para esse fim, solicitar o exame de livros e informações junto aos bancos e instituições financeiras.',
    );
  }

  /* tributo — variante paga × isenta conforme a apuração da folha */
  secao('DO TRIBUTO "CAUSA MORTIS"');
  const isento = d.provisao !== null && Number(d.provisao.imposto) === 0;
  p(
    isento
      ? `Os herdeiros ficam ISENTOS do Tributo Causa-Mortis (DARE-ITCMD), face o que dispõe a alínea "${LACUNA}" do inciso I do art. 6º da Lei nº 10.705/2000, conforme resumo da declaração do ITCMD nº ${LACUNA}, arquivado nestas notas em pasta própria nº ${LACUNA}, às fls. ${LACUNA}, para os devidos fins e efeitos de direito.`
      : `As partes apresentaram ${LACUNA} (${LACUNA}) guia(s) do imposto de transmissão "causa mortis" (DARE/ITCMD), no valor total de ${d.provisao ? brl(d.provisao.total.toFixed(2)) : `R$ ${LACUNA}`}, devidamente recolhida(s), a(s) qual(is) fica(m) arquivada(s) nestas notas em pasta própria, para os devidos fins e efeitos de direito, nos termos da Declaração de Transmissão por Escritura Pública nº ${LACUNA}.`,
  );

  /* cláusulas padrão de fechamento */
  secao('DA CERTIDÃO NEGATIVA DE DÉBITOS TRABALHISTAS — CNDT');
  p(
    'Atendendo à Recomendação nº 3 do Conselho Nacional de Justiça, datada de 15/03/2012, cientifico os contratantes, nesta data, da possibilidade de obtenção de certidões negativas de débitos trabalhistas — CNDT, expedidas gratuita e eletronicamente, nos termos da Lei nº 12.440/2011, diretamente no sítio do Tribunal Superior do Trabalho, no endereço: http://www.tst.jus.br.',
  );
  secao('DA CONSULTA À CENTRAL DE INDISPONIBILIDADE');
  p(
    `Este Tabelionato, nos termos do art. 6º, item III, da Lei nº 8.935/1994, e para cumprimento das normas da CGJ, faz constar neste ato notarial que, nesta data, procedeu junto ao site https://www.indisponibilidade.org.br da "Central de Indisponibilidade de Bens", criada pelo Provimento CGJ-SP nº 13/2012, prévia consulta à base de dados, obtendo o resultado "${LACUNA}" para o CPF do(a) "de cujus", conforme comprova(m) o(s) respectivo(s) código(s) HASH gerado(s) para essa(s) consulta(s): ${LACUNA}, dou fé.`,
  );
  secao('DOS DOCUMENTOS APRESENTADOS');
  p(
    `O cônjuge supérstite e os herdeiros, para os fins do art. 117 do Provimento nº 40/2012, apresentaram todos os documentos pertinentes para a lavratura da presente, os quais foram arquivados nestas notas, em pasta própria nº ${LACUNA}, às fls. ${LACUNA}.`,
  );

  /* LGPD — cláusula padrão do modelo, sempre presente */
  secao('DO CONSENTIMENTO PARA TRATAMENTO DE DADOS PESSOAIS');
  p(
    'As partes foram cientificadas de que, de acordo com a Lei nº 6.015/1973, os dados pessoais constantes neste ato são públicos, mas, mesmo assim, dão seu expresso consentimento para a divulgação dos mesmos com a finalidade de emissão de certidões, segundas vias, envio aos órgãos fiscalizadores e para cumprimento de exigências legais e regimentais, conforme o art. 7º da Lei Geral de Proteção de Dados (LGPD).',
  );

  secao('DA AUTENTICIDADE');
  p(
    'Nos termos do Provimento CNJ nº 149/2023, fica consignado, para validade, consulta e verificação da autenticidade deste ato notarial: (a) que a Matrícula Notarial Eletrônica — MNE serve como chave de identificação individualizada do presente escrito notarial; (b) "Consulte a validade deste ato notarial em: www.docautentico.com.br/valida"; e (c) que a MNE, a chave de acesso e o QR Code deste ato notarial constam do respectivo "Manifesto de Assinaturas", gerado na plataforma e-Notariado, e que integra o ato.',
  );

  /* encerramento — variantes do modelo por modalidade */
  secao('DO ENCERRAMENTO E ASSINATURAS');
  const encerramentoBase =
    'E, de como assim disseram, do que dou fé, a pedido lhes lavrei a presente, que, lida em voz alta, aceitam, outorgam e assinam, do que dou fé.';
  p(
    d.modalidade === 'PRESENCIAL'
      ? `${encerramentoBase} DESTA: ${LACUNA}. Eu, ${LACUNA}, Escrevente Habilitado(a), a lavrei. Eu, ${LACUNA}, Tabelião(ã), a subscrevi.`
      : d.modalidade === 'VIDEOCONFERENCIA'
        ? `${encerramentoBase} As partes assinam o presente instrumento digitalmente, através da plataforma e-Notariado, disponibilizada pelo Provimento CNJ nº 149/2023, do que dou fé. DESTA: ${LACUNA}. Eu, ${LACUNA}, Escrevente Habilitado(a), a lavrei. Eu, ${LACUNA}, Tabelião(ã), a subscrevi.`
        : `${encerramentoBase} ${d.partesRemotas.trim() || LACUNA} assina(m) o presente instrumento digitalmente, através da plataforma e-Notariado, disponibilizada pelo Provimento CNJ nº 149/2023, e as demais partes assinam fisicamente nesta Serventia, do que dou fé. DESTA: ${LACUNA}. Eu, ${LACUNA}, Escrevente Habilitado(a), a lavrei. Eu, ${LACUNA}, Tabelião(ã), a subscrevi.`,
  );
  p(`${LACUNA}, ${dataPorExtenso()}.`);

  // Formatação do MODELO: Tahoma, corpo 11pt, títulos centralizados em caixa.
  return montarDocxRico(blocos, { estilo: { fonte: 'Tahoma', tamanho: 22, tituloCentrado: true } });
}
