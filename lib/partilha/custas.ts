/**
 * Projeção de CUSTOS CARTORÁRIOS E JUDICIAIS do inventário — São Paulo.
 *
 * Motor puro (com testes) que abre a planilha de custos além do imposto:
 *
 *  - ESCRITURA (Tabelionato de Notas): emolumentos tabelados por faixa de
 *    valor (Lei 11.331/2002, Tabela II — a tabela em R$ é publicada
 *    anualmente pela Anoreg-SP/CNB-SP). Aqui a estimativa é CONSERVADORA:
 *    curva calibrada pela tabela com o MAIOR ISS municipal do estado (5%) e
 *    arredondamento PARA CIMA — melhor sobrar do que faltar. ATENÇÃO à forma
 *    da partilha: ato inter vivos embutido (doação do excedente, cessão de
 *    direitos hereditários) é ATO NOTARIAL A MAIS, cobrado à parte.
 *  - REGISTRO DE IMÓVEIS (Tabela IV da mesma lei): um registro POR IMÓVEL
 *    pela faixa do valor; partilha diferenciada pode exigir MAIS de um ato
 *    de registro no mesmo imóvel (registro da partilha + registro da doação/
 *    cessão; usufruto e nua-propriedade = atos próprios).
 *  - CERTIDÕES: registro civil (registrocivil.org.br), matrícula atualizada
 *    dos imóveis e certidão negativa de testamento (CENSEC) — custos
 *    APROXIMADOS por natureza (averbações, buscas e taxas de emissão variam).
 *  - TAXA JUDICIÁRIA (rito judicial): faixas FIXAS em UFESPs sobre o
 *    monte-mor — Lei 11.608/2003, art. 4º, §7º, na redação da Lei
 *    17.785/2023. Esta parcela é exata em lei (convertida pela UFESP).
 *
 * Toda parcela sai com `aproximado` e fundamento; a UI é obrigada a exibir
 * que valores estimados devem ser conferidos na tabela vigente (Anoreg-SP).
 */

export interface ParcelaCusto {
  id: string;
  rotulo: string;
  /** Valor estimado em R$ (já multiplicado pela quantidade). */
  valor: number;
  quantidade: number;
  fundamento: string;
  detalhe?: string;
  /** true = estimativa (conferir tabela vigente); false = faixa fixada em lei. */
  aproximado: boolean;
}

export interface ProjecaoCustos {
  parcelas: ParcelaCusto[];
  total: number;
  avisos: string[];
}

export interface EntradaCustos {
  /** Monte-mor (base da escritura e da taxa judiciária), em R$. */
  monteMor: number;
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
/** Arredonda PARA CIMA em degraus de R$ 10 — estimativa nunca "para menos". */
const teto10 = (v: number) => Math.ceil(v / 10) * 10;
const fmt = (v: number) =>
  `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/* ---------------- emolumentos (estimativa conservadora) ---------------- */

/**
 * Curva de estimativa dos emolumentos de ESCRITURA com valor declarado
 * (custas totais ao usuário, ISS de 5% — o maior do estado). Segmentos
 * percentuais decrescentes com piso e teto, calibrados pela ordem de
 * grandeza da tabela publicada (ex.: monte de R$ 500 mil ≈ R$ 4–5 mil;
 * teto da tabela na casa de R$ 16–18 mil). DADO revisável a cada ano —
 * conferir a tabela vigente em anoregsp.org.br antes de fechar orçamento.
 */
const CURVA_ESCRITURA = {
  piso: 1_200,
  teto: 18_000,
  segmentos: [
    { ate: 100_000, pct: 0.016 },
    { ate: 500_000, pct: 0.01 },
    { ate: 1_500_000, pct: 0.008 },
    { ate: Infinity, pct: 0.006 },
  ],
};

/** Registro de imóveis: ordem de grandeza ~2/3 da escritura, teto próprio. */
const CURVA_REGISTRO = {
  piso: 800,
  teto: 14_000,
  segmentos: [
    { ate: 100_000, pct: 0.012 },
    { ate: 500_000, pct: 0.0075 },
    { ate: 1_500_000, pct: 0.006 },
    { ate: Infinity, pct: 0.0045 },
  ],
};

function pelaCurva(base: number, curva: typeof CURVA_ESCRITURA): number {
  if (base <= 0) return 0;
  let acumulado = 0;
  let piso = 0;
  for (const s of curva.segmentos) {
    const nesta = Math.max(0, Math.min(base, s.ate) - piso);
    acumulado += nesta * s.pct;
    piso = s.ate;
    if (base <= s.ate) break;
  }
  return teto10(Math.min(curva.teto, Math.max(curva.piso, acumulado)));
}

export const estimarEscritura = (base: number) => pelaCurva(base, CURVA_ESCRITURA);
export const estimarRegistro = (valorImovel: number) => pelaCurva(valorImovel, CURVA_REGISTRO);

/* ---------------- certidões (aproximadas por natureza) ---------------- */

/** Valores unitários APROXIMADOS (2026) — variam com averbações e emissão. */
export const CERTIDOES = {
  registroCivil: 70, // 2ª via nascimento/casamento/óbito (registrocivil.org.br)
  matricula: 100, // certidão de propriedade/matrícula atualizada do imóvel
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
  const faixa =
    TAXA_JUDICIARIA_INVENTARIO.find((f) => f.ateReais !== null && monteMor <= f.ateReais) ??
    TAXA_JUDICIARIA_INVENTARIO[TAXA_JUDICIARIA_INVENTARIO.length - 1];
  return { valor: r2(faixa.ufesps * ufesp), ufesps: faixa.ufesps };
}

/* ---------------- projeção ---------------- */

export function projetarCustos(e: EntradaCustos): ProjecaoCustos {
  const parcelas: ParcelaCusto[] = [];
  const avisos: string[] = [];
  const imoveis = e.imoveis.filter((i) => i.valor > 0);

  if (e.rito === 'EXTRAJUDICIAL') {
    /* escritura de inventário e partilha sobre o monte-mor */
    if (e.monteMor > 0) {
      parcelas.push({
        id: 'escritura',
        rotulo: 'Escritura de inventário e partilha (Tabelionato de Notas)',
        valor: estimarEscritura(e.monteMor),
        quantidade: 1,
        fundamento: 'Lei 11.331/2002, Tabela II — tabela anual Anoreg-SP/CNB-SP',
        detalhe: `Faixa pelo monte-mor de ${fmt(e.monteMor)}, com ISS de 5% (o maior do estado) — estimativa conservadora.`,
        aproximado: true,
      });
    }

    /* atos inter vivos embutidos na partilha = atos notariais A MAIS */
    for (const [i, t] of e.transferencias.entries()) {
      if (t.valor <= 0) continue;
      parcelas.push({
        id: `escritura-intervivos-${i}`,
        rotulo:
          t.tributo === 'ITCMD_DOACAO'
            ? 'Ato notarial da cessão gratuita/doação do excedente'
            : 'Ato notarial da cessão onerosa (reposição em dinheiro)',
        valor: estimarEscritura(t.valor),
        quantidade: 1,
        fundamento: 'Lei 11.331/2002, Tabela II — ato com valor declarado cobrado à parte',
        detalhe: `Excedente de ${fmt(t.valor)} transmitido inter vivos na partilha diferenciada — o tabelionato cobra o ato adicional pela faixa desse valor.`,
        aproximado: true,
      });
    }
    if (e.transferencias.length > 0) {
      avisos.push(
        'Partilha diferenciada com ato inter vivos embutido: alguns tabelionatos lavram tudo numa escritura só, outros exigem escritura apartada — o número de atos (e o custo) deve ser confirmado com o tabelionato antes do orçamento.',
      );
    }
  } else {
    /* taxa judiciária por faixa fixa (esta é exata em lei) */
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
      valor: estimarRegistro(im.valor),
      quantidade: 1,
      fundamento: 'Lei 11.331/2002, Tabela IV — tabela anual (registrodeimoveis.org.br)',
      detalhe: `Faixa pelo valor de ${fmt(im.valor)} — estimativa conservadora.`,
      aproximado: true,
    });
  }
  /* partilha diferenciada: pode haver MAIS um ato de registro no mesmo imóvel */
  if (imoveis.length > 0 && e.transferencias.length > 0) {
    const extra = imoveis.reduce((a, im) => a + estimarRegistro(im.valor), 0);
    parcelas.push({
      id: 'registro-atos-extras',
      rotulo: 'Atos de registro adicionais da partilha diferenciada',
      valor: extra,
      quantidade: imoveis.length,
      fundamento: 'Lei 11.331/2002, Tabela IV — um emolumento POR ATO registrado',
      detalhe:
        'Doação/cessão do excedente, usufruto e nua-propriedade são atos próprios na matrícula — cada um paga registro pela faixa do valor. Provisionado um ato adicional por imóvel (conservador).',
      aproximado: true,
    });
  }

  /* certidões — aproximadas por natureza */
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
      rotulo: `Certidões de propriedade/matrícula atualizada (${imoveis.length}× imóvel(is))`,
      valor: r2(imoveis.length * CERTIDOES.matricula),
      quantidade: imoveis.length,
      fundamento: 'Lei 11.331/2002, Tabela IV — certidão (tabela anual)',
      detalhe: 'Custo aproximado — vintenária/com ônus e ações custa mais que o breve relatório.',
      aproximado: true,
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
    'Valores estimados de forma CONSERVADORA (maior ISS do estado e arredondamento para cima) — confira a tabela de emolumentos vigente (anoregsp.org.br) antes de fechar o orçamento com a família.',
  );

  return {
    parcelas,
    total: r2(parcelas.reduce((a, p) => a + p.valor, 0)),
    avisos,
  };
}
