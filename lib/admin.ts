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

/* ---------- ordenação (?ordenar=coluna&direcao=asc|desc) ---------- */

export type Direcao = "asc" | "desc";

export interface Ordenacao<C extends string = string> {
  coluna: C;
  direcao: Direcao;
}

/**
 * Lê a ordenação da URL validando a coluna contra a lista fechada de cada
 * tabela (nome de coluna vem do usuário e entra no `orderBy` do Prisma —
 * lista fechada é o que impede pedir ordem por campo que não deveria).
 * A ordenação é feita SEMPRE no banco, nunca no cliente.
 */
export function parseOrdenacao<C extends string>(
  params: { ordenar?: unknown; direcao?: unknown },
  colunas: readonly C[],
  padrao: Ordenacao<C>
): Ordenacao<C> {
  const coluna = colunas.includes(params.ordenar as C)
    ? (params.ordenar as C)
    : padrao.coluna;
  const direcao: Direcao =
    params.direcao === "asc" || params.direcao === "desc"
      ? params.direcao
      : coluna === padrao.coluna
        ? padrao.direcao
        : "desc";
  return { coluna, direcao };
}

/* ---------- busca textual (?busca=) ---------- */

const MAX_BUSCA = 80;

/** Texto da busca, normalizado (vazio = sem filtro). */
export function parseBusca(bruto: unknown): string {
  return typeof bruto === "string" ? bruto.trim().slice(0, MAX_BUSCA) : "";
}

/** Monta a query string preservando os demais filtros ao trocar um deles. */
export function queryDaTabela(params: {
  periodo?: string;
  busca?: string;
  paginacao?: Paginacao;
  ordenacao?: Ordenacao;
}): URLSearchParams {
  const query = new URLSearchParams();
  if (params.periodo) query.set("periodo", params.periodo);
  if (params.busca) query.set("busca", params.busca);
  if (params.paginacao) {
    query.set("pagina", String(params.paginacao.pagina));
    query.set("porPagina", String(params.paginacao.porPagina));
  }
  if (params.ordenacao) {
    query.set("ordenar", params.ordenacao.coluna);
    query.set("direcao", params.ordenacao.direcao);
  }
  return query;
}

export const dataCurta = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "America/Sao_Paulo",
});
