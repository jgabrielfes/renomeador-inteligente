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
 *    atualizada pela variação da UFESP até o recolhimento — art. 15.
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
  ufespReferencia: number;
  baseEmUfesps: number;
  /** Base atualizada pela UFESP até a data de referência (art. 15). */
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

function ufespDoAno(ano: number): { valor: number; estimado: boolean } {
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
  if (uO.estimado || uR.estimado) {
    estimativa = true;
    avisos.push(
      'Ano fora da tabela de UFESPs embarcada — a atualização monetária usou o valor conhecido mais próximo. Confira a UFESP vigente na Sefaz-SP.',
    );
  }

  // Art. 15: base considerada na data do óbito, atualizada pela UFESP.
  const baseEmUfesps = baseCalculo / uO.valor;
  const baseAtualizada = centavos(baseEmUfesps * uR.valor);

  // Art. 16 (Lei 10.992/2001): alíquota de 4%.
  const imposto = centavos(baseAtualizada * ALIQUOTA_ITCMD_SP);

  const parcelas: ParcelaItcmd[] = [
    {
      id: 'imposto',
      rotulo: 'ITCMD (4% sobre a base atualizada)',
      valor: imposto,
      fundamento: 'Lei 10.705/2000, arts. 15 e 16 (redação da Lei 10.992/2001)',
      detalhe: `Base de ${fmt(baseCalculo)} na data do óbito = ${baseEmUfesps.toFixed(2)} UFESPs (${fmt(uO.valor)} em ${anoObito}) → ${fmt(baseAtualizada)} pela UFESP de ${anoRef} (${fmt(uR.valor)}).`,
    },
  ];

  const vencimento = somarDias(dataObito, 180);
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
