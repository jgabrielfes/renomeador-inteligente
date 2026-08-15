/**
 * Mapeador de OPORTUNIDADES DE ECONOMIA do inventário — São Paulo.
 *
 * Motor PURO (com testes): recebe o retrato do caso e devolve as
 * oportunidades de economia real para a família, cada uma com fundamento
 * legal, economia estimada (quando quantificável daqui) e as condições a
 * confirmar. Duas naturezas:
 *
 *  - IMEDIATA: reduz o custo DESTE inventário (isenções, desconto de prazo,
 *    multa evitada, torna dentro da isenção de doação).
 *  - FUTURA: planejamento na própria partilha que evita custo adiante — o
 *    caso clássico é a nua-propriedade aos herdeiros com usufruto vitalício
 *    do(a) sobrevivente: a morte do(a) usufrutuário(a) apenas EXTINGUE o
 *    usufruto, e a extinção de usufruto NÃO é fato gerador do ITCMD na Lei
 *    10.705/2000 (diferente da lei anterior, 9.591/66) — o bem não entra no
 *    segundo inventário.
 *
 * Tudo aqui é SUGESTÃO de planejamento sucessório lícito — a decisão, a
 * conferência das condições de fato e a validação jurídica são do(a)
 * advogado(a) responsável. Números sempre do motor, nunca de IA.
 */

export interface OportunidadeEconomia {
  id: string;
  titulo: string;
  explicacao: string;
  fundamento: string;
  /** Economia estimada em R$; null = economia real, mas não quantificável daqui. */
  economiaEstimada: number | null;
  /** IMEDIATA = neste inventário · FUTURA = evita custo no segundo óbito. */
  horizonte: 'IMEDIATA' | 'FUTURA';
  /** true = a folha atual JÁ aproveita (economia garantida, não sugestão). */
  aplicada: boolean;
  /** Requisitos que o sistema não verifica sozinho — confirmar caso a caso. */
  condicoes: string[];
}

export interface TransferenciaEconomia {
  valor: number;
  titulo: 'GRATUITO' | 'ONEROSO';
  tributo: 'ITCMD_DOACAO' | 'ITBI';
  /** Imposto apurado pela atribuição (0 = isenta; null = não calculável). */
  imposto: number | null;
}

export interface EntradaEconomia {
  /** Meação + quinhão do(a) sobrevivente em R$ (o que transitaria no 2º inventário). */
  valorSobrevivente: number;
  nomeSobrevivente: string | null;
  bens: { descricao: string; valor: number; tipo?: string }[];
  /** ITCMD provisionado deste inventário (imposto cheio, sem encargos), ou null. */
  imposto: number | null;
  diasDesdeObito: number | null;
  /** Inventário já requerido/protocolado? */
  protocolado: boolean;
  /** Valor já identificado como isento pela leitura do art. 6º, I. */
  valorIsento: number;
  /** UFESP de referência (mede a isenção de doação do art. 6º, II, "a"). */
  ufespReferencia: number | null;
  /** Herdeiros que recebem (donatários da torna da reserva de usufruto). */
  qtdHerdeiros: number;
  /** Rito provável extrajudicial? (null = indefinido; habilita teses próprias). */
  extrajudicial?: boolean | null;
  /** Acertos da partilha diferenciada (tornas), quando montada. */
  transferencias: TransferenciaEconomia[];
}

const ALIQUOTA = 0.04; // art. 16 (Lei 10.992/2001)

const r2 = (v: number) => Math.round(v * 100) / 100;
const fmt = (v: number) =>
  `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function mapearEconomias(e: EntradaEconomia): OportunidadeEconomia[] {
  const lista: OportunidadeEconomia[] = [];
  const imoveis = e.bens.filter((b) => b.tipo === 'IMOVEL' && b.valor > 0);
  const valorImoveis = imoveis.reduce((a, b) => a + b.valor, 0);
  const dias = e.diasDesdeObito;

  /* --- já garantidas nesta folha --- */

  if (e.valorIsento > 0) {
    lista.push({
      id: 'isencao-art6',
      titulo: 'Isenções do art. 6º já abatendo a base',
      explicacao: `A leitura automática identificou ${fmt(e.valorIsento)} em bens possivelmente isentos — o imposto cai ${fmt(r2(e.valorIsento * ALIQUOTA))} em relação à base cheia. A isenção é declarada no próprio sistema da declaração do ITCMD.`,
      fundamento: 'Lei 10.705/2000, art. 6º, I',
      economiaEstimada: r2(e.valorIsento * ALIQUOTA),
      horizonte: 'IMEDIATA',
      aplicada: true,
      condicoes: ['Confirmar as condições de fato de cada hipótese na aba IV (residência, único imóvel etc.).'],
    });
  }

  const tornasIsentas = e.transferencias.filter(
    (t) => t.tributo === 'ITCMD_DOACAO' && (t.imposto ?? 0) === 0,
  );
  const somaTornasIsentas = tornasIsentas.reduce((a, t) => a + t.valor, 0);
  if (somaTornasIsentas > 0) {
    lista.push({
      id: 'torna-gratuita-isenta',
      titulo: 'Torna gratuita dentro da isenção de doação',
      explicacao: `A diferença de quinhão cedida de graça (${fmt(somaTornasIsentas)}) cabe na isenção de doação de até 2.500 UFESPs por donatário no ano civil — sem ITCMD de doação e sem ITBI. Cessão equivalente compensada em dinheiro atrairia ITBI municipal sobre a parte imobiliária.`,
      fundamento: 'Lei 10.705/2000, art. 6º, II, "a"',
      economiaEstimada: r2(somaTornasIsentas * ALIQUOTA),
      horizonte: 'IMEDIATA',
      aplicada: true,
      condicoes: [
        'Somar outras doações do MESMO doador ao MESMO donatário no ano civil — o teto é anual, por par.',
        'Declarar a doação isenta na declaração própria (inter vivos), separada da causa mortis.',
      ],
    });
  }

  /* --- prazos fiscais (o relógio é a economia) --- */

  if (e.imposto !== null && e.imposto > 0 && dias !== null) {
    if (dias <= 90) {
      lista.push({
        id: 'desconto-90-dias',
        titulo: `Recolher em até 90 dias do óbito: desconto de 5% (restam ${90 - dias} dia(s))`,
        explicacao: `Recolhendo o ITCMD dentro de 90 dias da abertura da sucessão, o imposto cai ${fmt(r2(e.imposto * 0.05))}.`,
        fundamento: 'Lei 10.705/2000, art. 17, §2º',
        economiaEstimada: r2(e.imposto * 0.05),
        horizonte: 'IMEDIATA',
        aplicada: false,
        condicoes: ['Base de cálculo fechada (acervo completo) a tempo de emitir a guia.'],
      });
    } else if (dias <= 180) {
      lista.push({
        id: 'vencimento-180-dias',
        titulo: `Recolher até o vencimento evita multa moratória e juros (restam ${180 - dias} dia(s))`,
        explicacao: `Após 180 dias do óbito correm multa moratória de 0,33% por dia (até 20% = ${fmt(r2(e.imposto * 0.2))}) e juros pela Selic (piso de 1% ao mês). Recolher no prazo zera esses encargos.`,
        fundamento: 'Lei 10.705/2000, arts. 17, §1º, 19 e 20',
        economiaEstimada: null,
        horizonte: 'IMEDIATA',
        aplicada: false,
        condicoes: [],
      });
    }
    if (!e.protocolado && dias <= 60) {
      lista.push({
        id: 'abertura-60-dias',
        titulo: `Requerer o inventário em até 60 dias evita a multa de 10% (restam ${60 - dias} dia(s))`,
        explicacao: `Inventário não requerido em 60 dias do óbito sofre multa de 10% do imposto (${fmt(r2(e.imposto * 0.1))}); acima de 180 dias, 20%.`,
        fundamento: 'Lei 10.705/2000, art. 21, I',
        economiaEstimada: r2(e.imposto * 0.1),
        horizonte: 'IMEDIATA',
        aplicada: false,
        condicoes: [],
      });
    } else if (!e.protocolado && dias <= 180) {
      lista.push({
        id: 'abertura-180-dias',
        titulo: 'Requerer o inventário antes do 181º dia impede a multa de dobrar',
        explicacao: `A multa de abertura tardia já incide em 10%; passando de 180 dias ela dobra para 20% — requerer agora poupa ${fmt(r2(e.imposto * 0.1))}. No extrajudicial, o TJSP tem afastado a multa contando o prazo da nomeação do inventariante (cenário adicional de defesa).`,
        fundamento: 'Lei 10.705/2000, art. 21, I; NSCGJ-SP, Cap. XIV, item 105.2',
        economiaEstimada: r2(e.imposto * 0.1),
        horizonte: 'IMEDIATA',
        aplicada: false,
        condicoes: [],
      });
    }

    // Passado o prazo, a economia muda de natureza: vira TESE DE DEFESA — o
    // TJSP tem precedentes afastando a multa de abertura no EXTRAJUDICIAL
    // (o art. 21, I fala em inventário "não requerido no prazo", redação
    // pensada para o processo judicial) ou contando o prazo de outro marco.
    if (dias > 180 && e.extrajudicial !== false) {
      lista.push({
        id: 'defesa-multa-abertura',
        titulo: 'Multa de abertura tardia: tese de defesa no inventário extrajudicial',
        explicacao: `A multa de 20% por abertura tardia (${fmt(r2(e.imposto * 0.2))}) foi redigida para o inventário JUDICIAL "não requerido no prazo" — no EXTRAJUDICIAL o TJSP tem precedentes afastando-a ou deslocando o termo inicial (nomeação do inventariante/lavratura). Vale avaliar a impugnação administrativa ou judicial da multa antes de recolher.`,
        fundamento: 'Lei 10.705/2000, art. 21, I; precedentes do TJSP sobre a via extrajudicial',
        economiaEstimada: r2(e.imposto * 0.2),
        horizonte: 'IMEDIATA',
        aplicada: false,
        condicoes: [
          'Tese não pacificada: pesar o custo e o tempo da discussão contra o valor da multa — a decisão é do(a) advogado(a).',
          'A guia pode ser recolhida com ressalva para não travar a lavratura, discutindo a multa em restituição.',
        ],
      });
    }
  }

  /* --- planejamento na partilha: o segundo inventário ---
     A sugestão do usufruto NÃO é automática: atribuir os imóveis aos
     herdeiros gera uma TORNA do(a) sobrevivente (a parte do direito dele(a)
     que não se compensa com os demais bens) — e torna cedida de graça é
     DOAÇÃO, com ITCMD inter vivos AGORA sobre o que passar da isenção de
     2.500 UFESPs por donatário/ano. A economia só é real quando essa torna
     cabe na isenção (ou quando nem há torna); havendo excesso, o card muda
     de tom: aponta o imposto antecipado e sugere limitar/escalonar. */

  if (e.valorSobrevivente > 0 && imoveis.length > 0) {
    const baseFutura = Math.min(e.valorSobrevivente, valorImoveis);
    const nome = e.nomeSobrevivente?.trim() || 'o(a) sobrevivente';
    const valorNaoImoveis = e.bens
      .filter((b) => b.tipo !== 'IMOVEL' && b.valor > 0)
      .reduce((a, b) => a + b.valor, 0);
    // Torna da reserva: o que o(a) sobrevivente deixa de receber em imóveis
    // e NÃO consegue compensar com os demais bens — vira cessão gratuita.
    const tornaReserva = r2(Math.min(baseFutura, Math.max(0, e.valorSobrevivente - valorNaoImoveis)));
    const tetoIsencao = e.ufespReferencia ? r2(2500 * e.ufespReferencia * Math.max(1, e.qtdHerdeiros)) : null;
    const excesso = tetoIsencao === null ? 0 : r2(Math.max(0, tornaReserva - tetoIsencao));
    const itcmdInterVivos = r2(excesso * ALIQUOTA);
    const economiaFutura = r2(baseFutura * ALIQUOTA);
    const economiaLiquida = r2(economiaFutura - itcmdInterVivos);

    const situacaoTorna =
      tornaReserva <= 0
        ? `Nesta montagem a compensação fecha com os demais bens — ${nome} não cede nada de graça, e não há ITCMD inter vivos.`
        : excesso <= 0
          ? `A torna da reserva (${fmt(tornaReserva)}) CABE na isenção de doação de 2.500 UFESPs por donatário/ano${tetoIsencao ? ` (${fmt(tetoIsencao)} no total para ${Math.max(1, e.qtdHerdeiros)} herdeiro(s))` : ''} — sem ITCMD inter vivos: a economia é real.`
          : `ATENÇÃO: a torna da reserva (${fmt(tornaReserva)}) PASSA da isenção de doação — ${fmt(excesso)} de excesso pagariam ${fmt(itcmdInterVivos)} de ITCMD inter vivos JÁ NA LAVRATURA, antecipando imposto para economizar depois. A conta líquida cai para ${fmt(economiaLiquida)}; o desenho melhora limitando a reserva à parte isenta ou escalonando cessões por exercício.`;

    if (economiaLiquida > 0) {
      lista.push({
        id: 'usufruto-nua-propriedade',
        titulo: 'Nua-propriedade aos herdeiros com usufruto vitalício do(a) sobrevivente',
        explicacao: `Em vez de imóvel em nome de ${nome} (que voltaria a inventário no futuro), a partilha pode atribuir a NUA-PROPRIEDADE aos herdeiros com reserva de USUFRUTO VITALÍCIO a ${nome} — quem segue morando e administrando o bem. No falecimento do(a) usufrutuário(a) o usufruto apenas se EXTINGUE e a propriedade se consolida: a extinção de usufruto não é fato gerador do ITCMD em SP, e o bem não integra o segundo inventário — economia futura estimada de ${fmt(economiaFutura)} só de imposto, além de escritura, registro e honorários de um novo inventário sobre esses bens. ${situacaoTorna}`,
        fundamento:
          'Lei 10.705/2000, arts. 2º e 3º (extinção de usufruto não listada como fato gerador) e art. 6º, II, "a" (isenção da doação); coeficientes do RITCMD-SP (usufruto 1/3, nua-propriedade 2/3)',
        economiaEstimada: economiaLiquida,
        horizonte: 'FUTURA',
        aplicada: false,
        condicoes: [
          'Reserva do usufruto na própria escritura do inventário, de preferência dentro da meação/quinhão de cada parte (sem gerar excesso).',
          excesso > 0
            ? `Excesso sobre a isenção: limitar a reserva à parte isenta, escalonar cessões por ano civil ou aceitar os ${fmt(itcmdInterVivos)} de ITCMD de doação — somar outras doações do mesmo doador no exercício.`
            : 'Somar outras doações do MESMO doador ao MESMO donatário no ano civil — o teto da isenção é anual, por par.',
          `${nome} deixa de poder vender o bem sozinho(a) (fica só com o usufruto) — alinhar a decisão com a família.`,
          'Averbações e valores dos coeficientes: conferir a redação vigente do RITCMD antes da lavratura.',
        ],
      });
    }
  }

  /* --- tornas que ainda custam imposto: dá para melhorar --- */

  const tornasTributadas = e.transferencias.filter(
    (t) => t.tributo === 'ITCMD_DOACAO' && (t.imposto ?? 0) > 0,
  );
  const impostoTornas = tornasTributadas.reduce((a, t) => a + (t.imposto ?? 0), 0);
  if (impostoTornas > 0) {
    const teto = e.ufespReferencia ? 2500 * e.ufespReferencia : null;
    lista.push({
      id: 'torna-acima-da-isencao',
      titulo: 'Diferenças de quinhão acima da isenção de doação',
      explicacao: `As cessões gratuitas montadas geram ${fmt(r2(impostoTornas))} de ITCMD de doação. Recalibrando os percentuais para aproximar cada um do próprio quinhão${teto ? `, ou mantendo cada doação dentro de 2.500 UFESPs por donatário/ano (${fmt(teto)})` : ''}, esse imposto pode cair ou zerar — a isenção é POR ANO CIVIL, então cessões maiores podem ser escalonadas em exercícios distintos.`,
      fundamento: 'Lei 10.705/2000, art. 6º, II, "a"',
      economiaEstimada: r2(impostoTornas),
      horizonte: 'IMEDIATA',
      aplicada: false,
      condicoes: [
        'Escalonar doações entre anos exige formalizar cada etapa — avaliar custo cartorário × imposto poupado.',
      ],
    });
  }

  const tornasItbi = e.transferencias.filter((t) => t.tributo === 'ITBI');
  const somaItbi = tornasItbi.reduce((a, t) => a + t.valor, 0);
  if (somaItbi > 0 && e.ufespReferencia) {
    const teto = 2500 * e.ufespReferencia;
    const caberia = tornasItbi.every((t) => t.valor <= teto);
    lista.push({
      id: 'torna-onerosa-vs-doacao',
      titulo: 'Reposição em dinheiro atrai ITBI — a cessão gratuita pode sair de graça',
      explicacao: `A diferença compensada em dinheiro (${fmt(somaItbi)}) paga ITBI municipal sobre a parte imobiliária. ${
        caberia
          ? `Se a família dispensar a compensação, a mesma diferença cedida DE GRAÇA cabe na isenção de doação (até ${fmt(teto)} por donatário/ano) — sem ITBI e sem ITCMD.`
          : `Cedida de graça, a parte até ${fmt(teto)} por donatário/ano fica isenta de ITCMD (o excedente paga 4%) — comparar com a alíquota de ITBI do município.`
      }`,
      fundamento: 'Lei 10.705/2000, art. 6º, II, "a"; ITBI conforme a lei do município do imóvel',
      economiaEstimada: null,
      horizonte: 'IMEDIATA',
      aplicada: false,
      condicoes: [
        'Só vale se a parte cedente realmente abrir mão da compensação — doação simulada de reposição onerosa é fraude fiscal.',
      ],
    });
  }

  /* --- planejamentos gerais (legislação federal e processo) --- */

  // IR na transmissão: a DIRPF do espólio escolhe, bem a bem, transmitir
  // pelo valor da última declaração (nada de ganho de capital agora) ou pelo
  // valor de mercado (15% sobre a diferença já, "reprecificando" o custo de
  // aquisição dos herdeiros para a venda futura).
  if (e.bens.some((b) => b.valor > 0)) {
    lista.push({
      id: 'valor-transmissao-ir',
      titulo: 'Imposto de Renda: escolher o valor da transmissão (declaração × mercado)',
      explicacao:
        'Na declaração final do espólio, cada bem pode ser transmitido pelo VALOR DA ÚLTIMA DECLARAÇÃO do(a) falecido(a) — nenhum ganho de capital agora, o IR fica adiado para quando o herdeiro vender — ou pelo VALOR DE MERCADO, pagando 15% sobre a diferença já e elevando o custo de aquisição dos herdeiros (vantajoso quando a venda é próxima, ou quando o herdeiro poderá usar isenções na revenda, como a do único imóvel de até R$ 440 mil). A escolha é bem a bem e não muda o ITCMD.',
      fundamento: 'Lei 9.532/1997, art. 23; Lei 9.250/1995, art. 23 (isenção do único imóvel)',
      economiaEstimada: null,
      horizonte: 'FUTURA',
      aplicada: false,
      condicoes: [
        'Comparar os planos da família para cada bem (vender logo × manter) antes de entregar a DIRPF final do espólio.',
      ],
    });
  }

  // Sobrepartilha (CPC, art. 669): bem de liquidação difícil ou litigioso não
  // precisa travar o inventário inteiro além dos prazos fiscais.
  if (e.bens.some((b) => b.tipo === 'QUOTAS') && e.imposto !== null && e.imposto > 0) {
    lista.push({
      id: 'sobrepartilha-bens-morosos',
      titulo: 'Quotas e bens de liquidação difícil podem ficar para sobrepartilha',
      explicacao:
        'Quotas societárias, bens litigiosos e os de liquidação difícil ou morosa podem ficar para SOBREPARTILHA: a família partilha e recolhe desde já o que está líquido, sem deixar a apuração demorada de um bem levar o inventário inteiro para além dos prazos fiscais (multa de até 20% e juros sobre TODO o imposto).',
      fundamento: 'CPC, arts. 669 e 670',
      economiaEstimada: null,
      horizonte: 'IMEDIATA',
      aplicada: false,
      condicoes: [
        'A sobrepartilha é procedimento posterior — pesar o custo do segundo ato contra os encargos de mora evitados agora.',
      ],
    });
  }

  return lista;
}

/** Soma das economias quantificáveis (para o resumo da UI). */
export function totalEstimado(lista: OportunidadeEconomia[]): number {
  return r2(lista.reduce((a, o) => a + (o.economiaEstimada ?? 0), 0));
}
