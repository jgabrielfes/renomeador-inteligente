/**
 * ITCMD causa mortis — São Paulo (Lei 10.705/2000).
 *
 * Motor puro da provisão do imposto entre o fato gerador (abertura da
 * sucessão = data do óbito, art. 1.784 do CC) e a data de referência do
 * cálculo. Cada parcela sai discriminada com o dispositivo legal:
 *
 *  - Base de cálculo: valor venal (= valor de MERCADO) na data da abertura
 *    da sucessão — art. 9º. Valor declarado abaixo do mercado sujeita o caso
 *    a arbitramento pelo Fisco — art. 11 (ver notificações de lançamento da
 *    Sefaz-SP com o Método Comparativo Direto de Dados de Mercado).
 *  - Atualização monetária: a base é considerada na data do óbito e
 *    atualizada pela variação da UFESP SÓ ATÉ a data prevista para o
 *    recolhimento (o vencimento de 180 dias) — art. 15, parte final. Depois
 *    do vencimento quem recompõe a moeda é a Selic dos juros (art. 20);
 *    atualizar a base pela UFESP até o pagamento corrigiria DUAS vezes.
 *    Conferido por cálculo inverso com demonstrativo oficial da Sefaz-SP
 *    (conta fiscal nº 97348994: óbito 2016, emissão 2026 — a atualização
 *    monetária cobrada foi exatamente UFESP 2016 → UFESP 2017, e multas e
 *    juros incidiram sobre o imposto ATUALIZADO até o vencimento).
 *  - Alíquota: 4% — art. 16, na redação da Lei 10.992/2001 (desde 01/01/2002).
 *  - Prazo: recolhimento nunca superior a 180 dias da abertura da sucessão,
 *    sob pena de juros e penalidades — art. 17, §1º. Desconto de 5% se
 *    recolhido em até 90 dias da abertura da sucessão — art. 17, §2º.
 *  - Multa moratória: 0,33% por dia de atraso, limitada a 20% — art. 19.
 *  - Juros de mora: taxa Selic acumulada mensalmente, 1% por fração de mês,
 *    nunca inferiores a 1% ao mês — art. 20.
 *  - Multa pela abertura tardia do inventário: 10% do imposto se não
 *    requerido em 60 dias do óbito; 20% se o atraso exceder 180 dias —
 *    art. 21, I. (O TJSP tem afastado essa multa no extrajudicial quando o
 *    termo inicial é contado da nomeação do inventariante — ver avisos.)
 *
 * A Selic mensal aqui é ESTIMADA a partir da meta do Copom (tabela abaixo);
 * o demonstrativo oficial da Sefaz usa a Selic efetiva acumulada. Toda saída
 * carrega `estimativa: true` quando algum parâmetro estimado entrou no
 * cálculo — a UI é obrigada a exibir esse aviso.
 */

/** UFESP por ano-calendário (fonte: Sefaz-SP). Revisar a cada virada de ano. */
export const UFESP_POR_ANO: Record<number, number> = {
  2015: 21.25,
  2016: 23.55,
  2017: 25.07,
  2018: 25.7,
  2019: 26.53,
  2020: 27.61,
  2021: 29.09,
  2022: 31.97,
  2023: 34.26,
  2024: 35.36,
  2025: 37.02,
  2026: 38.42,
};

/**
 * Meta Selic (% a.a.) por decisão do Copom — usada para ESTIMAR a Selic
 * mensal do art. 20 quando o mês entra no cálculo dos juros.
 * Cada entrada vale a partir da data indicada (dia útil seguinte à reunião).
 */
export const META_SELIC: { desde: string; taxaAa: number }[] = [
  { desde: '2019-01-01', taxaAa: 6.5 },
  { desde: '2019-08-01', taxaAa: 6.0 },
  { desde: '2019-09-19', taxaAa: 5.5 },
  { desde: '2019-10-31', taxaAa: 5.0 },
  { desde: '2019-12-12', taxaAa: 4.5 },
  { desde: '2020-02-06', taxaAa: 4.25 },
  { desde: '2020-03-19', taxaAa: 3.75 },
  { desde: '2020-05-07', taxaAa: 3.0 },
  { desde: '2020-06-18', taxaAa: 2.25 },
  { desde: '2020-08-06', taxaAa: 2.0 },
  { desde: '2021-03-18', taxaAa: 2.75 },
  { desde: '2021-05-06', taxaAa: 3.5 },
  { desde: '2021-06-17', taxaAa: 4.25 },
  { desde: '2021-08-05', taxaAa: 5.25 },
  { desde: '2021-09-23', taxaAa: 6.25 },
  { desde: '2021-10-28', taxaAa: 7.75 },
  { desde: '2021-12-09', taxaAa: 9.25 },
  { desde: '2022-02-03', taxaAa: 10.75 },
  { desde: '2022-03-17', taxaAa: 11.75 },
  { desde: '2022-05-05', taxaAa: 12.75 },
  { desde: '2022-06-16', taxaAa: 13.25 },
  { desde: '2022-08-04', taxaAa: 13.75 },
  { desde: '2023-08-03', taxaAa: 13.25 },
  { desde: '2023-09-21', taxaAa: 12.75 },
  { desde: '2023-11-02', taxaAa: 12.25 },
  { desde: '2023-12-14', taxaAa: 11.75 },
  { desde: '2024-02-01', taxaAa: 11.25 },
  { desde: '2024-03-21', taxaAa: 10.75 },
  { desde: '2024-05-09', taxaAa: 10.5 },
  { desde: '2024-09-19', taxaAa: 10.75 },
  { desde: '2024-11-07', taxaAa: 11.25 },
  { desde: '2024-12-12', taxaAa: 12.25 },
  { desde: '2025-01-30', taxaAa: 13.25 },
  { desde: '2025-03-20', taxaAa: 14.25 },
  { desde: '2025-05-08', taxaAa: 14.75 },
  { desde: '2025-06-19', taxaAa: 15.0 },
  { desde: '2026-03-19', taxaAa: 14.75 },
  { desde: '2026-04-30', taxaAa: 14.5 },
  { desde: '2026-06-18', taxaAa: 14.25 },
  { desde: '2026-08-06', taxaAa: 14.0 },
];

export const ALIQUOTA_ITCMD_SP = 0.04; // art. 16 (Lei 10.992/2001)

/* ---------- isenções do art. 6º ---------- */

export interface EntradaIsencoes {
  /** Bens com tipo e valor em R$ (valores na data do óbito). */
  bens: { tipo?: string; valor: number; descricao?: string }[];
  /** UFESP do ano do óbito — o art. 6º mede na data do fato gerador. */
  ufespObito: number;
  /** Art. 6º, I, "a": imóvel residencial em que os familiares residem, sem outro imóvel. */
  aplicarImovelResidencial: boolean;
  /** Art. 6º, I, "d": depósitos bancários e aplicações financeiras. */
  aplicarDepositos: boolean;
}

export interface ResultadoIsencoes {
  valorIsento: number;
  detalhes: string[];
  avisos: string[];
}

/* ---------- leitura automática das isenções, bem a bem ---------- */

export interface AnaliseIsencaoBem {
  /** Mesma numeração da listagem do acervo (1-based). */
  indice: number;
  descricao: string;
  valor: number;
  verdito: 'ISENTO_POSSIVEL' | 'TRIBUTADO' | 'AVALIAR';
  /** Hipótese legal aplicável (ex.: 'art. 6º, I, "a"'), ou null. */
  hipotese: string | null;
  explicacao: string;
  /** Requisitos que o sistema NÃO consegue verificar — confirmar caso a caso. */
  condicoes: string[];
}

/**
 * Interpretação AUTOMÁTICA das isenções do art. 6º, I, da Lei 10.705/2000
 * sobre os bens lançados — Lei do ITCMD-SP e orientações da Sefaz-SP. O
 * sistema demonstra a hipótese e o enquadramento pelo VALOR (medido em
 * UFESPs da data do óbito, teto que NÃO é franquia); requisitos de fato
 * (residência da família, único imóvel etc.) saem como condições a
 * confirmar. A isenção é declarada no próprio sistema da declaração do
 * ITCMD — não há pedido apartado.
 */
/**
 * Respostas agregadas da FICHA dos herdeiros (perguntas da declaração do
 * ITCMD lançadas no item I): decidem automaticamente o requisito "não terem
 * outro imóvel" da alínea "a" do art. 6º, I — herdeiro que declara possuir
 * outro imóvel derruba a hipótese; todos declarando que não, o requisito é
 * dado como confirmado (restando só a residência no imóvel).
 */
export interface RespostasFichaIsencao {
  /** Herdeiros lançados no caso. */
  herdeiros: number;
  /** Quantos responderam a pergunta "possui outro imóvel?". */
  respostasOutroImovel: number;
  /** Algum herdeiro respondeu SIM (possui outro imóvel). */
  algumComOutroImovel: boolean;
  /** TODOS responderam e todos NÃO. */
  nenhumComOutroImovel: boolean;
}

export function analisarIsencoesPorBem(
  bens: { tipo?: string; valor: number; descricao?: string; codigoItcmd?: string }[],
  ufespObito: number,
  respostas?: RespostasFichaIsencao,
): AnaliseIsencaoBem[] {
  const teto = (u: number) => u * ufespObito;
  const imoveis = bens.filter((b) => b.tipo === 'IMOVEL' && b.valor > 0);
  const totalFinanceiro = bens
    .filter((b) => b.tipo === 'FINANCEIRO' && b.valor > 0)
    .reduce((a, b) => a + b.valor, 0);
  // C\u00f3digos da declara\u00e7\u00e3o do ITCMD-SP que s\u00e3o verbas do art. 6\u00ba, I, "e":
  // 178 empregador \u00b7 179/180 previd\u00eancia \u00b7 181 alimentar judicial \u00b7 182 FGTS/PIS-PASEP.
  const CODIGOS_VERBA = new Set(['178', '179', '180', '181', '182']);
  const ehVerbaAlimentar = (b: { descricao?: string; codigoItcmd?: string }) =>
    (b.codigoItcmd !== undefined && CODIGOS_VERBA.has(b.codigoItcmd)) ||
    (b.descricao !== undefined &&
      /FGTS|PIS|PASEP|SALDO DE SALARIO|VERBA (TRABALHISTA|RESCISORIA)|RESCISO|PREVIDENC|APOSENTADORIA NAO RECEBIDA|QUANTIA DEVIDA PELO EMPREGADOR|CARATER ALIMENTAR/i.test(
        b.descricao.normalize('NFD').replace(/[\u0300-\u036f]/g, ''),
      ));

  return bens.map((b, i) => {
    const base = {
      indice: i + 1,
      descricao: b.descricao || `Bem ${i + 1}`,
      valor: b.valor,
    };
    if (b.tipo === 'IMOVEL') {
      if (imoveis.length === 1 && b.valor <= teto(2500)) {
        return {
          ...base,
          verdito: 'ISENTO_POSSIVEL' as const,
          hipotese: 'art. 6º, I, "b"',
          explicacao: `Único imóvel transmitido, dentro de 2.500 UFESPs (${fmt(teto(2500))}) — isento independentemente de ser residencial.`,
          condicoes: ['Confirmar que não há outro imóvel transmitido fora do acervo lançado.'],
        };
      }
      if (b.valor <= teto(5000)) {
        // Alínea "a" interpretada com a FICHA do item I: a pergunta "possui
        // outro imóvel?" decide o requisito legal automaticamente.
        if (respostas?.algumComOutroImovel) {
          return {
            ...base,
            verdito: 'TRIBUTADO' as const,
            hipotese: null,
            explicacao: `Dentro de 5.000 UFESPs (${fmt(teto(5000))}), mas a ficha da qualificação (item I) aponta herdeiro proprietário de OUTRO imóvel — a alínea "a" do art. 6º, I exige que os familiares beneficiados não tenham outro imóvel.`,
            condicoes: [],
          };
        }
        if (respostas?.nenhumComOutroImovel) {
          return {
            ...base,
            verdito: 'ISENTO_POSSIVEL' as const,
            hipotese: 'art. 6º, I, "a"',
            explicacao: `Dentro de 5.000 UFESPs (${fmt(teto(5000))}) — isenção do imóvel de residência. Ficha do item I: nenhum dos ${respostas.herdeiros} herdeiro(s) declara outro imóvel — requisito confirmado automaticamente pelas respostas.`,
            condicoes: [
              'Ser imóvel de residência (urbano ou rural).',
              'Os familiares beneficiados nele residirem.',
            ],
          };
        }
        return {
          ...base,
          verdito: 'ISENTO_POSSIVEL' as const,
          hipotese: 'art. 6º, I, "a"',
          explicacao: `Dentro de 5.000 UFESPs (${fmt(teto(5000))}) — isenção do imóvel de residência. Responda a pergunta "possui outro imóvel?" na ficha de cada herdeiro (item I) e o requisito é conferido automaticamente.`,
          condicoes: [
            'Ser imóvel de residência (urbano ou rural).',
            'Os familiares beneficiados nele residirem.',
            'Os beneficiados não terem outro imóvel (responda na ficha do item I).',
          ],
        };
      }
      return {
        ...base,
        verdito: 'TRIBUTADO' as const,
        hipotese: null,
        explicacao: `Acima de 5.000 UFESPs (${fmt(teto(5000))}): nenhuma hipótese do art. 6º alcança — o teto não é franquia, o bem é tributado por inteiro.`,
        condicoes: [],
      };
    }
    if (b.tipo === 'FINANCEIRO') {
      if (totalFinanceiro <= teto(1000)) {
        return {
          ...base,
          verdito: 'ISENTO_POSSIVEL' as const,
          hipotese: 'art. 6º, I, "d"',
          explicacao: `O CONJUNTO de depósitos e aplicações (${fmt(totalFinanceiro)}) cabe em 1.000 UFESPs (${fmt(teto(1000))}).`,
          condicoes: [],
        };
      }
      return {
        ...base,
        verdito: 'TRIBUTADO' as const,
        hipotese: null,
        explicacao: `O conjunto de depósitos e aplicações (${fmt(totalFinanceiro)}) ultrapassa 1.000 UFESPs (${fmt(teto(1000))}) — a alínea "d" mede o total, não cada conta.`,
        condicoes: [],
      };
    }
    if (b.tipo === 'OUTRO' && ehVerbaAlimentar(b)) {
      return {
        ...base,
        verdito: 'ISENTO_POSSIVEL' as const,
        hipotese: 'art. 6º, I, "e"',
        explicacao:
          'Verba não recebida em vida (empregador, previdência, FGTS/PIS-PASEP) — isenta sem teto de valor.',
        condicoes: ['Confirmar a natureza da verba na documentação de origem.'],
      };
    }
    if (b.tipo === 'OUTRO' && b.valor <= teto(1500)) {
      return {
        ...base,
        verdito: 'AVALIAR' as const,
        hipotese: 'art. 6º, I, "c"',
        explicacao: `Dentro de 1.500 UFESPs (${fmt(teto(1500))}) — pode caber a isenção de utensílios/bens móveis de pequeno valor.`,
        condicoes: [
          'Ser ferramenta/equipamento agrícola de uso manual, roupa, aparelho de uso doméstico ou móvel de pequeno valor que guarneça o imóvel da alínea "a".',
        ],
      };
    }
    return {
      ...base,
      verdito: 'TRIBUTADO' as const,
      hipotese: null,
      explicacao:
        b.tipo === 'VEICULO' || b.tipo === 'QUOTAS'
          ? 'Veículos e participações societárias não têm hipótese de isenção no art. 6º — tributados por inteiro.'
          : 'Sem hipótese de isenção do art. 6º aplicável.',
      condicoes: [],
    };
  });
}

/**
 * Isenções do art. 6º da Lei 10.705/2000 marcadas pelo advogado.
 * Atenção à mecânica legal: o teto NÃO é franquia — bem que ultrapassa o
 * limite ("cujo valor não ultrapassar") é tributado por inteiro.
 */
export function isencoesArt6(e: EntradaIsencoes): ResultadoIsencoes {
  const detalhes: string[] = [];
  const avisos: string[] = [];
  let valorIsento = 0;

  if (e.aplicarImovelResidencial) {
    const teto = 5000 * e.ufespObito;
    const residencial = e.bens
      .filter((b) => b.tipo === 'IMOVEL' && b.valor > 0)
      .sort((a, b) => b.valor - a.valor)[0];
    if (!residencial) {
      avisos.push('Isenção do imóvel residencial marcada, mas não há bem do tipo imóvel no acervo.');
    } else if (residencial.valor <= teto) {
      valorIsento += residencial.valor;
      detalhes.push(
        `Imóvel residencial isento (art. 6º, I, "a"): ${residencial.descricao || 'imóvel'} — valor dentro de 5.000 UFESPs (${fmt(teto)}).`,
      );
    } else {
      avisos.push(
        `Imóvel residencial acima de 5.000 UFESPs (${fmt(teto)}): a isenção do art. 6º, I, "a" não se aplica — o teto não é franquia, o bem é tributado por inteiro.`,
      );
    }
  }

  if (e.aplicarDepositos) {
    const teto = 1000 * e.ufespObito;
    const financeiro = e.bens
      .filter((b) => b.tipo === 'FINANCEIRO' && b.valor > 0)
      .reduce((acc, b) => acc + b.valor, 0);
    if (financeiro === 0) {
      avisos.push('Isenção de depósitos marcada, mas não há bem do tipo conta/aplicação no acervo.');
    } else if (financeiro <= teto) {
      valorIsento += financeiro;
      detalhes.push(
        `Depósitos e aplicações isentos (art. 6º, I, "d"): total dentro de 1.000 UFESPs (${fmt(teto)}).`,
      );
    } else {
      avisos.push(
        `Depósitos e aplicações somam mais que 1.000 UFESPs (${fmt(teto)}): a isenção do art. 6º, I, "d" não se aplica ao conjunto.`,
      );
    }
  }

  return { valorIsento, detalhes, avisos };
}

/* ---------- cenário da reforma (EC 132/2023 + LC 227/2026) ---------- */

export interface FaixaProgressiva {
  /** Teto da faixa em UFESPs; null = última faixa (sem teto). */
  ateUfesps: number | null;
  /** Alíquota da faixa, em % (ex.: 2). */
  aliquota: number;
}

/** PL 7/2024 (SP): 2% a 8% por faixas do quinhão. Hipótese — não está em vigor. */
export const FAIXAS_PL7_2024: FaixaProgressiva[] = [
  { ateUfesps: 10_000, aliquota: 2 },
  { ateUfesps: 85_000, aliquota: 4 },
  { ateUfesps: 280_000, aliquota: 6 },
  { ateUfesps: null, aliquota: 8 },
];

/** Teto nacional (Res. Senado 9/1992): 8% linear. */
export const FAIXAS_TETO_NACIONAL: FaixaProgressiva[] = [{ ateUfesps: null, aliquota: 8 }];

/**
 * Imposto progressivo sobre UM quinhão (a LC 227/2026 manda progredir pelo
 * valor do quinhão de cada herdeiro, não pelo monte).
 */
export function impostoProgressivo(
  baseReais: number,
  ufesp: number,
  faixas: FaixaProgressiva[],
): { imposto: number; aliquotaEfetiva: number } {
  const emUfesps = baseReais / ufesp;
  let piso = 0;
  let imposto = 0;
  for (const f of faixas) {
    const teto = f.ateUfesps ?? Infinity;
    const nestaFaixa = Math.max(0, Math.min(emUfesps, teto) - piso);
    if (nestaFaixa > 0) imposto += nestaFaixa * ufesp * (f.aliquota / 100);
    piso = teto;
    if (emUfesps <= teto) break;
  }
  imposto = Math.round(imposto * 100) / 100;
  return { imposto, aliquotaEfetiva: baseReais > 0 ? (imposto / baseReais) * 100 : 0 };
}

export interface EntradaItcmd {
  /** Data do óbito (abertura da sucessão) — fato gerador. 'AAAA-MM-DD'. */
  dataObito: string;
  /** Data de referência do cálculo (data prevista para o recolhimento). */
  dataReferencia: string;
  /** Valor venal total transmitido causa mortis, em R$ — EXCLUÍDA a meação. */
  baseCalculo: number;
  /**
   * Data de abertura (protocolo/requerimento) do inventário, se já houver.
   * null/undefined = ainda não aberto → a multa do art. 21 é projetada
   * como se o protocolo ocorresse na data de referência.
   */
  dataProtocolo?: string | null;
  /**
   * Cenário da reforma: quinhões (nome + valor em R$ na data do óbito, já
   * líquidos de isenção), faixas e data de vigência da lei estadual.
   * O imposto só troca para o progressivo se dataObito >= vigência —
   * a lei aplicável é sempre a da data do fato gerador.
   */
  quinhoes?: { nome: string; valor: number }[];
  faixasProgressivas?: FaixaProgressiva[];
  vigenciaProgressiva?: string;
}

export interface ParcelaItcmd {
  id: string;
  rotulo: string;
  /** Valor em R$ — negativo para desconto. */
  valor: number;
  fundamento: string;
  detalhe?: string;
}

export interface ProvisaoItcmd {
  ufespObito: number;
  /** UFESP do ano da data de referência (para tetos/faixas em valores de hoje). */
  ufespReferencia: number;
  /** UFESP que atualizou a base: a do exercício do VENCIMENTO (art. 15). */
  ufespAtualizacao: number;
  /** Ano-exercício da UFESP de atualização (o do vencimento, ou o do pagamento se anterior). */
  anoAtualizacao: number;
  baseEmUfesps: number;
  /**
   * Base atualizada pela UFESP até o VENCIMENTO (art. 15, parte final) — não
   * até hoje: após o vencimento a recomposição é dos juros Selic (art. 20).
   */
  baseAtualizada: number;
  imposto: number;
  vencimento: string; // óbito + 180 dias (art. 17, §1º)
  diasDesdeObito: number;
  diasDeAtraso: number; // após o vencimento; 0 se em dia
  parcelas: ParcelaItcmd[];
  total: number;
  avisos: string[];
  /** true quando UFESP/Selic estimadas entraram no cálculo. */
  estimativa: boolean;
}

/* ---------- datas (UTC puro para não depender de fuso) ---------- */

function utc(data: string): number {
  const [a, m, d] = data.split('-').map(Number);
  return Date.UTC(a, m - 1, d);
}

function somarDias(data: string, dias: number): string {
  const t = new Date(utc(data) + dias * 86_400_000);
  return t.toISOString().slice(0, 10);
}

function diffDias(de: string, ate: string): number {
  return Math.round((utc(ate) - utc(de)) / 86_400_000);
}

function centavos(v: number): number {
  return Math.round(v * 100) / 100;
}

/* ---------- parâmetros ---------- */

export function ufespDoAno(ano: number): { valor: number; estimado: boolean } {
  const anos = Object.keys(UFESP_POR_ANO).map(Number);
  const min = Math.min(...anos);
  const max = Math.max(...anos);
  if (UFESP_POR_ANO[ano] !== undefined) return { valor: UFESP_POR_ANO[ano], estimado: false };
  // Fora da tabela: usa o extremo mais próximo e sinaliza estimativa.
  return { valor: UFESP_POR_ANO[ano < min ? min : max], estimado: true };
}

function metaSelicEm(data: string): { taxaAa: number; estimado: boolean } {
  let vigente: { desde: string; taxaAa: number } | null = null;
  for (const p of META_SELIC) {
    if (p.desde <= data) vigente = p;
  }
  if (!vigente) return { taxaAa: META_SELIC[0].taxaAa, estimado: true };
  // Depois da última decisão conhecida a meta segue válida, mas meses muito à
  // frente da tabela são projeção — marca estimado se passou de ~60 dias.
  const ultima = META_SELIC[META_SELIC.length - 1];
  const estimado = vigente === ultima && diffDias(ultima.desde, data) > 60;
  return { taxaAa: vigente.taxaAa, estimado };
}

/** Selic mensal estimada a partir da meta anual: (1+meta)^(1/12) − 1. */
export function selicMensalEstimada(ano: number, mes: number): { taxaMes: number; estimado: boolean } {
  const meio = `${ano}-${String(mes).padStart(2, '0')}-15`;
  const { taxaAa, estimado } = metaSelicEm(meio);
  const taxaMes = (Math.pow(1 + taxaAa / 100, 1 / 12) - 1) * 100;
  return { taxaMes, estimado };
}

/**
 * Juros do art. 20 entre o vencimento e o pagamento, em %:
 * Selic mensal acumulada nos meses cheios seguintes ao do vencimento,
 * 1% no mês do pagamento (fração), piso de 1% por mês.
 */
export function jurosArt20(vencimento: string, pagamento: string): {
  percentual: number;
  meses: { competencia: string; taxa: number }[];
  estimado: boolean;
} {
  if (utc(pagamento) <= utc(vencimento)) return { percentual: 0, meses: [], estimado: false };
  const [av, mv] = vencimento.split('-').map(Number);
  const [ap, mp] = pagamento.split('-').map(Number);
  const meses: { competencia: string; taxa: number }[] = [];
  let estimado = false;

  let ano = av;
  let mes = mv + 1;
  if (mes > 12) { mes = 1; ano += 1; }
  // Meses cheios entre o vencimento e o mês do pagamento.
  while (ano < ap || (ano === ap && mes < mp)) {
    const s = selicMensalEstimada(ano, mes);
    estimado = estimado || s.estimado;
    meses.push({
      competencia: `${String(mes).padStart(2, '0')}/${ano}`,
      taxa: Math.max(s.taxaMes, 1),
    });
    mes += 1;
    if (mes > 12) { mes = 1; ano += 1; }
  }
  // Fração do mês do pagamento: 1% (art. 20).
  meses.push({ competencia: `${String(mp).padStart(2, '0')}/${ap}`, taxa: 1 });

  const percentual = meses.reduce((acc, m) => acc + m.taxa, 0);
  return { percentual, meses, estimado };
}

/* ---------- provisão ---------- */

export function provisionarItcmd(entrada: EntradaItcmd): ProvisaoItcmd {
  const { dataObito, dataReferencia, baseCalculo } = entrada;
  const avisos: string[] = [];
  let estimativa = false;

  const anoObito = Number(dataObito.slice(0, 4));
  const anoRef = Number(dataReferencia.slice(0, 4));
  const uO = ufespDoAno(anoObito);
  const uR = ufespDoAno(anoRef);

  // Art. 15, parte final: a base é atualizada pela UFESP "até a data prevista
  // na legislação tributária para o recolhimento do imposto" — o VENCIMENTO
  // de 180 dias, nunca além (dali em diante a Selic do art. 20 assume a
  // recomposição; recolhendo antes do vencimento, vale a data do pagamento).
  // Mecânica conferida por cálculo inverso com o demonstrativo oficial.
  const vencimento = somarDias(dataObito, 180);
  const dataAtualizacao = utc(dataReferencia) <= utc(vencimento) ? dataReferencia : vencimento;
  const anoAtualizacao = Number(dataAtualizacao.slice(0, 4));
  const uA = ufespDoAno(anoAtualizacao);
  if (uO.estimado || uA.estimado || uR.estimado) {
    estimativa = true;
    avisos.push(
      'Ano fora da tabela de UFESPs embarcada — a atualização monetária usou o valor conhecido mais próximo. Confira a UFESP vigente na Sefaz-SP.',
    );
  }

  const baseEmUfesps = baseCalculo / uO.valor;
  const baseAtualizada = centavos(baseEmUfesps * uA.valor);

  // Regra de ouro: vale a lei da DATA DO ÓBITO. A tabela progressiva só entra
  // se o fato gerador for posterior à vigência informada para a lei estadual.
  const progressivoVale = Boolean(
    entrada.faixasProgressivas?.length &&
      entrada.vigenciaProgressiva &&
      entrada.quinhoes?.length &&
      dataObito >= entrada.vigenciaProgressiva,
  );

  // Art. 16 (Lei 10.992/2001): alíquota de 4% — ou, no cenário progressivo,
  // faixas sobre cada quinhão atualizado (LC 227/2026: progride pelo quinhão).
  let imposto: number;
  let parcelaImposto: ParcelaItcmd;
  const parcelasExtras: ParcelaItcmd[] = [];
  if (progressivoVale) {
    const fator = baseCalculo > 0 ? baseAtualizada / baseCalculo : 0;
    imposto = centavos(
      entrada.quinhoes!.reduce(
        (acc, q) =>
          acc + impostoProgressivo(q.valor * fator, uR.valor, entrada.faixasProgressivas!).imposto,
        0,
      ),
    );
    parcelaImposto = {
      id: 'imposto',
      rotulo: 'ITCMD progressivo por quinhão (simulação da reforma)',
      valor: imposto,
      fundamento: 'EC 132/2023 e LC 227/2026 — faixas conforme lei estadual a confirmar',
      detalhe: `Óbito posterior à vigência informada (${entrada.vigenciaProgressiva}): cada quinhão atualizado progride pelas faixas em UFESPs. Confirme a lei estadual antes de emitir a guia.`,
    };
    avisos.push(
      'Tabela progressiva aplicada por SIMULAÇÃO: nenhuma faixa progressiva está em vigor em SP — o cálculo depende de lei estadual futura.',
    );
  } else {
    imposto = centavos(baseAtualizada * ALIQUOTA_ITCMD_SP);
    // Discriminação: o imposto sobre a base histórica (arts. 9º e 16) e a
    // atualização monetária pela UFESP (art. 15) saem em linhas separadas —
    // a soma das duas é o mesmo 4% sobre a base atualizada.
    const impostoHistorico = centavos(baseCalculo * ALIQUOTA_ITCMD_SP);
    parcelaImposto = {
      id: 'imposto',
      rotulo: 'ITCMD (4% sobre a base na data do óbito)',
      valor: impostoHistorico,
      fundamento: 'Lei 10.705/2000, arts. 9º e 16 (redação da Lei 10.992/2001)',
      detalhe: `Base de ${fmt(baseCalculo)} na data do óbito = ${baseEmUfesps.toFixed(2)} UFESPs (${fmt(uO.valor)} em ${anoObito}).`,
    };
    const atualizacao = centavos(imposto - impostoHistorico);
    if (atualizacao !== 0) {
      parcelasExtras.push({
        id: 'atualizacao',
        rotulo: 'Atualização monetária da base (variação da UFESP)',
        valor: atualizacao,
        fundamento: 'Lei 10.705/2000, art. 15',
        detalhe: `${baseEmUfesps.toFixed(2)} UFESPs: ${fmt(uO.valor)} (${anoObito}) → ${fmt(uA.valor)} (${anoAtualizacao}, exercício do vencimento) atualiza a base para ${fmt(baseAtualizada)}; sobre a diferença incide o 4%. A UFESP corrige SÓ até o vencimento (art. 15, parte final) — depois, a recomposição é dos juros Selic.`,
      });
    }
  }

  const parcelas: ParcelaItcmd[] = [parcelaImposto, ...parcelasExtras];

  const diasDesdeObito = diffDias(dataObito, dataReferencia);
  const diasDeAtraso = Math.max(0, diffDias(vencimento, dataReferencia));

  // Art. 17, §2º: desconto de 5% recolhendo em até 90 dias do óbito.
  if (diasDesdeObito <= 90) {
    parcelas.push({
      id: 'desconto',
      rotulo: 'Desconto por recolhimento em até 90 dias do óbito (−5%)',
      valor: -centavos(imposto * 0.05),
      fundamento: 'Lei 10.705/2000, art. 17, §2º',
      detalhe: `Válido recolhendo até ${somarDias(dataObito, 90)}.`,
    });
  } else {
    avisos.push(
      `O desconto de 5% do art. 17, §2º exigia recolhimento até ${somarDias(dataObito, 90)} (90 dias do óbito) — não se aplica mais.`,
    );
  }

  // Art. 21, I: multa pela abertura tardia do inventário.
  const dataProtocolo = entrada.dataProtocolo ?? dataReferencia;
  const diasAteProtocolo = diffDias(dataObito, dataProtocolo);
  const pctMultaAbertura = diasAteProtocolo > 180 ? 0.2 : diasAteProtocolo > 60 ? 0.1 : 0;
  if (pctMultaAbertura > 0) {
    parcelas.push({
      id: 'multa-abertura',
      rotulo: `Multa por inventário não requerido no prazo (${pctMultaAbertura * 100}%)`,
      valor: centavos(imposto * pctMultaAbertura),
      fundamento: 'Lei 10.705/2000, art. 21, I',
      detalhe: entrada.dataProtocolo
        ? `Inventário requerido ${diasAteProtocolo} dias após o óbito (prazo: 60 dias; acima de 180, multa de 20%).`
        : `Projeção considerando o protocolo na data de referência (${diasAteProtocolo} dias após o óbito). Requerendo antes, a multa pode cair.`,
    });
    avisos.push(
      'Art. 21, I: no inventário EXTRAJUDICIAL o TJSP tem afastado essa multa quando o termo inicial é contado da nomeação do inventariante, não do óbito (NSCGJ-SP, Cap. XIV, item 105.2). O Fisco, porém, lança a partir do óbito — a provisão fica no cenário conservador.',
    );
  }

  // Após o vencimento (art. 17, §1º): multa moratória (art. 19) + juros (art. 20).
  if (diasDeAtraso > 0) {
    const pctMoratoria = Math.min(diasDeAtraso * 0.0033, 0.2);
    parcelas.push({
      id: 'multa-moratoria',
      rotulo: `Multa moratória (0,33% × ${diasDeAtraso} dias, limitada a 20%)`,
      valor: centavos(imposto * pctMoratoria),
      fundamento: 'Lei 10.705/2000, art. 19',
      detalhe: `Vencimento em ${vencimento} (180 dias do óbito — art. 17, §1º).`,
    });

    const juros = jurosArt20(vencimento, dataReferencia);
    estimativa = estimativa || juros.estimado;
    parcelas.push({
      id: 'juros',
      rotulo: `Juros de mora (${juros.percentual.toFixed(2)}%)`,
      valor: centavos(imposto * (juros.percentual / 100)),
      fundamento: 'Lei 10.705/2000, art. 20',
      detalhe: `Selic mensal acumulada desde o mês seguinte ao vencimento + 1% no mês do pagamento (piso legal de 1% a.m.): ${juros.meses
        .map((m) => `${m.competencia} ${m.taxa.toFixed(2)}%`)
        .join(' · ')}.`,
    });
    avisos.push(
      'Juros estimados pela meta Selic convertida ao mês — o demonstrativo oficial da Sefaz usa a Selic efetiva acumulada; o valor exato sai na emissão do DARE.',
    );
  }

  const total = centavos(parcelas.reduce((acc, p) => acc + p.valor, 0));

  return {
    ufespObito: uO.valor,
    ufespReferencia: uR.valor,
    ufespAtualizacao: uA.valor,
    anoAtualizacao,
    baseEmUfesps,
    baseAtualizada,
    imposto,
    vencimento,
    diasDesdeObito,
    diasDeAtraso,
    parcelas,
    total,
    avisos,
    estimativa,
  };
}

function fmt(v: number): string {
  return `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
