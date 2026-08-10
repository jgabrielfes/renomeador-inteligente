// Utilidades das telas de administração: período via query string
// (?periodo=semana|mes|ano|tudo) e paginação (?pagina=&porPagina=) —
// convenção do AGENTS.md: filtro vive na URL, validado contra lista fechada.

export const PERIODOS = [
  { valor: "semana", rotulo: "Semana", dias: 7 },
  { valor: "mes", rotulo: "Mês", dias: 30 },
  { valor: "ano", rotulo: "Ano", dias: 365 },
  { valor: "tudo", rotulo: "Tudo", dias: null },
] as const;

export type Periodo = (typeof PERIODOS)[number]["valor"];

export function parsePeriodo(bruto: unknown): Periodo {
  return PERIODOS.some((p) => p.valor === bruto) ? (bruto as Periodo) : "semana";
}

/** null = sem recorte de data ("tudo"). */
export function inicioDoPeriodo(periodo: Periodo): Date | null {
  const dias = PERIODOS.find((p) => p.valor === periodo)?.dias ?? null;
  if (dias === null) return null;
  return new Date(Date.now() - dias * 24 * 60 * 60 * 1000);
}

/** Filtro Prisma de createdAt para o período (vazio quando "tudo"). */
export function filtroDeData(periodo: Periodo): { gte: Date } | undefined {
  const inicio = inicioDoPeriodo(periodo);
  return inicio ? { gte: inicio } : undefined;
}

export const TAMANHOS_DE_PAGINA = [10, 25, 50, 100] as const;

export interface Paginacao {
  pagina: number;
  porPagina: number;
}

export function parsePaginacao(params: {
  pagina?: unknown;
  porPagina?: unknown;
}): Paginacao {
  const porPagina = TAMANHOS_DE_PAGINA.includes(
    Number(params.porPagina) as (typeof TAMANHOS_DE_PAGINA)[number]
  )
    ? Number(params.porPagina)
    : 10;
  const pagina = Math.max(1, Math.floor(Number(params.pagina)) || 1);
  return { pagina, porPagina };
}

export const dataCurta = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "America/Sao_Paulo",
});
