/**
 * Projeção de CUSTOS CARTORÁRIOS E JUDICIAIS do inventário — São Paulo.
 *
 * Motor puro (com testes). As faixas de emolumentos são as OFICIAIS de 2026
 * (Lei 11.331/2002, tabelas divulgadas pela Anoreg-SP/CNB-SP com vigência em
 * 08/01/2026), sempre na versão com ISS de 5% — o maior do estado — para a
 * estimativa nunca errar para menos. A CONTAGEM DE ATOS segue as Notas
 * Explicativas das tabelas:
 *
 *  - ESCRITURA de inventário e partilha (Tabela de Notas, item 1): na
 *    partilha igualitária é UM ato pela LEGÍTIMA (herança transmitida =
 *    monte-mor descontada a meação) — não se multiplica ato por pagamento.
 *    RENÚNCIA: um ato SEM valor declarado por renunciante (item 6.2 da
 *    tabela). TORNA/cessão de direitos hereditários: um ato COM valor
 *    declarado pela base do valor da torna, além do imposto inter vivos.
 *    Reserva de usufruto é ato acessório: 1/4 dos emolumentos sobre a terça
 *    parte do valor do bem (Notas 1.3, 3.3 e 3.5).
 *  - REGISTRO DE IMÓVEIS (Tabela de Registro, item 1): um registro POR
 *    IMÓVEL pela faixa do valor; partilha diferenciada pode gerar ato de
 *    registro ADICIONAL na mesma matrícula (doação/cessão; usufruto tem base
 *    de 1/3 do valor do imóvel — Nota 1.5 do RI). Certidão de matrícula pelo
 *    item 11 da tabela.
 *  - CERTIDÕES de registro civil (registrocivil.org.br) e negativa de
 *    testamento (CENSEC): custos APROXIMADOS — averbações e taxas de emissão
 *    variam.
 *  - TAXA JUDICIÁRIA (rito judicial): faixas FIXAS em UFESPs sobre o
 *    monte-mor — Lei 11.608/2003, art. 4º, §7º (redação da Lei 17.785/2023).
 *
 * As tabelas em R$ são DADO ANUAL: revisar a cada virada de ano com a
 * publicação da Anoreg-SP. A contagem fina de atos varia entre serventias
 * (enunciados CNB/SP) — a UI avisa para confirmar com o tabelionato.
 */

export interface ParcelaCusto {
  id: string;
  rotulo: string;
  /** Valor em R$ (já multiplicado pela quantidade). */
  valor: number;
  quantidade: number;
  fundamento: string;
  detalhe?: string;
  /** true = estimativa/contagem a confirmar; false = valor de tabela/lei. */
  aproximado: boolean;
}

export interface ProjecaoCustos {
  parcelas: ParcelaCusto[];
  total: number;
  avisos: string[];
}

export interface SucessaoCustos {
  nome: string;
  /** Base transmitida na sucessão cumulada, em R$. */
  base: number;
  /** Imóveis envolvidos nesta sucessão (atos de registro próprios). */
  qtdImoveis: number;
}

export interface EntradaCustos {
  /** Monte-mor (base da taxa judiciária, incluída a meação), em R$. */
  monteMor: number;
  /**
   * Base da escritura de inventário: a LEGÍTIMA (herança transmitida =
   * monte-mor DESCONTADA a meação). Partilha igualitária é UM ato só por
   * esta base — não se cobra ato por quantidade de pagamentos.
   */
  baseEscritura: number;
  /** Herdeiros renunciantes: um ato SEM valor declarado por renúncia. */
  qtdRenunciantes: number;
  /** Sucessões CUMULADAS no mesmo inventário (além da principal). */
  sucessoes: SucessaoCustos[];
  /**
   * Imóveis do acervo, para os registros. `valor` é o valor cheio do bem
   * (referência); a base do ATO de registro é `valorTransmitido` — a fração
   * que a partilha efetivamente transmite, EXCLUÍDA a meação (a metade do
   * meeiro já era dele: não é transmissão e não entra na base, exatamente
   * como no ato da escritura). Ausente, vale o valor cheio (sem meeiro).
   */
  imoveis: { descricao: string; valor: number; valorTransmitido?: number }[];
  rito: 'EXTRAJUDICIAL' | 'JUDICIAL';
  qtdHerdeiros: number;
  /** Havia cônjuge/companheiro(a) — certidão de casamento entra na conta. */
  temSobrevivente: boolean;
  /** Acertos da partilha diferenciada (atos inter vivos embutidos). */
  transferencias: { valor: number; tributo: 'ITCMD_DOACAO' | 'ITBI' }[];
  /** UFESP vigente (converte as faixas da taxa judiciária). */
  ufesp: number;
  /** Alíquota do ISS municipal (%) — tabela publicada com 5%; ajuste livre. */
  issPct?: number;
}

const r2 = (v: number) => Math.round(v * 100) / 100;
const fmt = (v: number) =>
  `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/* --------------- tabelas oficiais 2026 (ISS 5%) — DADO ANUAL --------------- */

type Faixa = { ate: number | null; total: number; base: number };

/**
 * Tabelionato de Notas, item 1 — escritura com valor declarado. `total` é o
 * valor ao usuário COM ISS DE 5%; `base` é a parcela do Tabelião (sobre a
 * qual o ISS municipal incide) — permite recalcular para qualquer alíquota:
 * total(iss) = total5% + base × (iss − 5)/100.
 */
export const TABELA_NOTAS_2026: Faixa[] = [
  { ate: 1_524, total: 362.98, base: 212.51 },
  { ate: 5_761, total: 542.43, base: 317.59 },
  { ate: 9_603, total: 846.96, base: 495.89 },
  { ate: 19_210, total: 1209.95, base: 708.41 },
  { ate: 38_420, total: 1635.48, base: 957.54 },
  { ate: 76_840, total: 1940.10, base: 1135.90 },
  { ate: 115_260, total: 2303.08, base: 1348.42 },
  { ate: 153_680, total: 2728.61, base: 1597.56 },
  { ate: 192_100, total: 3091.68, base: 1810.12 },
  { ate: 230_520, total: 3458.80, base: 2025.08 },
  { ate: 268_940, total: 3880.19, base: 2271.77 },
  { ate: 307_360, total: 4247.39, base: 2486.77 },
  { ate: 330_146, total: 4672.93, base: 2735.91 },
  { ate: 384_200, total: 4973.32, base: 2911.79 },
  { ate: 768_400, total: 5519.90, base: 3231.80 },
  { ate: 1_152_600, total: 6129.04, base: 3588.44 },
  { ate: 1_536_800, total: 6796.60, base: 3979.28 },
  { ate: 2_345_066, total: 7510.07, base: 4397.00 },
  { ate: 3_908_444, total: 10430.69, base: 6106.97 },
  { ate: 5_862_665, total: 13559.85, base: 7939.03 },
  { ate: 7_816_887, total: 16689.08, base: 9771.13 },
  { ate: 9_771_109, total: 19818.25, base: 11603.20 },
  { ate: 11_725_331, total: 22947.40, base: 13435.25 },
  { ate: 13_679_552, total: 26076.63, base: 15267.37 },
  { ate: 15_633_774, total: 29205.80, base: 17099.42 },
  { ate: 17_587_996, total: 32335.00, base: 18931.51 },
  { ate: 19_542_217, total: 35464.28, base: 20763.64 },
  { ate: 23_450_661, total: 41722.67, base: 24427.80 },
  { ate: 27_359_105, total: 47981.02, base: 28091.94 },
  { ate: 31_267_548, total: 54239.42, base: 31756.12 },
  { ate: 35_175_992, total: 60497.77, base: 35420.24 },
  { ate: null, total: 66756.25, base: 39084.46 },
];

/** Registro de Imóveis, item 1 — `base` é a parcela do Oficial. */
export const TABELA_REGISTRO_2026: Faixa[] = [
  { ate: 2_306, total: 265.00, base: 156.07 },
  { ate: 5_761, total: 425.24, base: 250.43 },
  { ate: 9_603, total: 762.88, base: 449.28 },
  { ate: 19_210, total: 1131.90, base: 666.61 },
  { ate: 38_420, total: 1376.12, base: 810.44 },
  { ate: 115_260, total: 1534.65, base: 903.80 },
  { ate: 192_100, total: 1958.77, base: 1153.58 },
  { ate: 230_520, total: 2382.02, base: 1402.84 },
  { ate: 268_940, total: 2593.23, base: 1527.22 },
  { ate: 307_360, total: 2805.64, base: 1652.32 },
  { ate: 345_780, total: 2957.70, base: 1741.87 },
  { ate: 384_200, total: 3034.79, base: 1787.28 },
  { ate: 768_400, total: 3383.82, base: 1992.82 },
  { ate: 1_152_600, total: 3962.79, base: 2333.80 },
  { ate: 1_536_800, total: 4562.13, base: 2686.76 },
  { ate: 1_921_000, total: 5161.52, base: 3039.77 },
  { ate: 2_305_200, total: 5471.41, base: 3222.27 },
  { ate: 3_842_000, total: 7020.80, base: 4134.74 },
  { ate: 5_763_000, total: 9809.68, base: 5777.19 },
  { ate: 7_684_000, total: 12908.44, base: 7602.14 },
  { ate: 9_605_000, total: 16007.20, base: 9427.09 },
  { ate: 11_526_000, total: 19105.97, base: 11252.04 },
  { ate: 13_447_000, total: 22204.73, base: 13076.99 },
  { ate: 15_368_000, total: 25303.49, base: 14901.94 },
  { ate: 17_289_000, total: 28402.25, base: 16726.89 },
  { ate: 19_210_000, total: 31501.02, base: 18551.84 },
  { ate: 23_052_000, total: 36149.17, base: 21289.27 },
  { ate: 26_894_000, total: 42346.70, base: 24939.17 },
  { ate: 30_736_000, total: 48544.24, base: 28589.07 },
  { ate: 34_578_000, total: 54741.78, base: 32238.97 },
  { ate: 38_420_000, total: 60939.31, base: 35888.87 },
  { ate: null, total: 67136.84, base: 39538.77 },
];

/** Certidão do RI (Tabela de Registro, item 11) — total 5% e parcela do Oficial. */
export const CERTIDAO_RI_2026 = { total: 77.89, base: 45.88 };

/** Escritura SEM valor declarado (Tabela de Notas, item 6.2) — renúncia. */
export const ESCRITURA_SEM_VALOR_2026 = { total: 625.78, base: 366.39 };

/** Ajusta o total (publicado com ISS 5%) para a alíquota municipal informada. */
export function comIss(f: { total: number; base: number }, issPct: number): number {
  return r2(f.total + (f.base * (issPct - 5)) / 100);
}

function faixa(valor: number, tabela: Faixa[]): Faixa | null {
  if (valor <= 0) return null;
  for (const f of tabela) {
    if (f.ate === null || valor <= f.ate) return f;
  }
  return tabela[tabela.length - 1];
}

export function emolumentoEscritura(valor: number, issPct = 5): number {
  const f = faixa(valor, TABELA_NOTAS_2026);
  return f ? comIss(f, issPct) : 0;
}

export function emolumentoRegistro(valor: number, issPct = 5): number {
  const f = faixa(valor, TABELA_REGISTRO_2026);
  return f ? comIss(f, issPct) : 0;
}

/**
 * ENUNCIADO Nº 7 do CNB/SP: nas escrituras de inventário e partilha, a base
 * dos emolumentos é o MAIOR entre o valor atribuído pelas partes e o valor
 * VENAL — este considerado na DATA DA LAVRATURA (critério temporal dos
 * emolumentos é o ato notarial, art. 7º da Lei 11.331/2002; o do ITCMD é o
 * óbito), excluída eventual meação.
 *
 * O maior valor é apurado BEM A BEM (valor atribuído × venal do exercício
 * ATUAL) e a exclusão da meação/dívidas preserva a proporção: a legítima já
 * apurada pelo valor atribuído é escalada pela razão entre o total "maior"
 * e o total atribuído.
 */
export function baseDeEmolumentosDaEscritura(e: {
  /** Bens do acervo: valor atribuído pelas partes e venal ATUAL (se houver). */
  bens: { valor: number; venalAtual?: number | null }[];
  /** Legítima apurada pelo valor ATRIBUÍDO (herança já sem a meação). */
  legitima: number;
}): number {
  if (e.legitima <= 0) return 0;
  const atribuido = e.bens.reduce((a, b) => a + Math.max(0, b.valor), 0);
  const maior = e.bens.reduce(
    (a, b) => a + Math.max(Math.max(0, b.valor), Math.max(0, b.venalAtual ?? 0)),
    0,
  );
  if (atribuido <= 0 || maior <= atribuido) return r2(e.legitima);
  return r2(e.legitima * (maior / atribuido));
}

/* ---------------- certidões (aproximadas por natureza) ---------------- */

/** Valores unitários APROXIMADOS (2026) — variam com averbações e emissão. */
export const CERTIDOES = {
  registroCivil: 70, // 2ª via nascimento/casamento/óbito (registrocivil.org.br)
  testamento: 100, // certidão negativa de testamento (CENSEC/Colégio Notarial)
};

/* ---------------- taxa judiciária (faixas fixas em lei) ---------------- */

/**
 * Inventário/arrolamento JUDICIAL: taxa judiciária em faixas FIXAS de UFESPs
 * sobre o monte-mor (incluída a meação) — Lei 11.608/2003, art. 4º, §7º, na
 * redação da Lei 17.785/2023.
 */
export const TAXA_JUDICIARIA_INVENTARIO: { ateReais: number | null; ufesps: number }[] = [
  { ateReais: 50_000, ufesps: 10 },
  { ateReais: 500_000, ufesps: 100 },
  { ateReais: 2_000_000, ufesps: 300 },
  { ateReais: 5_000_000, ufesps: 1_000 },
  { ateReais: null, ufesps: 3_000 },
];

export function taxaJudiciaria(monteMor: number, ufesp: number): { valor: number; ufesps: number } {
  const f =
    TAXA_JUDICIARIA_INVENTARIO.find((x) => x.ateReais !== null && monteMor <= x.ateReais) ??
    TAXA_JUDICIARIA_INVENTARIO[TAXA_JUDICIARIA_INVENTARIO.length - 1];
  return { valor: r2(f.ufesps * ufesp), ufesps: f.ufesps };
}

/* ---------------- projeção ---------------- */

export function projetarCustos(e: EntradaCustos): ProjecaoCustos {
  const iss = e.issPct ?? 5;
  const parcelas: ParcelaCusto[] = [];
  const avisos: string[] = [];
  const imoveis = e.imoveis.filter((i) => i.valor > 0);

  if (e.rito === 'EXTRAJUDICIAL') {
    /* escritura de inventário e partilha: UM ato pela LEGÍTIMA (herança
       transmitida, descontada a meação) — partilha igualitária não multiplica
       atos por pagamento. */
    if (e.baseEscritura > 0) {
      parcelas.push({
        id: 'escritura',
        rotulo: 'Escritura de inventário e partilha (ato único pela legítima)',
        valor: emolumentoEscritura(e.baseEscritura, iss),
        quantidade: 1,
        fundamento: 'Tabela de Notas 2026, item 1 (Lei 11.331/2002); Enunciado nº 7 do CNB/SP',
        detalhe: `Faixa pela LEGÍTIMA de ${fmt(e.baseEscritura)} — o MAIOR entre o valor atribuído pelas partes e o venal na data do ato (Enunciado 7: o critério temporal dos emolumentos é a lavratura, art. 7º da Lei 11.331/2002), excluída a meação. UM ato pelo TOTAL, qualquer que seja a quantidade de bens, herdeiros ou pagamentos. ISS de ${iss}%.`,
        aproximado: false,
      });
    }

    /* renúncia: um ato SEM valor declarado por herdeiro renunciante */
    if (e.qtdRenunciantes > 0) {
      parcelas.push({
        id: 'renuncias',
        rotulo: `Escritura de renúncia — ato sem valor declarado (${e.qtdRenunciantes}×)`,
        valor: r2(e.qtdRenunciantes * comIss(ESCRITURA_SEM_VALOR_2026, iss)),
        quantidade: e.qtdRenunciantes,
        fundamento: 'Tabela de Notas 2026, item 6.2 (escritura sem valor declarado)',
        detalhe: `${fmt(comIss(ESCRITURA_SEM_VALOR_2026, iss))} por renúncia, com ISS de ${iss}%.`,
        aproximado: false,
      });
    }

    /* torna / cessão de direitos hereditários: um ato COM valor declarado
       pela base do valor da torna, além do imposto inter vivos, se o caso */
    for (const [i, t] of e.transferencias.entries()) {
      if (t.valor <= 0) continue;
      parcelas.push({
        id: `escritura-torna-${i}`,
        rotulo:
          t.tributo === 'ITCMD_DOACAO'
            ? 'Ato da torna/cessão gratuita — escritura com valor declarado pela torna'
            : 'Ato da torna onerosa — escritura com valor declarado pela torna',
        valor: emolumentoEscritura(t.valor, iss),
        quantidade: 1,
        fundamento: 'Tabela de Notas 2026, item 1 — base = valor da torna',
        detalhe: `Diferença de quinhão de ${fmt(t.valor)} enquadrada na própria faixa; o imposto inter vivos (${t.tributo === 'ITCMD_DOACAO' ? 'ITCMD de doação' : 'ITBI'}) é apurado na aba Partilha.`,
        aproximado: true,
      });
    }
    if (e.transferencias.length > 0) {
      avisos.push(
        'Partilha diferenciada: a contagem fina de atos varia entre serventias (Notas Explicativas 3.1–3.3 e enunciados do CNB/SP) — confirme o orçamento com o tabelionato. Reserva de usufruto entra como ato ACESSÓRIO: 1/4 dos emolumentos sobre 1/3 do valor do bem (Notas 1.3, 3.3 e 3.5).',
      );
    }

    /* sucessões cumuladas: cada uma tem escritura própria pela sua base */
    for (const [i, su] of e.sucessoes.entries()) {
      if (su.base <= 0) continue;
      parcelas.push({
        id: `escritura-sucessao-${i}`,
        rotulo: `Escritura da sucessão cumulada de ${su.nome || `sucessão ${i + 2}`}`,
        valor: emolumentoEscritura(su.base, iss),
        quantidade: 1,
        fundamento: 'Tabela de Notas 2026, item 1 — ato próprio por sucessão (CPC, art. 672)',
        detalhe: `Faixa pela base transmitida de ${fmt(su.base)} nesta sucessão.`,
        aproximado: true,
      });
    }
  } else {
    /* taxa judiciária por faixa fixa (exata em lei) */
    if (e.monteMor > 0) {
      const taxa = taxaJudiciaria(e.monteMor, e.ufesp);
      parcelas.push({
        id: 'taxa-judiciaria',
        rotulo: `Taxa judiciária do inventário (${taxa.ufesps} UFESPs)`,
        valor: taxa.valor,
        quantidade: 1,
        fundamento: 'Lei 11.608/2003, art. 4º, §7º (redação da Lei 17.785/2023)',
        detalhe: `Faixa pelo monte-mor de ${fmt(e.monteMor)}, incluída a meação; UFESP de ${fmt(e.ufesp)}.`,
        aproximado: false,
      });
    }
    avisos.push(
      'Rito judicial: diligências, editais, perícias/avaliações e eventuais custas recursais não estão incluídas — só a taxa judiciária da abertura à homologação.',
    );
  }

  /* registros dos imóveis — sempre (o formal de partilha judicial também
     registra). A base do ato é a fração TRANSMITIDA (excluída a meação),
     como no ato da escritura — a metade do meeiro não é transmissão. */
  for (const [i, im] of imoveis.entries()) {
    const baseAto = im.valorTransmitido ?? im.valor;
    parcelas.push({
      id: `registro-${i}`,
      rotulo: `Registro da partilha — ${im.descricao || `imóvel ${i + 1}`}`,
      valor: emolumentoRegistro(baseAto, iss),
      quantidade: 1,
      fundamento: 'Tabela de Registro 2026, item 1 (Lei 11.331/2002)',
      detalhe:
        im.valorTransmitido !== undefined && im.valorTransmitido < im.valor
          ? `Faixa pela base TRANSMITIDA de ${fmt(baseAto)} — meação excluída do ato, como na escritura (valor do bem: ${fmt(im.valor)}).`
          : `Faixa pelo valor de ${fmt(baseAto)}.`,
      aproximado: false,
    });
  }
  /* partilha diferenciada: pode haver MAIS um ato de registro no mesmo imóvel */
  if (imoveis.length > 0 && e.transferencias.length > 0) {
    const extra = r2(
      imoveis.reduce((a, im) => a + emolumentoRegistro(im.valorTransmitido ?? im.valor, iss), 0),
    );
    parcelas.push({
      id: 'registro-atos-extras',
      rotulo: 'Atos de registro adicionais da partilha diferenciada',
      valor: extra,
      quantidade: imoveis.length,
      fundamento: 'Tabela de Registro 2026, item 1 — um emolumento POR ATO registrado',
      detalhe:
        'Doação/cessão do excedente e nua-propriedade são atos próprios na matrícula (usufruto: base de 1/3 do valor do imóvel — Nota 1.5). Provisionado um ato adicional por imóvel, pela faixa do valor (conservador).',
      aproximado: true,
    });
  }

  /* sucessões cumuladas: atos de registro próprios nos imóveis envolvidos */
  for (const [i, su] of e.sucessoes.entries()) {
    if (su.base <= 0 || su.qtdImoveis <= 0) continue;
    const porImovel = su.base / su.qtdImoveis;
    parcelas.push({
      id: `registro-sucessao-${i}`,
      rotulo: `Registros da sucessão cumulada de ${su.nome || `sucessão ${i + 2}`} (${su.qtdImoveis}×)`,
      valor: r2(su.qtdImoveis * emolumentoRegistro(porImovel, iss)),
      quantidade: su.qtdImoveis,
      fundamento: 'Tabela de Registro 2026, item 1 — um ato por imóvel por sucessão',
      detalhe: `Cada transmissão registra na matrícula; faixa estimada pelo valor médio de ${fmt(porImovel)} por imóvel.`,
      aproximado: true,
    });
  }
  if (e.sucessoes.length > 0) {
    avisos.push(
      'Sucessões cumuladas (CPC, art. 672): cada fato gerador tem ITCMD, prazos e atos próprios — o imposto de cada sucessão aparece discriminado com a data do óbito respectiva.',
    );
  }

  /* certidões */
  const qtdRegistroCivil = 1 + (e.temSobrevivente ? 1 : 0) + e.qtdHerdeiros;
  parcelas.push({
    id: 'certidoes-registro-civil',
    rotulo: `Certidões de registro civil (${qtdRegistroCivil}× — óbito${e.temSobrevivente ? ', casamento' : ''} e nascimento/casamento dos herdeiros)`,
    valor: r2(qtdRegistroCivil * CERTIDOES.registroCivil),
    quantidade: qtdRegistroCivil,
    fundamento: 'Tabela anual do registro civil (registrocivil.org.br)',
    detalhe: 'Custo aproximado por certidão — averbações e taxa de emissão eletrônica variam.',
    aproximado: true,
  });
  if (imoveis.length > 0) {
    parcelas.push({
      id: 'certidoes-matricula',
      rotulo: `Certidões de matrícula atualizada (${imoveis.length}× imóvel(is))`,
      valor: r2(imoveis.length * comIss(CERTIDAO_RI_2026, iss)),
      quantidade: imoveis.length,
      fundamento: 'Tabela de Registro 2026, item 11 (certidão)',
      detalhe: 'Valor de balcão por certidão; a visualização eletrônica sai por menos.',
      aproximado: false,
    });
  }
  parcelas.push({
    id: 'certidao-testamento',
    rotulo: 'Certidão negativa de testamento (CENSEC)',
    valor: CERTIDOES.testamento,
    quantidade: 1,
    fundamento: 'CENSEC/Colégio Notarial do Brasil — obrigatória no extrajudicial',
    detalhe: 'Custo aproximado da busca e emissão.',
    aproximado: true,
  });

  avisos.push(
    `Faixas oficiais de 2026 com ISS de ${iss}%${iss === 5 ? ' (o maior do estado — ajuste a alíquota do município da serventia acima)' : ''}. Tabelas mudam todo ano: confira a vigente (anoregsp.org.br) antes de fechar o orçamento com a família.`,
  );

  return {
    parcelas,
    total: r2(parcelas.reduce((a, p) => a + p.valor, 0)),
    avisos,
  };
}
