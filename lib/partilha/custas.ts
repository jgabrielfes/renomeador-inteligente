/**
 * Projeção de CUSTOS CARTORÁRIOS E JUDICIAIS do inventário — São Paulo.
 *
 * Motor puro (com testes). As faixas de emolumentos são as OFICIAIS de 2026
 * (Lei 11.331/2002, tabelas divulgadas pela Anoreg-SP/CNB-SP com vigência em
 * 08/01/2026), sempre na versão com ISS de 5% — o maior do estado — para a
 * estimativa nunca errar para menos. A CONTAGEM DE ATOS segue as Notas
 * Explicativas das tabelas:
 *
 *  - ESCRITURA de inventário e partilha (Tabela de Notas, item 1): havendo
 *    partilha, o cálculo é POR PAGAMENTO — meação e cada quinhão enquadrados
 *    na própria faixa (Nota Explicativa 3.1.1); adjudicação a herdeiro único
 *    é um ato só pelo monte-mor. Ato inter vivos embutido (doação do
 *    excedente, cessão de direitos) é NEGÓCIO JURÍDICO PRÓPRIO, cobrado à
 *    parte pela faixa do valor cedido (Nota 3.2). Reserva de usufruto é ato
 *    acessório: 1/4 dos emolumentos sobre a terça parte do valor do bem
 *    (Notas 1.3, 3.3 e 3.5).
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

export interface EntradaCustos {
  /** Monte-mor (base da adjudicação e da taxa judiciária), em R$. */
  monteMor: number;
  /**
   * Pagamentos da partilha em R$ (meação + cada quinhão, ou os valores
   * atribuídos na partilha diferenciada). Com 2+ pagamentos a escritura é
   * calculada POR PAGAMENTO (Nota Explicativa 3.1.1); vazio ou 1 = ato único.
   */
  pagamentos: number[];
  /** Imóveis do acervo (valor na data do óbito), para os registros. */
  imoveis: { descricao: string; valor: number }[];
  rito: 'EXTRAJUDICIAL' | 'JUDICIAL';
  qtdHerdeiros: number;
  /** Havia cônjuge/companheiro(a) — certidão de casamento entra na conta. */
  temSobrevivente: boolean;
  /** Acertos da partilha diferenciada (atos inter vivos embutidos). */
  transferencias: { valor: number; tributo: 'ITCMD_DOACAO' | 'ITBI' }[];
  /** UFESP vigente (converte as faixas da taxa judiciária). */
  ufesp: number;
}

const r2 = (v: number) => Math.round(v * 100) / 100;
const fmt = (v: number) =>
  `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/* --------------- tabelas oficiais 2026 (ISS 5%) — DADO ANUAL --------------- */

type Faixa = { ate: number | null; total: number };

/** Tabelionato de Notas, item 1 — escritura com valor declarado (TOTAL ao usuário). */
export const TABELA_NOTAS_2026: Faixa[] = [
  { ate: 1_524, total: 362.98 },
  { ate: 5_761, total: 542.43 },
  { ate: 9_603, total: 846.96 },
  { ate: 19_210, total: 1_209.95 },
  { ate: 38_420, total: 1_635.48 },
  { ate: 76_840, total: 1_940.1 },
  { ate: 115_260, total: 2_303.08 },
  { ate: 153_680, total: 2_728.61 },
  { ate: 192_100, total: 3_091.68 },
  { ate: 230_520, total: 3_458.8 },
  { ate: 268_940, total: 3_880.19 },
  { ate: 307_360, total: 4_247.39 },
  { ate: 330_146, total: 4_672.93 },
  { ate: 384_200, total: 4_973.32 },
  { ate: 768_400, total: 5_519.9 },
  { ate: 1_152_600, total: 6_129.04 },
  { ate: 1_536_800, total: 6_796.6 },
  { ate: 2_345_066, total: 7_510.07 },
  { ate: 3_908_444, total: 10_430.69 },
  { ate: 5_862_665, total: 13_559.85 },
  { ate: 7_816_887, total: 16_689.08 },
  { ate: 9_771_109, total: 19_818.25 },
  { ate: 11_725_331, total: 22_947.4 },
  { ate: 13_679_552, total: 26_076.63 },
  { ate: 15_633_774, total: 29_205.8 },
  { ate: 17_587_996, total: 32_335.0 },
  { ate: 19_542_217, total: 35_464.28 },
  { ate: 23_450_661, total: 41_722.67 },
  { ate: 27_359_105, total: 47_981.02 },
  { ate: 31_267_548, total: 54_239.42 },
  { ate: 35_175_992, total: 60_497.77 },
  { ate: null, total: 66_756.25 },
];

/** Registro de Imóveis, item 1 — registro com valor declarado (TOTAL ao usuário). */
export const TABELA_REGISTRO_2026: Faixa[] = [
  { ate: 2_306, total: 265.0 },
  { ate: 5_761, total: 425.24 },
  { ate: 9_603, total: 762.88 },
  { ate: 19_210, total: 1_131.9 },
  { ate: 38_420, total: 1_376.12 },
  { ate: 115_260, total: 1_534.65 },
  { ate: 192_100, total: 1_958.77 },
  { ate: 230_520, total: 2_382.02 },
  { ate: 268_940, total: 2_593.23 },
  { ate: 307_360, total: 2_805.64 },
  { ate: 345_780, total: 2_957.7 },
  { ate: 384_200, total: 3_034.79 },
  { ate: 768_400, total: 3_383.82 },
  { ate: 1_152_600, total: 3_962.79 },
  { ate: 1_536_800, total: 4_562.13 },
  { ate: 1_921_000, total: 5_161.52 },
  { ate: 2_305_200, total: 5_471.41 },
  { ate: 3_842_000, total: 7_020.8 },
  { ate: 5_763_000, total: 9_809.68 },
  { ate: 7_684_000, total: 12_908.44 },
  { ate: 9_605_000, total: 16_007.2 },
  { ate: 11_526_000, total: 19_105.97 },
  { ate: 13_447_000, total: 22_204.73 },
  { ate: 15_368_000, total: 25_303.49 },
  { ate: 17_289_000, total: 28_402.25 },
  { ate: 19_210_000, total: 31_501.02 },
  { ate: 23_052_000, total: 36_149.17 },
  { ate: 26_894_000, total: 42_346.7 },
  { ate: 30_736_000, total: 48_544.24 },
  { ate: 34_578_000, total: 54_741.78 },
  { ate: 38_420_000, total: 60_939.31 },
  { ate: null, total: 67_136.84 },
];

/** Certidão do Registro de Imóveis (Tabela de Registro, item 11) — balcão. */
export const CERTIDAO_RI_2026 = 77.89;

function faixa(valor: number, tabela: Faixa[]): number {
  if (valor <= 0) return 0;
  for (const f of tabela) {
    if (f.ate === null || valor <= f.ate) return f.total;
  }
  return tabela[tabela.length - 1].total;
}

export const emolumentoEscritura = (valor: number) => faixa(valor, TABELA_NOTAS_2026);
export const emolumentoRegistro = (valor: number) => faixa(valor, TABELA_REGISTRO_2026);

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
  const parcelas: ParcelaCusto[] = [];
  const avisos: string[] = [];
  const imoveis = e.imoveis.filter((i) => i.valor > 0);
  const pagamentos = e.pagamentos.filter((p) => p > 0);

  if (e.rito === 'EXTRAJUDICIAL') {
    /* escritura de inventário e partilha — POR PAGAMENTO (Nota 3.1.1) */
    if (pagamentos.length >= 2) {
      const valor = r2(pagamentos.reduce((a, p) => a + emolumentoEscritura(p), 0));
      parcelas.push({
        id: 'escritura',
        rotulo: `Escritura de inventário e partilha — cálculo por pagamento (${pagamentos.length} pagamentos)`,
        valor,
        quantidade: pagamentos.length,
        fundamento: 'Tabela de Notas 2026, item 1; Nota Explicativa 3.1.1 (partilha por pagamento)',
        detalhe: `Meação e cada quinhão enquadrados na própria faixa: ${pagamentos
          .map((p) => `${fmt(p)} → ${fmt(emolumentoEscritura(p))}`)
          .join(' · ')}. Tabela com ISS de 5% (o maior do estado).`,
        aproximado: false,
      });
    } else if (e.monteMor > 0) {
      parcelas.push({
        id: 'escritura',
        rotulo: 'Escritura de inventário e adjudicação (ato único pelo monte-mor)',
        valor: emolumentoEscritura(e.monteMor),
        quantidade: 1,
        fundamento: 'Tabela de Notas 2026, item 1 (Lei 11.331/2002)',
        detalhe: `Faixa pelo monte-mor de ${fmt(e.monteMor)}, com ISS de 5% (o maior do estado).`,
        aproximado: false,
      });
    }

    /* atos inter vivos embutidos = negócio jurídico próprio (Nota 3.2) */
    for (const [i, t] of e.transferencias.entries()) {
      if (t.valor <= 0) continue;
      parcelas.push({
        id: `escritura-intervivos-${i}`,
        rotulo:
          t.tributo === 'ITCMD_DOACAO'
            ? 'Ato notarial da cessão gratuita/doação do excedente'
            : 'Ato notarial da cessão onerosa (reposição em dinheiro)',
        valor: emolumentoEscritura(t.valor),
        quantidade: 1,
        fundamento: 'Tabela de Notas 2026, item 1; Nota Explicativa 3.2 (negócios distintos)',
        detalhe: `Excedente de ${fmt(t.valor)} transmitido inter vivos na partilha diferenciada — ato próprio pela faixa desse valor.`,
        aproximado: true,
      });
    }
    if (e.transferencias.length > 0) {
      avisos.push(
        'Partilha diferenciada com ato inter vivos embutido: a contagem de atos varia entre serventias (Notas Explicativas 3.1–3.3 e enunciados do CNB/SP) — confirme o orçamento com o tabelionato. Reserva de usufruto entra como ato ACESSÓRIO: 1/4 dos emolumentos sobre 1/3 do valor do bem (Notas 1.3, 3.3 e 3.5).',
      );
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

  /* registros dos imóveis — sempre (o formal de partilha judicial também registra) */
  for (const [i, im] of imoveis.entries()) {
    parcelas.push({
      id: `registro-${i}`,
      rotulo: `Registro da partilha — ${im.descricao || `imóvel ${i + 1}`}`,
      valor: emolumentoRegistro(im.valor),
      quantidade: 1,
      fundamento: 'Tabela de Registro 2026, item 1 (Lei 11.331/2002)',
      detalhe: `Faixa pelo valor de ${fmt(im.valor)}.`,
      aproximado: false,
    });
  }
  /* partilha diferenciada: pode haver MAIS um ato de registro no mesmo imóvel */
  if (imoveis.length > 0 && e.transferencias.length > 0) {
    const extra = r2(imoveis.reduce((a, im) => a + emolumentoRegistro(im.valor), 0));
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
      valor: r2(imoveis.length * CERTIDAO_RI_2026),
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
    'Faixas oficiais de 2026 com ISS de 5% (o maior do estado — municípios menores podem sair um pouco abaixo). Tabelas mudam todo ano: confira a vigente (anoregsp.org.br) antes de fechar o orçamento com a família.',
  );

  return {
    parcelas,
    total: r2(parcelas.reduce((a, p) => a + p.valor, 0)),
    avisos,
  };
}
