/**
 * Minuta de PETIÇÃO INICIAL de inventário JUDICIAL — perfil Advogado(a).
 *
 * Para o caso que não cabe (ou não convém) na via extrajudicial: menor ou
 * incapaz sem parecer favorável do MP, litígio, testamento a cumprir etc.
 * A estrutura (endereçamento, qualificação pronta das partes, óbito, pedidos
 * e valor da causa) é DETERMINÍSTICA — números e nomes nunca vêm da IA; o
 * corpo argumentativo pode vir da redação por IA (rota interna, com este
 * fallback local completo). Tudo é MINUTA para revisão e assinatura.
 */

import type { Bem, Herdeiro, Regime, Resultado, Vinculo } from './types';
import { descricaoBemMinuta } from './descricao-bem';
import { formatarData, type DadosFalecido, type Qualificacao } from './familia';
import type { ProvisaoItcmd } from './itcmd';
import { montarDocx, vestirIdentidade, ESTILO_SUCESSORISTA, type Paragrafo } from './docx';
import { qualificar, dataPorExtenso, brl, LACUNA, ROTULO_REGIME } from './peticao';
import type { SecaoRedigida } from './honorarios-docx';

export interface DadosPeticaoJudicial {
  falecido: DadosFalecido;
  temSobrevivente: boolean;
  nomeSobrev: string;
  vinculo: Vinculo;
  regime: Regime;
  herdeiros: Herdeiro[];
  qualificacoes: Record<string, Qualificacao>;
  /** Requerente da abertura (proposto a inventariante). */
  inventarianteId: string | null;
  bens: Bem[];
  dividas: string;
  resultado: Resultado | null;
  provisao: ProvisaoItcmd | null;
  /** Corpo redigido pela IA; null = redação padrão local abaixo. */
  secoes: SecaoRedigida[] | null;
}

const ROTULO_TIPO: Record<string, string> = {
  IMOVEL: 'imóvel',
  VEICULO: 'veículo',
  FINANCEIRO: 'conta/aplicação financeira',
  QUOTAS: 'participação societária',
  OUTRO: 'bem',
};

/* ---------- redação padrão local (fallback sem IA) ---------- */

function redacaoLocal(d: DadosPeticaoJudicial): SecaoRedigida[] {
  const nome = (d.falecido.nome?.trim() || LACUNA).toUpperCase();
  const temIncapaz = d.herdeiros.some((h) => h.menorOuIncapaz);
  const s: SecaoRedigida[] = [];

  s.push({
    titulo: 'I — DOS FATOS',
    paragrafos: [
      `${nome}${d.falecido.cpf?.trim() ? `, inscrito(a) no CPF sob nº ${d.falecido.cpf.trim()}` : ''}, faleceu em ${d.falecido.dataObito ? formatarData(d.falecido.dataObito) : LACUNA}, tendo por último domicílio ${d.falecido.ultimoDomicilio?.trim() || LACUNA} — foro competente para o inventário, nos termos do art. 48 do Código de Processo Civil (certidão de óbito anexa). ${
        d.temSobrevivente
          ? `Era ${d.vinculo === 'CASAMENTO' ? 'casado(a)' : 'convivente em união estável'} com ${(d.nomeSobrev.trim() || LACUNA).toUpperCase()}, sob o regime da ${ROTULO_REGIME[d.regime]}${d.falecido.dataCasamento ? `, desde ${formatarData(d.falecido.dataCasamento)}` : ''}.`
          : 'Não deixou cônjuge ou companheiro(a) sobrevivente.'
      } Deixou ${d.herdeiros.length} herdeiro(s), qualificado(s) no preâmbulo.`,
      `A sucessão abriu-se no momento do óbito, transmitindo-se desde logo a herança aos herdeiros legítimos (CC, art. 1.784 — princípio da saisine).${
        temIncapaz
          ? ' Há herdeiro menor ou incapaz entre os sucessores, impondo-se a intervenção do Ministério Público (CPC, art. 178, II).'
          : ''
      }`,
    ],
  });

  s.push({
    titulo: 'II — DO CABIMENTO DA VIA JUDICIAL E DO PROCEDIMENTO',
    paragrafos: [
      `O inventário judicial é o rito adequado ao caso, na forma dos arts. 610 e seguintes do Código de Processo Civil${
        temIncapaz
          ? ', notadamente pela presença de herdeiro menor ou incapaz — sem prejuízo de eventual conversão à via extrajudicial mediante parecer favorável do Ministério Público (Res. CNJ 35/2007, alterada pela Res. CNJ 571/2024), se as partes assim convierem'
          : `, ${LACUNA} (indicar a razão da via judicial: ausência de consenso, testamento a cumprir, conveniência das partes etc.)`
      }. O requerimento é tempestivo (CPC, art. 611 — instauração em até 2 meses da abertura da sucessão) ou, se ultrapassado o prazo, requer-se o processamento com as consequências fiscais próprias, que não obstam a abertura.`,
      'Estando presentes os pressupostos legais, cabe ao juízo nomear inventariante, que prestará compromisso e apresentará as primeiras declarações no prazo do art. 620 do CPC — as quais, desde já, esta inicial antecipa em seus itens seguintes.',
    ],
  });

  s.push({
    titulo: 'III — DA NOMEAÇÃO DO(A) INVENTARIANTE',
    paragrafos: [
      `Indica-se para o encargo, observada a ordem legal de preferência do art. 617 do CPC, ${
        d.inventarianteId === '__sobrevivente__'
          ? `o(a) cônjuge/companheiro(a) supérstite, ${(d.nomeSobrev.trim() || LACUNA).toUpperCase()}`
          : d.herdeiros.find((h) => h.id === d.inventarianteId)?.nome?.toUpperCase() ?? LACUNA
      }, que se encontra na posse e administração do espólio e declara aceitar o encargo, comprometendo-se a bem e fielmente desempenhá-lo.`,
    ],
  });

  const bensTexto =
    d.bens.length > 0
      ? d.bens.map(
          (b, i) =>
            `${i + 1}. ${descricaoBemMinuta(b)} — ${ROTULO_TIPO[b.tipo ?? 'OUTRO']}, de natureza ${b.natureza === 'COMUM' ? 'comum' : 'particular'}, avaliado em ${brl(b.valor)} na data do óbito.`,
        )
      : [`Bens a inventariar: ${LACUNA} (lançar os bens na folha antes de gerar a minuta).`];
  const dividas = Number(d.dividas || 0);
  s.push({
    titulo: 'IV — DO ACERVO (PRIMEIRAS DECLARAÇÕES — CPC, ART. 620)',
    paragrafos: [
      ...bensTexto,
      ...(dividas > 0 ? [`O espólio responde por dívidas e despesas no total de ${brl(dividas)}, a serem abatidas do monte.`] : []),
      ...(d.resultado && d.resultado.bloqueios.length === 0
        ? [
            `Monte-mor: ${brl(d.resultado.acervo.massaPartilhavel)}${
              d.resultado.meacao ? `; meação do(a) sobrevivente: ${brl(d.resultado.meacao.valor)} (${d.resultado.meacao.fundamento})` : ''
            }; herança transmitida: ${brl(d.resultado.heranca.total)}.`,
          ]
        : []),
    ],
  });

  if (d.resultado && d.resultado.bloqueios.length === 0) {
    s.push({
      titulo: 'V — DO ESBOÇO DE PARTILHA',
      paragrafos: [
        ...(d.resultado.meacao
          ? [
              `Ao(À) sobrevivente, a título de MEAÇÃO — que não integra a herança —, ${d.resultado.meacao.fracao}, correspondente a ${brl(d.resultado.meacao.valor)}.`,
            ]
          : []),
        ...d.resultado.quinhoes.map((q) => {
          const porBem = [
            q.fracaoBemComum ? `${q.fracaoBemComum} de cada bem comum` : '',
            q.fracaoBemParticular ? `${q.fracaoBemParticular} de cada bem particular` : '',
          ]
            .filter(Boolean)
            .join(' e ');
          return `A ${q.nome.toUpperCase()}, na fração de ${q.fracaoHeranca} da herança${porBem ? ` (${porBem})` : ''}, o quinhão de ${brl(q.valor)} — ${q.fundamento}${q.precedente ? ` (${q.precedente})` : ''}.`;
        }),
      ],
    });
  }

  s.push({
    titulo: 'VI — DO ITCMD',
    paragrafos: [
      d.provisao
        ? `O imposto de transmissão causa mortis (Lei estadual nº 10.705/2000) foi apurado sobre a base de ${brl(d.provisao.baseAtualizada)}, no valor de ${brl(d.provisao.imposto)}, com provisão total de ${brl(d.provisao.total)} na data desta minuta, considerados os acréscimos legais. A declaração e o recolhimento serão comprovados nos autos, requerendo-se, se o caso, a expedição de guias.`
        : `Apuração do ITCMD: ${LACUNA} (complete a folha para a provisão automática).`,
    ],
  });

  s.push({
    titulo: 'VII — DOS PEDIDOS',
    paragrafos: [
      `Diante do exposto, requer-se a Vossa Excelência: (a) a abertura do inventário dos bens deixados por ${nome}, com a nomeação do(a) inventariante indicado(a), mediante compromisso (CPC, arts. 617 e 620); (b) o recebimento desta como primeiras declarações, com a citação dos interessados que não subscrevem a inicial — herdeiros, legatários, cônjuge/companheiro(a), Fazenda Pública Estadual e, havendo herdeiro incapaz ou testamento, o Ministério Público (CPC, art. 626); (c) a avaliação dos bens, se necessária, e a homologação do cálculo do imposto; (d) ao final, a homologação da partilha na forma do esboço apresentado (CPC, arts. 647 e 653) — ou da adjudicação, sendo herdeiro único —, com a expedição do formal de partilha e dos alvarás necessários; e (e) a produção de todas as provas admitidas em direito.`,
      `Dá-se à causa o valor de ${d.resultado && d.resultado.bloqueios.length === 0 ? brl(d.resultado.acervo.massaPartilhavel) : `R$ ${LACUNA}`} (monte-mor).`,
    ],
  });

  return s;
}

/* ---------- montagem ---------- */

export async function montarPeticaoJudicialDocx(d: DadosPeticaoJudicial): Promise<Blob> {
  const p: Paragrafo[] = [];
  const nomeFalecido = (d.falecido.nome?.trim() || LACUNA).toUpperCase();
  const comarca = d.falecido.ultimoDomicilio?.trim() || LACUNA;

  p.push({
    texto: 'MINUTA gerada pelo Sucessorista — conferência, complementação das lacunas e assinatura do(a) advogado(a) responsável são obrigatórias antes de qualquer protocolo.',
    centrado: true,
    discreto: true,
  });
  p.push({
    texto: `EXCELENTÍSSIMO(A) SENHOR(A) DOUTOR(A) JUIZ(ÍZA) DE DIREITO DA ${LACUNA}ª VARA DE FAMÍLIA E SUCESSÕES DA COMARCA DE ${comarca.toUpperCase()}`,
    negrito: true,
  });

  /* preâmbulo: requerentes com a qualificação pronta da folha */
  const partes: string[] = [];
  if (d.temSobrevivente) {
    partes.push(
      `${qualificar(d.nomeSobrev.trim() || LACUNA, d.qualificacoes['__sobrevivente__'])}, na qualidade de ${d.vinculo === 'CASAMENTO' ? 'cônjuge supérstite' : 'companheiro(a) supérstite'}`,
    );
  }
  for (const h of d.herdeiros) {
    const papel =
      h.status === 'RENUNCIANTE'
        ? 'herdeiro(a) renunciante'
        : h.status === 'PRE_MORTO'
          ? 'herdeiro(a) pré-morto(a), representado(a) por seus sucessores'
          : 'herdeiro(a)';
    partes.push(`${qualificar(h.nome, d.qualificacoes[h.id])}, na qualidade de ${papel}`);
  }
  p.push({
    texto: `${partes.join('; e ') || LACUNA}, por seu(sua) advogado(a) que esta subscreve (procuração anexa, com endereço para intimações), vêm, respeitosamente, à presença de Vossa Excelência, com fundamento nos arts. 610 e seguintes do Código de Processo Civil, requerer a ABERTURA DE INVENTÁRIO E PARTILHA dos bens deixados por ${nomeFalecido}, pelos fatos e fundamentos a seguir.`,
  });

  /* corpo: redação da IA ou padrão local */
  const secoes = d.secoes && d.secoes.length > 0 ? d.secoes : redacaoLocal(d);
  for (const secao of secoes) {
    p.push({ texto: secao.titulo, titulo: true });
    for (const par of secao.paragrafos) p.push({ texto: par });
  }

  p.push({ texto: 'Nestes termos, pede deferimento.' });
  p.push({ texto: `${comarca.split('/')[0] || LACUNA}, ${dataPorExtenso()}.` });
  p.push({ texto: LACUNA, centrado: true });
  p.push({ texto: `Advogado(a) — OAB/${LACUNA}`, centrado: true });

  // Petição inicial com a identidade do Sucessorista (papel/tinta/bronze).
  return montarDocx(vestirIdentidade(p), { estilo: ESTILO_SUCESSORISTA });
}
