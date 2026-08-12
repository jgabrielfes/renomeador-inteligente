/**
 * Minuta da ESCRITURA de inventário e partilha — perfil Escrevente Notarial.
 *
 * Gerada a partir do modelo real do balcão E NA FORMATAÇÃO DELE: fonte
 * Tahoma, corpo justificado, títulos de seção centralizados em negrito,
 * blocos de qualificação em negrito sublinhado, tabela-resumo na abertura e
 * a PARTILHA em tabelas (Patrimônio · Proporção · Valor), como no modelo. A
 * identificação do tabelionato, do escrevente e do tabelião fica SEMPRE em
 * branco (______): a minuta serve a qualquer serventia.
 *
 * O preenchimento é DETERMINÍSTICO e condicional à folha — cláusulas padrão
 * intactas; as variáveis acompanham a composição familiar, o acervo e a
 * forma da partilha:
 *
 * - Introdução e encerramento mudam com a MODALIDADE do ato: presencial,
 *   por videoconferência (e-Notariado, Prov. CNJ 149/2023) ou híbrida.
 * - Qualificação COMPLETA das partes: nacionalidade, estado civil com os
 *   dados do cônjuge + data/regime/certidão do casamento, nascimento,
 *   filiação, e-mail e endereço — o que a folha tiver; o resto vira lacuna.
 * - Imóvel sai com forma de aquisição, matrícula/RI, cadastro municipal e
 *   valores venais (exercício do óbito × corrente) lidos das certidões;
 *   veículo sai com marca/modelo, anos, RENAVAM, placa e chassi do CRLV.
 * - "Carta de Anuência do Detran" só entra havendo VEÍCULO no acervo; o
 *   parágrafo dos bancos (art. 168 CP) só havendo CRÉDITO bancário; meação
 *   e primeiro pagamento só com meeiro(a); tributo pago × isento conforme a
 *   apuração; partilha pelo espelho (frações por bem) ou pela diferenciada.
 *
 * Campo sem base na folha vira lacuna — o(a) escrevente completa; nada é
 * inventado. Toda saída é MINUTA para conferência.
 */

import type { Bem, Herdeiro, Regime, Resultado, Vinculo } from './types';
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

/** "1/6" → 0.1666…; "1" → 1; inválido → null. */
function fracaoParaNumero(f: string | undefined): number | null {
  if (!f) return null;
  const m = /^(\d+)(?:\/(\d+))?$/.exec(f.trim());
  if (!m) return null;
  const num = Number(m[1]);
  const den = m[2] ? Number(m[2]) : 1;
  return den > 0 ? num / den : null;
}

/**
 * Qualificação COMPLETA de uma parte, no formato da escritura: nome,
 * nacionalidade, estado civil (com o cônjuge qualificado + data, regime e
 * certidão do casamento), profissão, RG, CPF, nascimento, filiação, e-mail
 * e endereço completo. O que a folha não tiver vira lacuna.
 */
function qualificarEscritura(nome: string, q?: Qualificacao): string {
  const partes: string[] = [nome.toUpperCase()];
  partes.push(q?.nacionalidade?.trim() || 'brasileiro(a)');

  if (q?.conjugeNome?.trim()) {
    const conj = [
      q.conjugeNome.trim().toUpperCase(),
      q.conjugeNacionalidade?.trim() || 'brasileiro(a)',
      q.conjugeProfissao?.trim() || `profissão ${LACUNA}`,
      `RG nº ${q.conjugeRg?.trim() || LACUNA}`,
      `inscrito(a) no CPF/MF sob nº ${q.conjugeCpf?.trim() || LACUNA}`,
      `nascido(a) aos ${q.conjugeDataNascimento ? formatarData(q.conjugeDataNascimento) : LACUNA}`,
      `filho(a) de ${q.conjugeFiliacao?.trim() || LACUNA}`,
    ];
    partes.push(
      `casado(a) sob o regime da ${q.casamentoRegime?.trim() || LACUNA}, em ${
        q.casamentoData ? formatarData(q.casamentoData) : LACUNA
      }, com ${conj.join(', ')}, conforme Certidão de Casamento ${q.casamentoCertidao?.trim() || `extraída da matrícula nº ${LACUNA}`}`,
    );
  } else {
    partes.push(`no estado civil de ${q?.estadoCivil?.trim() || LACUNA}`);
  }

  partes.push(q?.profissao?.trim() || `profissão ${LACUNA}`);
  partes.push(`RG nº ${q?.rg?.trim() || LACUNA}`);
  partes.push(`inscrito(a) no CPF/MF sob nº ${q?.cpf?.trim() || LACUNA}`);
  partes.push(`nascido(a) aos ${q?.dataNascimento ? formatarData(q.dataNascimento) : LACUNA}`);
  partes.push(`filho(a) de ${q?.filiacao?.trim() || LACUNA}`);
  if (q?.email?.trim()) partes.push(`e-mail ${q.email.trim()}`);
  const endereco = [q?.endereco, q?.complemento, q?.bairro].filter((x) => x?.trim()).join(', ');
  const cidade = [q?.cidade, q?.uf].filter((x) => x?.trim()).join('/');
  partes.push(
    `residente e domiciliado(a) na ${endereco || LACUNA}${cidade ? `, ${cidade}` : `, ${LACUNA}`}${
      q?.cep?.trim() ? ` (CEP ${q.cep.trim()})` : ''
    }`,
  );
  return partes.join(', ');
}

/* ---------- blocos do acervo (esqueletos do modelo, por tipo de bem) ---------- */

function blocoBem(b: Bem, i: number): string[] {
  const cab = `${i + 1}) ${b.descricao.toUpperCase()} — bem de natureza ${b.natureza === 'COMUM' ? 'comum' : 'particular'}.`;
  const avaliacao = `DA AVALIAÇÃO: as partes atribuem, para efeitos fiscais e de partilha, o valor de ${brl(b.valor)} (${LACUNA}).`;
  switch (b.tipo) {
    case 'IMOVEL': {
      const im = b.imovel ?? {};
      return [
        cab,
        `FORMA DE AQUISIÇÃO: havido pelo(a) "de cujus" por força do ${im.aquisicao?.trim() || `R.${LACUNA}`} da matrícula nº ${im.matricula?.trim() || LACUNA} do ${im.registroImoveis?.trim() || `${LACUNA}º Registro de Imóveis de ${LACUNA}`}. CADASTRO E VALOR VENAL: inscrito na Municipalidade de ${im.municipio?.trim() || LACUNA} sob a inscrição cadastral/contribuinte nº ${im.inscricaoCadastral?.trim() || LACUNA}, tendo recebido no exercício do falecimento (${im.exercicioObito?.trim() || LACUNA}) o valor venal de ${im.valorVenalObito ? brl(im.valorVenalObito) : `R$ ${LACUNA}`} e no corrente exercício (${im.exercicioAtual?.trim() || LACUNA}) o valor venal de ${im.valorVenalAtual ? brl(im.valorVenalAtual) : `R$ ${LACUNA}`}. ${avaliacao}`,
      ];
    }
    case 'VEICULO': {
      const v = b.veiculo ?? {};
      return [
        cab,
        `UM AUTOMÓVEL da Marca/Modelo: ${v.marcaModelo?.trim() || LACUNA} — Ano Fáb.: ${v.anoFabricacao?.trim() || LACUNA} — Ano Mod.: ${v.anoModelo?.trim() || LACUNA} — RENAVAM: ${v.renavam?.trim() || LACUNA} — Placa: ${v.placa?.trim() || LACUNA} — CHASSI: ${v.chassi?.trim() || LACUNA}. ${avaliacao}`,
      ];
    }
    case 'FINANCEIRO':
      return [
        cab,
        `CRÉDITO no Banco ${LACUNA}, decorrente do saldo em conta ${LACUNA} nº ${LACUNA}, agência nº ${LACUNA}, no valor de ${brl(b.valor)} (${LACUNA}) na data do óbito.`,
      ];
    case 'QUOTAS':
      return [
        cab,
        `PARTICIPAÇÃO SOCIETÁRIA com ${LACUNA} quotas da empresa ${LACUNA}, inscrita no CNPJ/MF sob nº ${LACUNA}, com sede na ${LACUNA}. ${avaliacao}`,
      ];
    default:
      return [`${cab} ${avaliacao}`];
  }
}

/* ---------- montagem ---------- */

/** Colunas das tabelas do modelo (twips). */
const COLS_RESUMO = [2465, 5888];
const COLS_PARTILHA = [2784, 2784, 2785];

export async function montarEscrituraDocx(d: DadosEscritura): Promise<Blob> {
  const blocos: BlocoDocx[] = [];
  const p = (texto: string, o?: Omit<Paragrafo, 'texto'>) =>
    blocos.push({ tipo: 'p', texto, ...o });
  const secao = (t: string) => p(t, { titulo: true });

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

  p('MINUTA gerada pelo Sucessorista — conferência do(a) escrevente/tabelião(ã) responsável é obrigatória; lacunas (______) aguardam os dados do ato.', {
    centrado: true,
    discreto: true,
  });

  /* cabeçalho do modelo: título + *** + tabela-resumo + *** */
  p('ESCRITURA DE INVENTÁRIO E PARTILHA DE BENS', { centrado: true, negrito: true, tamanho: 18 });
  p('***', { centrado: true, negrito: true, tamanho: 21 });
  blocos.push({
    tipo: 'tabela',
    colunas: COLS_RESUMO,
    tamanho: 18,
    linhas: [
      { celulas: ['Autor(a) da Herança:', `${nomeFalecido}.`] },
      { celulas: ['Herdeiros(as):', `${vivos.map((h) => h.nome).join('; ') || LACUNA}.`] },
      { celulas: ['Advogado(a):', `Dr(a). ${LACUNA}.`] },
      { celulas: ['Monte Mor:', r ? `${brl(r.acervo.massaPartilhavel)}.` : `R$ ${LACUNA}.`] },
      { celulas: ['Legítima:', r ? `${brl(r.heranca.total)}.` : `R$ ${LACUNA}.`] },
      { celulas: ['Modalidade do ato:', `${ROTULO_MODALIDADE[d.modalidade]}.`] },
    ],
  });
  p('***', { centrado: true, negrito: true, tamanho: 21 });

  /* introdução — varia com a modalidade */
  p('INTRODUÇÃO', { centrado: true, negrito: true, tamanho: 21 });
  const local = `nesta cidade e comarca de ${LACUNA}, Estado de ${LACUNA}, neste ${LACUNA}º Tabelionato de Notas, instalado na ${LACUNA}, perante mim, ${LACUNA}, Escrevente Notarial, e o(a) Tabelião(ã) que esta subscreve`;
  const comparecimento =
    d.modalidade === 'PRESENCIAL'
      ? 'compareceram, presencialmente, partes entre si justas e convencionadas, assistidas por seu(sua) advogado(a)'
      : d.modalidade === 'VIDEOCONFERENCIA'
        ? 'compareceram, por videoconferência realizada na plataforma e-Notariado, na forma do Provimento CNJ nº 149/2023 (Código Nacional de Normas), com coleta de assinaturas digitais e gravação do ato, partes entre si justas e convencionadas, assistidas por seu(sua) advogado(a)'
        : `compareceram, de forma híbrida — parte presencialmente e parte por videoconferência na plataforma e-Notariado (Provimento CNJ nº 149/2023), a saber, por videoconferência: ${d.partesRemotas.trim() || LACUNA} —, partes entre si justas e convencionadas, assistidas por seu(sua) advogado(a)`;
  p(
    `SAIBAM todos os que virem esta pública escritura que, aos ${LACUNA} (${LACUNA}) dias do mês de ${LACUNA} do ano de ${LACUNA}, ${local}, ${comparecimento}, as quais me solicitaram a lavratura desta Escritura de Inventário e Partilha de Bens do Espólio de ${nomeFalecido}, declarando o seguinte:`,
    { negrito: true },
  );

  /* autor(a) da herança — com a ficha completa quando houver */
  secao(`DO(A) "AUTOR(A) DA HERANÇA"`);
  p(
    `${nomeFalecido}, era ${qf?.nacionalidade?.trim() || 'brasileiro(a)'}, ${qf?.profissao?.trim() || `profissão ${LACUNA}`}, RG nº ${qf?.rg?.trim() || LACUNA} — inscrito(a) no CPF/MF sob nº ${d.falecido.cpf?.trim() || qf?.cpf?.trim() || LACUNA}, nascido(a) aos ${qf?.dataNascimento ? formatarData(qf.dataNascimento) : LACUNA}, filho(a) de ${qf?.filiacao?.trim() || LACUNA}, residia e domiciliava na ${[qf?.endereco, qf?.complemento, qf?.bairro].filter((x) => x?.trim()).join(', ') || d.falecido.ultimoDomicilio?.trim() || LACUNA}${qf?.cidade?.trim() ? `, ${qf.cidade.trim()}${qf.uf?.trim() ? `/${qf.uf.trim()}` : ''}` : ''}${qf?.cep?.trim() ? ` (CEP ${qf.cep.trim()})` : ''}. O falecimento ocorreu no dia ${d.falecido.dataObito ? formatarData(d.falecido.dataObito) : LACUNA}, conforme Certidão de Óbito extraída da matrícula nº ${LACUNA}, expedida pelo ORCPN de ${LACUNA}.`,
    { negrito: true },
  );

  /* estado civil */
  secao(`DO ESTADO CIVIL DO(A) "AUTOR(A) DA HERANÇA"`);
  p(
    d.temSobrevivente
      ? `O(A) "autor(a) da herança" era ${d.vinculo === 'CASAMENTO' ? 'casado(a)' : 'convivente em união estável'} com ${(d.nomeSobrev.trim() || LACUNA).toUpperCase()}, sob o regime da ${ROTULO_REGIME[d.regime]}${d.falecido.dataCasamento ? `, desde ${formatarData(d.falecido.dataCasamento)}` : ''}, conforme ${d.vinculo === 'CASAMENTO' ? 'Certidão de Casamento extraída da matrícula' : 'escritura/registro de união estável'} nº ${LACUNA}, expedida pelo ORCPN de ${LACUNA}.`
      : `O(A) "autor(a) da herança" não deixou cônjuge nem companheiro(a) sobrevivente, conforme ${LACUNA}.`,
  );

  /* relação dos herdeiros — negrito sublinhado, como no modelo */
  secao('DA RELAÇÃO DOS HERDEIROS');
  const preMortos = d.herdeiros.filter((h) => h.status === 'PRE_MORTO');
  const renunciantes = d.herdeiros.filter((h) => h.status === 'RENUNCIANTE');
  const linhaVivos = vivos
    .map((h) => {
      const q = d.qualificacoes[h.id];
      return `${h.nome.toUpperCase()}${q?.estadoCivil?.trim() ? ` (no estado civil de ${q.estadoCivil.trim()})` : q?.conjugeNome?.trim() ? ' (no estado civil de casado(a))' : ''}`;
    })
    .join('; ');
  let relacao = `O(A) "autor(a) da herança" deixou, à época de seu passamento, os(as) seguintes herdeiros(as): ${linhaVivos || LACUNA}.`;
  if (preMortos.length > 0) {
    relacao += ` Cumpre consignar que deixou também herdeiro(s) pré-morto(s): ${preMortos
      .map((h) => `${h.nome.toUpperCase()}, falecido(a) em ${LACUNA}, conforme Certidão de Óbito extraída da matrícula nº ${LACUNA}`)
      .join('; ')} — sucedido(s) por representação, na forma dos arts. 1.851 a 1.856 do Código Civil.`;
  }
  if (renunciantes.length > 0) {
    relacao += ` Renunciou(aram) à herança: ${renunciantes.map((h) => h.nome.toUpperCase()).join('; ')}, conforme consignado adiante.`;
  }
  p(relacao, { negrito: true, sublinhado: true });

  /* qualificação das partes — completa, negrito sublinhado */
  secao('DA QUALIFICAÇÃO DAS PARTES');
  p('Comparecem neste ato, como outorgantes e reciprocamente outorgados, a saber:');
  if (d.temSobrevivente) {
    p(
      `CÔNJUGE/COMPANHEIRO(A) SUPÉRSTITE: ${qualificarEscritura(d.nomeSobrev.trim() || LACUNA, d.qualificacoes['__sobrevivente__'])}.`,
      { negrito: true, sublinhado: true, tamanho: 21 },
    );
  }
  vivos.forEach((h, i) => {
    p(`HERDEIRO(A) ${i + 1}) ${qualificarEscritura(h.nome, d.qualificacoes[h.id])}.`, {
      negrito: true,
      sublinhado: true,
      tamanho: 21,
    });
  });

  /* advogado(a) — sempre em lacuna: quem assiste é escolha das partes */
  secao('DO(A) ADVOGADO(A)');
  p(
    `As partes constituem o(a) Dr(a). ${LACUNA}, brasileiro(a), inscrito(a) na OAB/${LACUNA} sob nº ${LACUNA} — inscrito(a) no CPF/MF sob nº ${LACUNA}, nascido(a) aos ${LACUNA}, filho(a) de ${LACUNA}, residente e domiciliado(a) na ${LACUNA}; nomeado(a) pelos presentes para o fim específico de assisti-los neste ato jurídico e para eventuais retificações e ratificações que se fizerem necessárias.`,
    { negrito: true, sublinhado: true, tamanho: 21 },
  );

  secao('DAS IDENTIFICAÇÕES');
  p('As partes e o(a) advogado(a) foram identificados à vista dos documentos apresentados, nos originais, do que dou fé.');

  secao('DA DISPOSIÇÃO DE ÚLTIMA VONTADE');
  p(
    `O(A) "de cujus" não deixou testamento, tendo sido apresentada a informação negativa de existência de testamento expedida pelo Colégio Notarial do Brasil, responsável pelo Registro Central de Testamentos, emitida aos ${LACUNA}.`,
  );

  /* patrimônio */
  secao('DO PATRIMÔNIO');
  if (d.bens.length === 0) {
    p(`O referido Espólio deixou os seguintes bens: ${LACUNA} (lançar o acervo na folha antes de gerar a minuta).`);
  } else {
    p('O referido Espólio deixou, livres e desembaraçados de quaisquer dúvidas, os seguintes bens:');
    d.bens.forEach((b, i) => {
      for (const linha of blocoBem(b, i)) p(linha);
    });
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

  /* monte mor, meação e legítimas */
  secao('DO MONTE MOR');
  p(
    `O monte mor é constituído pelos bens descritos no item "DO PATRIMÔNIO" e importa em ${r ? brl(r.acervo.massaPartilhavel) : `R$ ${LACUNA}`} (${LACUNA}).`,
  );
  if (r?.meacao) {
    secao('DA MEAÇÃO');
    p(
      `A meação do(a) cônjuge/companheiro(a) supérstite — ${r.meacao.fracao}, que não integra a herança (${r.meacao.fundamento}) — importa em ${brl(r.meacao.valor)} (${LACUNA}).`,
    );
  }
  secao('DAS LEGÍTIMAS');
  p(`As legítimas dos herdeiros importam em ${r ? brl(r.heranca.total) : `R$ ${LACUNA}`} (${LACUNA}).`);

  /* partilha — pagamentos com TABELA (Patrimônio · Proporção · Valor) */
  secao('DA PARTILHA');
  p(
    'Pela presente escritura e na melhor forma de direito, ressalvados eventuais erros, omissões e direitos de terceiros, as partes, já identificadas e qualificadas, avençam a partilha do patrimônio do(a) "autor(a) da herança" da seguinte forma:',
  );
  const ordinal = (n: number) =>
    ['PRIMEIRO', 'SEGUNDO', 'TERCEIRO', 'QUARTO', 'QUINTO', 'SEXTO', 'SÉTIMO', 'OITAVO', 'NONO', 'DÉCIMO'][n] ?? `${n + 1}º`;
  const cabecaTabela = { celulas: ['PATRIMÔNIO', 'PROPORÇÃO', 'VALOR'], negrito: true };
  const num2 = (n: number) => String(n).padStart(2, '0');
  let pagamento = 0;

  if (d.diferenciada) {
    for (const pg of d.diferenciada.pagamentos) {
      p(
        `${ordinal(pagamento)} PAGAMENTO: é feito a ${pg.nome.toUpperCase()}, que haverá, no valor total de ${brl(pg.valorRecebido)} (${LACUNA}):`,
        { negrito: true },
      );
      blocos.push({
        tipo: 'tabela',
        colunas: COLS_PARTILHA,
        linhas: [
          cabecaTabela,
          ...pg.itens.map((it) => ({
            celulas: [
              num2(it.numero),
              pctFmt(it.pct),
              brl(((Number(d.bens[it.numero - 1]?.valor ?? 0) * it.pct) / 100).toFixed(2)),
            ],
          })),
        ],
      });
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
    if (r.meacao) {
      p(
        `${ordinal(pagamento)} PAGAMENTO: é feito ao(à) cônjuge/companheiro(a) supérstite, ${(d.nomeSobrev.trim() || LACUNA).toUpperCase()}, que, para satisfação de sua MEAÇÃO no valor de ${brl(r.meacao.valor)} (${LACUNA}), haverá:`,
        { negrito: true },
      );
      blocos.push({
        tipo: 'tabela',
        colunas: COLS_PARTILHA,
        linhas: [
          cabecaTabela,
          ...d.bens
            .filter((b) => b.natureza === 'COMUM' || d.regime === 'COMUNHAO_UNIVERSAL')
            .map((b) => ({
              celulas: [
                num2(d.bens.indexOf(b) + 1),
                '1/2',
                brl((Number(b.valor) / 2).toFixed(2)),
              ],
            })),
        ],
      });
      pagamento += 1;
    }
    for (const q of r.quinhoes) {
      p(
        `${ordinal(pagamento)} PAGAMENTO: é feito a ${q.nome.toUpperCase()}, que, para satisfação de ${
          q.papel === 'SOBREVIVENTE' ? 'sua concorrência sucessória' : 'sua legítima'
        } no valor de ${brl(q.valor)} (${q.fracaoHeranca} da herança)${
          q.reservaUmQuartoAplicada ? ' — observada a reserva de 1/4 do art. 1.832 do Código Civil' : ''
        }, haverá:`,
        { negrito: true },
      );
      const linhas = d.bens
        .map((b, i) => {
          const fr = b.natureza === 'COMUM' ? q.fracaoBemComum : q.fracaoBemParticular;
          const n = fracaoParaNumero(fr);
          if (!fr || !n) return null;
          return { celulas: [num2(i + 1), fr, brl((Number(b.valor) * n).toFixed(2))] };
        })
        .filter((x): x is NonNullable<typeof x> => x !== null);
      blocos.push({
        tipo: 'tabela',
        colunas: COLS_PARTILHA,
        linhas: [cabecaTabela, ...(linhas.length > 0 ? linhas : [{ celulas: [LACUNA, LACUNA, LACUNA] }])],
      });
      pagamento += 1;
    }
  } else {
    p(`Plano de partilha: ${LACUNA} (calcule o espelho na folha antes de gerar a minuta).`);
  }

  /* carta de anuência — só com veículo no acervo */
  if (temVeiculo) {
    secao('DA CARTA DE ANUÊNCIA DO DETRAN');
    p(
      `Com relação ao(s) veículo(s), todos os contratantes, por esta escritura, decidem realizar o registro desse(s) bem(ns) tão somente em nome do(a) Sr(a). ${LACUNA}, ficando desde já autorizadas as subsequentes transferências e os seus registros, servindo a presente como "Carta de Anuência", conforme instruções no portal do Departamento Estadual de Trânsito; sendo certo que, no futuro, esse(s) veículo(s) poderá(ão) ser livremente vendido(s) e o seu produto partilhado entre os herdeiros, segundo suas proporções aquisitivas.`,
    );
  }

  /* declaração do advogado — cláusula padrão do modelo */
  secao('DA DECLARAÇÃO DO(A) ADVOGADO(A)');
  p(
    'O(A) advogado(a), que nos termos do § 1º do art. 2º da Lei nº 8.906/1994 (Estatuto da Advocacia), no seu ministério privado, presta serviço público e exerce função social, declara que, na qualidade de advogado(a) das partes, assessorou e aconselhou seus constituintes, tendo conferido seus valores de acordo com a lei que, inclusive, estabelece que a transferência dos bens e direitos aos herdeiros ou legatários pode ser efetuada pelo valor constante na última Declaração de Bens e Direitos apresentada pelo "de cujus" ou pelo valor de mercado, nos termos do art. 23 da Lei nº 9.532/1997 e do art. 10 da IN SRF nº 81/2001. Deste modo, advertiu seus constituintes de que: (a) a opção por qualquer dos critérios de avaliação deve ser informada na Declaração Final de Espólio, sendo vedada a sua retificação; e (b) há possibilidade de virem a ser notificados pelo Fisco para pagamento de eventual imposto sobre ganho de capital, de que trata a Lei nº 8.981/1995, alterada pela Lei nº 13.259/2016.',
  );

  /* declarações ulteriores — item das certidões de imóvel só com imóvel */
  secao('DAS DECLARAÇÕES ULTERIORES');
  p(
    `As partes do Espólio de ${nomeFalecido}, sempre assistidas de seu(sua) advogado(a), declaram expressamente, sob as penas da lei: (a) que desconhecem a existência de outros herdeiros do(a) "autor(a) da herança"; (b) que estão de acordo e aceitam a presente escritura em seus expressos termos e na forma redigida${
      temImovel
        ? '; e (c) que têm inequívoco conhecimento do inteiro teor das certidões de propriedade dos imóveis aqui tratados, quanto a eventuais ônus ou restrições, isentando esta Serventia de quaisquer responsabilidades neste sentido'
        : ''
    }.`,
  );

  /* eficácia — parágrafo bancário SÓ com crédito bancário no acervo */
  secao('DA EFICÁCIA E EFEITOS DA ESCRITURA DE INVENTÁRIO E PARTILHA');
  p(
    'A presente Escritura Pública de Inventário e Partilha Extrajudicial é dotada da mesma validade e eficácia jurídica atribuídas, por lei, ao Formal de Partilha e ao Alvará Judicial emitidos em inventário processado pelo Poder Judiciário, como prescrito pelo art. 610, § 1º, do Código de Processo Civil (Lei nº 13.105/2015) e pelo art. 3º da Resolução nº 35/2007 do Conselho Nacional de Justiça, ao que não depende de homologação judicial e constitui título hábil para a averbação nos cartórios de registro civil das pessoas naturais e para a transferência de propriedade dos bens partilhados ou adjudicados, bem como para a promoção de todos os atos necessários à materialização das transferências de bens e levantamento de valores, perante Oficiais de Registro de Imóveis, Registro Civil de Pessoas Jurídicas, Departamento Estadual de Trânsito, Registro de Empresas Mercantis, Prefeituras Municipais, Secretaria do Patrimônio da União, instituições financeiras e bancárias, concessionárias de serviços públicos e onde mais houver necessidade de conferir execução plena às declarações de vontade manifestadas pelas partes no presente instrumento.',
  );
  if (temCreditoBancario) {
    p(
      'Ademais, em relação às instituições financeiras, fica ressalvado que os valores utilizados para fins de partilha são considerados conforme o período do óbito, em observância ao direito sucessório brasileiro, atribuídos com seus devidos acréscimos e atualizações, inexistindo óbice à liberação de quaisquer valores em conta/ativos financeiros de período posterior à data do fato gerador (o dia do óbito). Parágrafo único: os dirigentes dos bancos e instituições financeiras em geral também deverão autorizar, sob pena de incorrer, s.m.j., na tipificação do art. 168 do Código Penal ("apropriação indébita"), quaisquer saques e/ou transferências eletrônicas de eventuais diferenças que venham a ser contabilizadas nas contas supramencionadas em decorrência dos "aniversários" dessas contas — diferenças a título de rendimentos dos valores até então declarados —, em consonância com: (i) o art. 1.784 do Código Civil ("aberta a sucessão, a herança transmite-se, desde logo, aos herdeiros legítimos e testamentários"); e (ii) o art. 29 do Decreto Estadual nº 46.655/2002, que preceitua caber aos Agentes Fiscais de Rendas investigar a existência de heranças sujeitas ao imposto, podendo, para esse fim, solicitar o exame de livros e informações junto aos bancos e instituições financeiras.',
    );
  }

  /* tributo — variante paga × isenta conforme a apuração da folha */
  secao('DO TRIBUTO "CAUSA MORTIS"');
  const isento = d.provisao !== null && Number(d.provisao.imposto) === 0;
  p(
    isento
      ? `Os herdeiros ficam ISENTOS do tributo causa mortis (DARE-ITCMD), face ao que dispõe a alínea "${LACUNA}" do inciso I do art. 6º da Lei estadual nº 10.705/2000, conforme resumo da declaração do ITCMD nº ${LACUNA}, arquivado nestas notas em pasta própria nº ${LACUNA}, às fls. ${LACUNA}, para os devidos fins e efeitos de direito.`
      : `As partes apresentaram ${LACUNA} (${LACUNA}) guia(s) do imposto de transmissão causa mortis (DARE/ITCMD), no valor total de ${d.provisao ? brl(d.provisao.total.toFixed(2)) : `R$ ${LACUNA}`}, devidamente recolhida(s), a(s) qual(is) fica(m) arquivada(s) nestas notas em pasta própria, para os devidos fins e efeitos de direito, nos termos da Declaração de Transmissão por Escritura Pública nº ${LACUNA}.`,
  );

  /* cláusulas padrão de fechamento */
  secao('DA CERTIDÃO NEGATIVA DE DÉBITOS TRABALHISTAS — CNDT');
  p(
    'Atendendo à Recomendação nº 3/2012 do Conselho Nacional de Justiça, cientifico os contratantes, nesta data, da possibilidade de obtenção de certidões negativas de débitos trabalhistas — CNDT, expedidas gratuita e eletronicamente, nos termos da Lei nº 12.440/2011, diretamente no sítio do Tribunal Superior do Trabalho (www.tst.jus.br).',
  );
  secao('DA CONSULTA À CENTRAL DE INDISPONIBILIDADE');
  p(
    `Este Tabelionato, nos termos do art. 6º, III, da Lei nº 8.935/1994 e das normas da Corregedoria-Geral da Justiça, faz constar que, nesta data, procedeu junto à Central de Indisponibilidade de Bens (www.indisponibilidade.org.br — Provimento CGJ nº 13/2012) prévia consulta à base de dados, obtendo o resultado "${LACUNA}" para o CPF do(a) "de cujus", conforme comprova(m) o(s) código(s) HASH gerado(s): ${LACUNA}, dou fé.`,
  );
  secao('DOS DOCUMENTOS APRESENTADOS');
  p(
    `As partes, para os fins das normas de serviço, apresentaram todos os documentos pertinentes para a lavratura da presente, os quais foram arquivados nestas notas em pasta própria nº ${LACUNA}, às fls. ${LACUNA}.`,
  );
  if (d.modalidade !== 'PRESENCIAL') {
    secao('DA AUTENTICIDADE');
    p(
      'Nos termos do Provimento CNJ nº 149/2023, fica consignado, para validade, consulta e verificação da autenticidade deste ato notarial: (a) que a Matrícula Notarial Eletrônica — MNE serve como chave de identificação individualizada do presente escrito notarial; e (b) que a MNE, a chave de acesso e o QR Code deste ato constam do respectivo "Manifesto de Assinaturas", gerado na plataforma e-Notariado, que integra o ato.',
    );
  }

  /* encerramento — varia com a modalidade */
  secao('DO ENCERRAMENTO E ASSINATURAS');
  const fecho =
    d.modalidade === 'PRESENCIAL'
      ? 'E, de como assim disseram, do que dou fé, a pedido lhes lavrei a presente, que, lida em voz alta, aceitam, outorgam e assinam, do que dou fé.'
      : d.modalidade === 'VIDEOCONFERENCIA'
        ? 'E, de como assim disseram, do que dou fé, a pedido lhes lavrei a presente, que, lida em voz alta na sessão de videoconferência, aceitam e outorgam, assinando todas as partes digitalmente por meio da plataforma e-Notariado, na forma do Provimento CNJ nº 149/2023, do que dou fé.'
        : `E, de como assim disseram, do que dou fé, a pedido lhes lavrei a presente, que, lida em voz alta, aceitam e outorgam; os presentes assinam fisicamente nesta Serventia e ${d.partesRemotas.trim() || LACUNA} assina(m) digitalmente por meio da plataforma e-Notariado, na forma do Provimento CNJ nº 149/2023, do que dou fé.`;
  p(`${fecho} Eu, ${LACUNA}, Escrevente, a lavrei. Eu, ${LACUNA}, Tabelião(ã), a subscrevi. DESTA: ${LACUNA}.`);
  p(`${LACUNA}, ${dataPorExtenso()}.`);

  // Formatação do MODELO: Tahoma, corpo 11pt, títulos de seção centralizados.
  return montarDocxRico(blocos, { estilo: { fonte: 'Tahoma', tamanho: 22, tituloCentrado: true } });
}
