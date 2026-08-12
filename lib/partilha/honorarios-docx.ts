/**
 * Proposta e contrato de honorários em .docx — gerados no NAVEGADOR com a
 * qualificação das partes já pronta (vem da folha) e a marca do escritório
 * (logo + identificação) no topo, quando cadastrada.
 *
 * A REDAÇÃO do corpo pode vir da IA (rota interna /api/sucessorista) ou da
 * redação padrão local abaixo — mas os NÚMEROS nunca são da IA: o quadro de
 * honorários é sempre montado deterministicamente a partir das condições
 * digitadas, e tudo sai como MINUTA para revisão do advogado.
 */

import { montarDocx, type LogoDocx, type Paragrafo } from './docx';
import { qualificar, dataPorExtenso, brl, LACUNA } from './peticao';
import type { Qualificacao, DadosFalecido } from './familia';
import {
  ROTULO_NIVEL,
  type AvaliacaoComplexidade,
  type CondicoesHonorarios,
} from './honorarios';

/** Identificação do escritório (marca branca) — persiste no navegador. */
export interface DadosEscritorio {
  escritorio: string;
  advogado: string;
  oab: string;
  cpfCnpj: string;
  endereco: string;
  cidadeUf: string;
  email: string;
  telefone: string;
  logoDataUrl: string | null;
  logoLarguraPx: number | null;
  logoAlturaPx: number | null;
}

export const ESCRITORIO_VAZIO: DadosEscritorio = {
  escritorio: '',
  advogado: '',
  oab: '',
  cpfCnpj: '',
  endereco: '',
  cidadeUf: '',
  email: '',
  telefone: '',
  logoDataUrl: null,
  logoLarguraPx: null,
  logoAlturaPx: null,
};

/** Seção redigida (pela IA ou pela redação local). */
export interface SecaoRedigida {
  titulo: string;
  paragrafos: string[];
}

export interface DadosHonorariosDocx {
  tipo: 'PROPOSTA' | 'CONTRATO';
  escritorio: DadosEscritorio;
  /** Contratantes com a qualificação pronta da folha. */
  contratantes: { nome: string; qualificacao?: Qualificacao }[];
  falecido: DadosFalecido;
  qtdHerdeiros: number;
  qtdBens: number;
  /** Massa partilhável ("monte-mor") decimal, ou null sem espelho. */
  monteMor: string | null;
  avaliacao: AvaliacaoComplexidade;
  condicoes: CondicoesHonorarios;
  /** Valor contratado em reais, ou null quando as condições não fecham. */
  valorContratado: number | null;
  /** Corpo redigido pela IA; null = redação padrão local. */
  secoes: SecaoRedigida[] | null;
}

/* ---------- redação padrão local (fallback sem IA) ---------- */

function descricaoDoServico(d: DadosHonorariosDocx): string {
  const nome = d.falecido.nome?.trim().toUpperCase() || LACUNA;
  return `inventário e partilha dos bens deixados por ${nome}, pela via ${
    d.avaliacao.viaJudicial
      ? 'judicial (há herdeiro menor ou incapaz — CPC, art. 610, caput)'
      : 'extrajudicial (CPC, art. 610, § 1º), com migração para a judicial se sobrevier hipótese legal'
  }`;
}

function textoHonorarios(d: DadosHonorariosDocx): string {
  const pct = d.condicoes.percentual.trim();
  if (d.condicoes.forma === 'PERCENTUAL') {
    return `honorários de ${pct || LACUNA}% (por cento) sobre o valor do monte-mor${
      d.monteMor
        ? ` — hoje estimado em ${brl(d.monteMor)}, o que corresponde a ${
            d.valorContratado !== null ? brl(d.valorContratado) : LACUNA
          }`
        : ''
    }, apurado na conclusão dos trabalhos`;
  }
  return `honorários fixos de ${d.valorContratado !== null ? brl(d.valorContratado) : LACUNA}`;
}

function redacaoLocalProposta(d: DadosHonorariosDocx): SecaoRedigida[] {
  const fatores =
    d.avaliacao.fatores.length > 0
      ? `Pesam na avaliação: ${d.avaliacao.fatores.map((f) => f.rotulo.toLowerCase()).join('; ')}.`
      : 'Caso sem fatores de agravamento identificados na folha de trabalho.';
  return [
    {
      titulo: 'I — OBJETO DA PROPOSTA',
      paragrafos: [
        `Apresentamos proposta de prestação de serviços advocatícios para o ${descricaoDoServico(d)}, compreendendo ${d.qtdHerdeiros} herdeiro(s) e ${d.qtdBens} bem(ns) inventariado(s) até esta data.`,
      ],
    },
    {
      titulo: 'II — ESCOPO DOS SERVIÇOS',
      paragrafos: [
        'Os serviços abrangem: (a) análise da documentação e orientação das partes; (b) levantamento e regularização do acervo; (c) apuração, declaração e acompanhamento do ITCMD; (d) elaboração do plano de partilha e da minuta da escritura (ou das peças processuais, na via judicial); (e) acompanhamento perante o tabelionato e demais órgãos até a lavratura; e (f) orientação para os registros e as averbações decorrentes.',
        'Não estão incluídos: custas, emolumentos, tributos (inclusive o ITCMD), certidões e despesas de terceiros, que correm por conta dos contratantes; e serviços estranhos ao inventário, objeto de contratação própria.',
      ],
    },
    {
      titulo: 'III — HONORÁRIOS PROPOSTOS',
      paragrafos: [
        `A complexidade do caso foi avaliada como ${ROTULO_NIVEL[d.avaliacao.nivel].toUpperCase()}. ${fatores}`,
        `Propomos ${textoHonorarios(d)}.${
          d.condicoes.condicoesPagamento.trim()
            ? ` Condições de pagamento: ${d.condicoes.condicoesPagamento.trim()}.`
            : ''
        }`,
      ],
    },
    {
      titulo: 'IV — VALIDADE E ACEITE',
      paragrafos: [
        'Esta proposta é válida por 30 (trinta) dias. O aceite se formaliza pela assinatura do contrato de honorários correspondente, quando então os trabalhos terão início.',
      ],
    },
  ];
}

function redacaoLocalContrato(d: DadosHonorariosDocx): SecaoRedigida[] {
  return [
    {
      titulo: 'CLÁUSULA 1ª — OBJETO',
      paragrafos: [
        `O presente contrato tem por objeto a prestação de serviços advocatícios no ${descricaoDoServico(d)}, abrangendo a orientação das partes, o levantamento do acervo, a apuração e a declaração do ITCMD, o plano de partilha, a minuta e o acompanhamento da escritura (ou das peças processuais, na via judicial) e a orientação para os registros decorrentes.`,
      ],
    },
    {
      titulo: 'CLÁUSULA 2ª — OBRIGAÇÕES DO(A) CONTRATADO(A)',
      paragrafos: [
        'O(A) CONTRATADO(A) empregará a diligência exigida pelo Estatuto da Advocacia (Lei nº 8.906/1994) e pelo Código de Ética e Disciplina da OAB, mantendo os contratantes informados do andamento e guardando sigilo profissional sobre os documentos e dados recebidos.',
      ],
    },
    {
      titulo: 'CLÁUSULA 3ª — OBRIGAÇÕES DOS(AS) CONTRATANTES',
      paragrafos: [
        'Os(As) CONTRATANTES fornecerão os documentos e as informações necessários, com veracidade e em tempo hábil, e arcarão com custas, emolumentos, tributos (inclusive o ITCMD), certidões e despesas de terceiros, que não integram os honorários.',
      ],
    },
    {
      titulo: 'CLÁUSULA 4ª — HONORÁRIOS E FORMA DE PAGAMENTO',
      paragrafos: [
        `Pelos serviços descritos, os(as) CONTRATANTES pagarão ${textoHonorarios(d)} (Lei nº 8.906/1994, art. 22).${
          d.condicoes.condicoesPagamento.trim()
            ? ` Forma de pagamento: ${d.condicoes.condicoesPagamento.trim()}.`
            : ` Forma de pagamento: ${LACUNA}.`
        }`,
        'Em caso de mora, incidem atualização monetária e juros legais, sem prejuízo da suspensão dos trabalhos após notificação.',
      ],
    },
    {
      titulo: 'CLÁUSULA 5ª — RESCISÃO',
      paragrafos: [
        'Qualquer parte pode resilir o contrato mediante notificação. Rescindido o contrato, são devidos os honorários proporcionais ao trabalho realizado até a data da rescisão, na forma do art. 22 da Lei nº 8.906/1994.',
      ],
    },
    {
      titulo: 'CLÁUSULA 6ª — FORO',
      paragrafos: [
        `Fica eleito o foro da comarca de ${d.escritorio.cidadeUf.trim() || d.falecido.ultimoDomicilio?.trim() || LACUNA} para dirimir as questões oriundas deste contrato.`,
      ],
    },
  ];
}

/* ---------- montagem ---------- */

function cabecalhoEscritorio(e: DadosEscritorio, p: Paragrafo[]) {
  const temIdentificacao = e.escritorio.trim() || e.advogado.trim();
  if (!temIdentificacao) return;
  if (e.escritorio.trim()) p.push({ texto: e.escritorio.trim(), negrito: true, centrado: true });
  const linhaAdvogado = [
    e.advogado.trim(),
    e.oab.trim() ? `OAB ${e.oab.trim()}` : '',
    e.cpfCnpj.trim() ? `CPF/CNPJ ${e.cpfCnpj.trim()}` : '',
  ]
    .filter(Boolean)
    .join(' — ');
  if (linhaAdvogado) p.push({ texto: linhaAdvogado, centrado: true, discreto: true });
  const linhaContato = [
    [e.endereco.trim(), e.cidadeUf.trim()].filter(Boolean).join(' — '),
    e.telefone.trim(),
    e.email.trim(),
  ]
    .filter(Boolean)
    .join(' · ');
  if (linhaContato) p.push({ texto: linhaContato, centrado: true, discreto: true });
}

export async function montarHonorariosDocx(d: DadosHonorariosDocx): Promise<Blob> {
  const p: Paragrafo[] = [];
  const ehContrato = d.tipo === 'CONTRATO';

  cabecalhoEscritorio(d.escritorio, p);

  p.push({
    texto: 'MINUTA gerada pelo Sucessorista — conferência, complementação das lacunas e assinatura do(a) advogado(a) responsável são obrigatórias.',
    centrado: true,
    discreto: true,
  });

  p.push({
    texto: ehContrato
      ? 'CONTRATO DE PRESTAÇÃO DE SERVIÇOS ADVOCATÍCIOS E HONORÁRIOS'
      : 'PROPOSTA DE HONORÁRIOS ADVOCATÍCIOS',
    negrito: true,
    centrado: true,
  });

  /* preâmbulo com a qualificação pronta das partes */
  const partes = d.contratantes.length
    ? d.contratantes.map((c) => qualificar(c.nome || LACUNA, c.qualificacao)).join('; e ')
    : LACUNA;
  const contratado = [
    (d.escritorio.escritorio.trim() || d.escritorio.advogado.trim() || LACUNA).toUpperCase(),
    d.escritorio.advogado.trim() && d.escritorio.escritorio.trim()
      ? `neste ato representado(a) por ${d.escritorio.advogado.trim()}`
      : '',
    d.escritorio.oab.trim() ? `OAB ${d.escritorio.oab.trim()}` : `OAB ${LACUNA}`,
    d.escritorio.cpfCnpj.trim() ? `CPF/CNPJ ${d.escritorio.cpfCnpj.trim()}` : '',
    [d.escritorio.endereco.trim(), d.escritorio.cidadeUf.trim()].filter(Boolean).length
      ? `com endereço profissional em ${[d.escritorio.endereco.trim(), d.escritorio.cidadeUf.trim()]
          .filter(Boolean)
          .join(', ')}`
      : '',
  ]
    .filter(Boolean)
    .join(', ');

  if (ehContrato) {
    p.push({
      texto: `CONTRATANTE(S): ${partes}.`,
    });
    p.push({ texto: `CONTRATADO(A): ${contratado}.` });
    p.push({
      texto: 'As partes acima qualificadas celebram o presente contrato de prestação de serviços advocatícios, que se regerá pela Lei nº 8.906/1994, pelo Código Civil e pelas cláusulas seguintes.',
    });
  } else {
    p.push({ texto: `Ao(s) Sr.(s)/Sra.(s): ${partes}.` });
    p.push({ texto: `Proponente: ${contratado}.` });
  }

  /* corpo: redação da IA ou padrão local */
  const secoes =
    d.secoes && d.secoes.length > 0
      ? d.secoes
      : ehContrato
        ? redacaoLocalContrato(d)
        : redacaoLocalProposta(d);
  for (const s of secoes) {
    p.push({ texto: s.titulo, titulo: true });
    for (const par of s.paragrafos) p.push({ texto: par });
  }

  /* quadro-resumo determinístico: os números NUNCA vêm da redação */
  p.push({ texto: 'QUADRO-RESUMO DOS HONORÁRIOS', titulo: true });
  p.push({
    texto: `Forma: ${
      d.condicoes.forma === 'PERCENTUAL'
        ? `percentual de ${d.condicoes.percentual.trim() || LACUNA}% sobre o monte-mor`
        : 'valor fixo'
    }. ${
      d.monteMor ? `Monte-mor de referência: ${brl(d.monteMor)}. ` : ''
    }Valor ${ehContrato ? 'contratado' : 'proposto'}: ${
      d.valorContratado !== null ? brl(d.valorContratado) : LACUNA
    }. Condições de pagamento: ${d.condicoes.condicoesPagamento.trim() || LACUNA}. Complexidade avaliada: ${
      ROTULO_NIVEL[d.avaliacao.nivel]
    }. Custas, emolumentos, tributos (inclusive ITCMD) e despesas de terceiros não integram os honorários.`,
  });

  /* fecho e assinaturas */
  p.push({
    texto: `${(d.escritorio.cidadeUf.trim() || d.falecido.ultimoDomicilio?.trim() || LACUNA).split('/')[0]}, ${dataPorExtenso()}.`,
  });
  p.push({ texto: LACUNA, centrado: true });
  p.push({
    texto: `${d.escritorio.advogado.trim() || 'Advogado(a)'} — OAB ${d.escritorio.oab.trim() || LACUNA}`,
    centrado: true,
  });
  if (ehContrato) {
    for (const c of d.contratantes) {
      p.push({ texto: LACUNA, centrado: true });
      p.push({ texto: c.nome || LACUNA, centrado: true });
    }
    p.push({ texto: `Testemunhas: 1. ${LACUNA}  2. ${LACUNA}`, centrado: false });
  } else {
    p.push({
      texto: `De acordo (aceite da proposta): ${LACUNA} — data: ${LACUNA}.`,
    });
  }

  const logo: LogoDocx | null =
    d.escritorio.logoDataUrl && d.escritorio.logoLarguraPx && d.escritorio.logoAlturaPx
      ? {
          dataUrl: d.escritorio.logoDataUrl,
          larguraPx: d.escritorio.logoLarguraPx,
          alturaPx: d.escritorio.logoAlturaPx,
        }
      : null;
  return montarDocx(p, { logo });
}
