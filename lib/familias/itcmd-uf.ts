/**
 * ITCMD por UF — TABELA VERSIONADA de alíquotas causa mortis, para a
 * ESTIMATIVA POR FAIXA da área "Para famílias".
 *
 * SP não passa por aqui: usa o motor real (lib/partilha/itcmd.ts — Lei
 * 10.705/2000, UFESP, multas, Selic). As demais UFs saem desta tabela como
 * FAIXA HONESTA (alíquota mínima × máxima sobre a base), sempre com o aviso
 * de estimativa e a orientação de confirmar a lei estadual — alíquotas mudam
 * e várias UFs têm progressividade, isenções e prazos próprios que a tabela
 * NÃO modela. Mesmo desenho das tabelas anuais do módulo
 * (parametros-fiscais.ts): dado versionado, revisado por exercício.
 *
 * Teto constitucional: 8% (Resolução 9/1992 do Senado).
 */

export const ANO_TABELA_ITCMD_UF = 2026;

export interface AliquotaUf {
  /** Alíquota mínima e máxima causa mortis (%) — iguais = alíquota fixa. */
  min: number;
  max: number;
  /** true = progressiva por valor (a faixa min–max é por quinhão/base). */
  progressiva: boolean;
}

/**
 * Alíquotas causa mortis por UF (referência 2026). Conferir a lei estadual
 * antes de qualquer decisão — isto alimenta uma ESTIMATIVA de faixa.
 */
export const ITCMD_POR_UF: Record<string, AliquotaUf> = {
  AC: { min: 2, max: 4, progressiva: true },
  AL: { min: 2, max: 4, progressiva: false },
  AP: { min: 3, max: 4, progressiva: false },
  AM: { min: 2, max: 2, progressiva: false },
  BA: { min: 3.5, max: 8, progressiva: true },
  CE: { min: 2, max: 8, progressiva: true },
  DF: { min: 4, max: 6, progressiva: true },
  ES: { min: 4, max: 4, progressiva: false },
  GO: { min: 2, max: 8, progressiva: true },
  MA: { min: 3, max: 7, progressiva: true },
  MT: { min: 2, max: 8, progressiva: true },
  MS: { min: 3, max: 6, progressiva: true },
  MG: { min: 5, max: 5, progressiva: false },
  PA: { min: 2, max: 6, progressiva: true },
  PB: { min: 2, max: 8, progressiva: true },
  PR: { min: 4, max: 4, progressiva: false },
  PE: { min: 2, max: 8, progressiva: true },
  PI: { min: 4, max: 4, progressiva: false },
  RJ: { min: 4, max: 8, progressiva: true },
  RN: { min: 3, max: 3, progressiva: false },
  RS: { min: 0, max: 6, progressiva: true },
  RO: { min: 2, max: 4, progressiva: true },
  RR: { min: 4, max: 4, progressiva: false },
  SC: { min: 1, max: 8, progressiva: true },
  SP: { min: 4, max: 4, progressiva: false }, // referência — SP usa o motor real
  SE: { min: 2, max: 8, progressiva: true },
  TO: { min: 2, max: 8, progressiva: true },
};

export interface EstimativaItcmdUf {
  uf: string;
  min: number;
  max: number;
  aliquota: AliquotaUf;
  avisos: string[];
}

/** Faixa estimada de ITCMD para uma base {min, max} numa UF da tabela. */
export function estimarItcmdUf(
  uf: string,
  base: { min: number; max: number },
): EstimativaItcmdUf | null {
  const aliquota = ITCMD_POR_UF[uf];
  if (!aliquota) return null;
  const avisos = [
    `Estimativa pela tabela de referência ${ANO_TABELA_ITCMD_UF} — confirme a alíquota e as isenções na lei do estado (${uf}).`,
  ];
  if (aliquota.progressiva) {
    avisos.push(
      `Em ${uf} a alíquota é progressiva (${aliquota.min}% a ${aliquota.max}% conforme o valor) — o número exato depende do enquadramento.`,
    );
  }
  avisos.push(
    'Vários estados têm isenções por valor e multa por atraso na abertura — um advogado local confere o seu enquadramento.',
  );
  return {
    uf,
    min: Math.round(base.min * (aliquota.min / 100)),
    max: Math.round(base.max * (aliquota.max / 100)),
    aliquota,
    avisos,
  };
}
