/**
 * Minuta de petição ao Tabelionato — requerimento de lavratura da escritura
 * pública de inventário e partilha, gerado em .docx no NAVEGADOR (jszip, como
 * o gerador de planilha) a partir da folha de trabalho: qualificação das
 * partes, inventariante, acervo, plano de partilha com fundamentos, ITCMD e
 * rol de documentos.
 *
 * REGRA DO MÓDULO: toda saída é MINUTA para conferência e assinatura do
 * advogado responsável — o texto avisa isso e deixa lacunas (______) onde a
 * folha não tem o dado. Nada é protocolado automaticamente.
 */

import type { Bem, Herdeiro, Regime, Resultado, Vinculo } from './types';
import { descricaoBemMinuta } from './descricao-bem';
import { formatarData, type DadosFalecido, type Qualificacao } from './familia';
import type { ProvisaoItcmd } from './itcmd';
import { montarDocx, vestirIdentidade, ESTILO_SUCESSORISTA, type Paragrafo } from './docx';

export interface DadosPeticao {
  falecido: DadosFalecido;
  temSobrevivente: boolean;
  nomeSobrev: string;
  vinculo: Vinculo;
  regime: Regime;
  herdeiros: Herdeiro[];
  qualificacoes: Record<string, Qualificacao>;
  /** '__sobrevivente__', id de herdeiro ou null (vira lacuna na minuta). */
  inventarianteId: string | null;
  bens: Bem[];
  /** Valor decimal ("12345.67") ou vazio. */
  dividas: string;
  resultado: Resultado | null;
  provisao: ProvisaoItcmd | null;
  /** Rol de documentos juntados: título do item + nomes dos arquivos. */
  documentos: { titulo: string; arquivos: string[] }[];
}

/* ---------- texto ---------- */

export const LACUNA = '______________';

export const brl = (v: string | number) =>
  `R$ ${Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const ROTULO_REGIME: Record<Regime, string> = {
  COMUNHAO_PARCIAL: 'comunhão parcial de bens',
  COMUNHAO_UNIVERSAL: 'comunhão universal de bens',
  SEPARACAO_CONVENCIONAL: 'separação convencional de bens',
  SEPARACAO_OBRIGATORIA: 'separação obrigatória de bens',
  PARTICIPACAO_FINAL_AQUESTOS: 'participação final nos aquestos',
};

const ROTULO_TIPO: Record<string, string> = {
  IMOVEL: 'imóvel',
  VEICULO: 'veículo',
  FINANCEIRO: 'conta/aplicação financeira',
  QUOTAS: 'participação societária',
  OUTRO: 'bem',
};

export function dataPorExtenso(iso?: string): string {
  const d = iso ? new Date(`${iso}T00:00`) : new Date();
  return d.toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' });
}

/** "NOME, estado civil, profissão, RG n, CPF n, e-mail, residente em …" */
export function qualificar(nome: string, q?: Qualificacao): string {
  const partes: string[] = [nome.toUpperCase()];
  partes.push(q?.estadoCivil?.trim() || `estado civil ${LACUNA}`);
  partes.push(q?.profissao?.trim() || `profissão ${LACUNA}`);
  partes.push(`portador(a) do RG nº ${q?.rg?.trim() || LACUNA}`);
  partes.push(`inscrito(a) no CPF sob nº ${q?.cpf?.trim() || LACUNA}`);
  if (q?.email?.trim()) partes.push(`e-mail ${q.email.trim()}`);
  const endereco = [q?.endereco, q?.complemento, q?.bairro].filter((x) => x?.trim()).join(', ');
  const cidade = [q?.cidade, q?.uf].filter((x) => x?.trim()).join('/');
  partes.push(
    `residente e domiciliado(a) em ${endereco || LACUNA}${cidade ? `, ${cidade}` : ''}${
      q?.cep?.trim() ? `, CEP ${q.cep.trim()}` : ''
    }`,
  );
  let texto = partes.join(', ');
  if (q?.conjugeNome?.trim()) {
    texto += `, casado(a) com ${q.conjugeNome.trim().toUpperCase()}${
      q.conjugeCpf?.trim() ? `, CPF nº ${q.conjugeCpf.trim()}` : ''
    }`;
  }
  return texto;
}

function montarParagrafos(d: DadosPeticao): Paragrafo[] {
  const p: Paragrafo[] = [];
  const nomeFalecido = d.falecido.nome?.trim() || LACUNA;
  const cidadeTabelionato = d.falecido.ultimoDomicilio?.trim() || LACUNA;
  const temIncapaz = d.herdeiros.some((h) => h.menorOuIncapaz);

  const inventariante =
    d.inventarianteId === '__sobrevivente__'
      ? d.nomeSobrev.trim() || 'o(a) cônjuge/companheiro(a) sobrevivente'
      : d.herdeiros.find((h) => h.id === d.inventarianteId)?.nome ?? null;

  p.push({
    texto: 'MINUTA gerada pelo Sucessorista a partir da folha de trabalho — conferência, complementação das lacunas e assinatura do(a) advogado(a) responsável são obrigatórias antes de qualquer protocolo.',
    centrado: true,
  });
  if (temIncapaz) {
    p.push({
      texto: 'ATENÇÃO: há herdeiro menor ou incapaz lançado na folha — a escritura depende de parecer favorável do Ministério Público e da preservação do quinhão do incapaz (Res. CNJ 35/2007, alterada pela Res. CNJ 571/2024); sem o parecer, o caso segue pela via judicial.',
      centrado: true,
      negrito: true,
    });
  }

  p.push({ texto: `AO TABELIONATO DE NOTAS DE ${cidadeTabelionato.toUpperCase()}`, negrito: true });
  p.push({
    texto: 'REQUERIMENTO DE LAVRATURA DE ESCRITURA PÚBLICA DE INVENTÁRIO E PARTILHA (CPC, art. 610, §§ 1º e 2º; Resolução CNJ nº 35/2007)',
    negrito: true,
    centrado: true,
  });

  /* preâmbulo com a qualificação das partes */
  const partesQualificadas: string[] = [];
  if (d.temSobrevivente) {
    partesQualificadas.push(
      `${qualificar(d.nomeSobrev.trim() || LACUNA, d.qualificacoes['__sobrevivente__'])}, na qualidade de ${
        d.vinculo === 'CASAMENTO' ? 'cônjuge supérstite' : 'companheiro(a) supérstite'
      }`,
    );
  }
  for (const h of d.herdeiros) {
    const papel =
      h.status === 'RENUNCIANTE'
        ? 'herdeiro(a) renunciante'
        : h.status === 'PRE_MORTO'
          ? 'herdeiro(a) pré-morto(a), representado(a) por seus sucessores'
          : 'herdeiro(a)';
    partesQualificadas.push(`${qualificar(h.nome, d.qualificacoes[h.id])}, na qualidade de ${papel}`);
  }
  p.push({
    texto: `${partesQualificadas.join('; e ')}, vêm, por intermédio de seu(sua) advogado(a) que esta subscreve (procurações anexas), requerer a lavratura de ESCRITURA PÚBLICA DE INVENTÁRIO E PARTILHA dos bens deixados por ${nomeFalecido.toUpperCase()}, pelos fatos e fundamentos a seguir.`,
  });

  /* I — autor da herança */
  p.push({ texto: 'I — DO(A) AUTOR(A) DA HERANÇA', titulo: true });
  p.push({
    texto: `${nomeFalecido.toUpperCase()}${d.falecido.cpf?.trim() ? `, inscrito(a) no CPF sob nº ${d.falecido.cpf.trim()}` : ''}, faleceu em ${
      d.falecido.dataObito ? formatarData(d.falecido.dataObito) : LACUNA
    }, tendo por último domicílio ${d.falecido.ultimoDomicilio?.trim() || LACUNA} (certidão de óbito anexa). ${
      d.temSobrevivente
        ? `Era ${d.vinculo === 'CASAMENTO' ? 'casado(a)' : 'convivente em união estável'} com ${
            d.nomeSobrev.trim().toUpperCase() || LACUNA
          } sob o regime da ${ROTULO_REGIME[d.regime]}${
            d.falecido.dataCasamento ? `, desde ${formatarData(d.falecido.dataCasamento)}` : ''
          }.`
        : 'Não deixou cônjuge ou companheiro(a) sobrevivente.'
    } Deixou ${d.herdeiros.length} herdeiro(s), acima qualificado(s).`,
  });

  /* II — requisitos do art. 610 */
  p.push({ texto: 'II — DO CABIMENTO DA VIA EXTRAJUDICIAL', titulo: true });
  p.push({
    texto: `As partes declaram, sob as penas da lei: (a) que ${
      temIncapaz
        ? 'há herdeiro menor ou incapaz, devidamente representado/assistido, hipótese hoje admitida na via extrajudicial mediante parecer favorável do Ministério Público e preservação integral do quinhão do incapaz (Resolução CNJ nº 35/2007, com as alterações da Resolução CNJ nº 571/2024), cuja colheita se requer'
        : 'todos os herdeiros são maiores e capazes'
    }; (b) que há consenso quanto à partilha adiante descrita; e (c) que o(a) autor(a) da herança não deixou testamento conhecido, conforme certidão negativa do CENSEC/RCTO anexa — presentes, assim, os requisitos do art. 610, § 1º, do CPC e da Resolução CNJ nº 35/2007.`,
  });

  /* III — inventariante */
  p.push({ texto: 'III — DA NOMEAÇÃO DO(A) INVENTARIANTE', titulo: true });
  p.push({
    texto: `As partes indicam para exercer as funções de inventariante ${
      inventariante ? inventariante.toUpperCase() : LACUNA
    }, na forma do art. 11 da Resolução CNJ nº 35/2007, observada a ordem de preferência do art. 617 do CPC, que declara aceitar o encargo e assume as responsabilidades correspondentes desde a lavratura.`,
  });

  /* IV — acervo */
  p.push({ texto: 'IV — DO ACERVO', titulo: true });
  if (d.bens.length === 0) {
    p.push({ texto: `Bens a inventariar: ${LACUNA} (lançar os bens na folha antes de gerar a minuta).` });
  } else {
    d.bens.forEach((b, i) => {
      p.push({
        texto: `${i + 1}. ${descricaoBemMinuta(b)} — ${ROTULO_TIPO[b.tipo ?? 'OUTRO']}, de natureza ${
          b.natureza === 'COMUM' ? 'comum' : 'particular'
        }, avaliado em ${brl(b.valor)} na data do óbito.`,
      });
    });
  }
  const dividas = Number(d.dividas || 0);
  if (dividas > 0) {
    p.push({ texto: `O espólio responde por dívidas e despesas no total de ${brl(dividas)}, abatidas do monte.` });
  }
  if (d.resultado && d.resultado.bloqueios.length === 0) {
    p.push({
      texto: `Monte-mor: ${brl(d.resultado.acervo.massaPartilhavel)}${
        d.resultado.meacao
          ? `; meação do(a) sobrevivente: ${brl(d.resultado.meacao.valor)} (${d.resultado.meacao.fundamento})`
          : ''
      }; herança transmitida: ${brl(d.resultado.heranca.total)}.`,
    });
  }

  /* V — plano de partilha */
  p.push({ texto: 'V — DO PLANO DE PARTILHA', titulo: true });
  if (!d.resultado || d.resultado.bloqueios.length > 0) {
    p.push({ texto: `Plano de partilha: ${LACUNA} (calcule o espelho na folha antes de gerar a minuta).` });
  } else {
    if (d.resultado.meacao) {
      p.push({
        texto: `Ao(À) sobrevivente ${d.nomeSobrev.trim().toUpperCase() || LACUNA}, a título de MEAÇÃO — que não integra a herança —, a fração de ${d.resultado.meacao.fracao}, correspondente a ${brl(d.resultado.meacao.valor)} (${d.resultado.meacao.fundamento}).`,
      });
    }
    d.resultado.quinhoes.forEach((q) => {
      // Fração ideal POR BEM: nos comuns já vem descontada a meação (viúva
      // meeira + 3 filhos = 1/6 de cada bem comum, não 1/3).
      const porBem = [
        q.fracaoBemComum ? `${q.fracaoBemComum} de cada bem comum` : '',
        q.fracaoBemParticular ? `${q.fracaoBemParticular} de cada bem particular` : '',
      ]
        .filter(Boolean)
        .join(' e ');
      p.push({
        texto: `A ${q.nome.toUpperCase()}, na fração de ${q.fracaoHeranca} da herança${
          porBem ? ` — fração ideal de ${porBem} —` : ','
        } o quinhão de ${brl(q.valor)}${
          q.reservaUmQuartoAplicada ? ', observada a reserva de 1/4 do art. 1.832 do Código Civil' : ''
        } — fundamento: ${q.fundamento}${q.precedente ? ` (${q.precedente})` : ''}.`,
      });
    });
    p.push({
      texto: `Os bens são partilhados nas frações ideais acima${
        d.resultado.meacao
          ? ' — nos bens comuns, a fração dos herdeiros incide sobre a metade que não integra a meação'
          : ''
      }, salvo atribuição diversa consignada na escritura.`,
    });
    for (const a of d.resultado.avisos) p.push({ texto: `Observação: ${a}` });
  }

  /* VI — ITCMD */
  p.push({ texto: 'VI — DO ITCMD', titulo: true });
  if (d.provisao) {
    p.push({
      texto: `O imposto de transmissão causa mortis (Lei estadual nº 10.705/2000) foi apurado sobre a base de ${brl(
        d.provisao.baseAtualizada,
      )} (base da data do óbito atualizada pela UFESP — art. 15), no valor de ${brl(d.provisao.imposto)}${
        d.provisao.parcelas.length > 1
          ? `, com os acréscimos/descontos legais que resultam na provisão de ${brl(d.provisao.total)} na data desta minuta`
          : ''
      }. A declaração eletrônica e o comprovante de recolhimento (DARE) instruem/instruirão o ato, na forma da Portaria CAT.`,
    });
  } else {
    p.push({ texto: `Apuração do ITCMD: ${LACUNA} (complete a folha para a provisão automática).` });
  }

  /* VII — documentos */
  p.push({ texto: 'VII — DOS DOCUMENTOS QUE INSTRUEM O PEDIDO', titulo: true });
  const comAnexo = d.documentos.filter((doc) => doc.arquivos.length > 0);
  if (comAnexo.length === 0) {
    p.push({ texto: `Rol de documentos: ${LACUNA} (anexe os documentos no ambiente do processo).` });
  } else {
    comAnexo.forEach((doc, i) => {
      p.push({ texto: `${i + 1}. ${doc.titulo}: ${doc.arquivos.join('; ')}.` });
    });
  }

  /* VIII — pedidos */
  p.push({ texto: 'VIII — DOS PEDIDOS', titulo: true });
  p.push({
    texto: 'Diante do exposto, requer-se: (a) a designação de data para a lavratura da escritura pública de inventário e partilha; (b) a nomeação do(a) inventariante indicado(a) no item III; (c) a análise dos documentos que instruem este requerimento, com a indicação de eventuais exigências de uma só vez; e (d) a expedição do traslado e das certidões necessárias ao registro e às averbações cabíveis.',
  });

  p.push({ texto: 'Nestes termos, pede deferimento.', centrado: false });
  p.push({ texto: `${cidadeTabelionato.split('/')[0] || LACUNA}, ${dataPorExtenso()}.` });
  p.push({ texto: `${LACUNA}`, centrado: true });
  p.push({ texto: `Advogado(a) — OAB/${LACUNA}`, centrado: true });

  return p;
}

/** Gera a minuta em .docx (builder compartilhado — A4, Times 12, justificado). */
export async function montarPeticaoDocx(
  dados: DadosPeticao,
  /** Seções adicionais (instruções do advogado redigidas pela IA) — entram antes do fecho. */
  extras?: { titulo: string; paragrafos: string[] }[] | null,
): Promise<Blob> {
  const paragrafos = montarParagrafos(dados);
  if (extras && extras.length > 0) {
    const fecho = paragrafos.findIndex((p) => p.texto.startsWith('Nestes termos'));
    const inseridos = extras.flatMap((s) => [
      { texto: s.titulo, titulo: true },
      ...s.paragrafos.map((texto) => ({ texto })),
    ]);
    paragrafos.splice(fecho < 0 ? paragrafos.length : fecho, 0, ...inseridos);
  }
  // Minuta ao Tabelionato com a identidade do Sucessorista (papel/tinta/bronze).
  return montarDocx(vestirIdentidade(paragrafos), { estilo: ESTILO_SUCESSORISTA });
}
