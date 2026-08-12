// Faixas de porte do acervo — substituem o VALOR em reais na telemetria do
// Sucessorista: dão a noção do tamanho dos casos sem gravar patrimônio de
// cliente nenhum. Módulo próprio (não em actions.ts) porque é função pura
// usada no cliente e nos rótulos do painel — arquivo "use server" só exporta
// server actions.

export const FAIXAS_DE_PORTE = [
  { valor: "ATE_500K", rotulo: "até R$ 500 mil", limite: 500_000 },
  { valor: "500K_1M", rotulo: "R$ 500 mil a 1 milhão", limite: 1_000_000 },
  { valor: "1M_5M", rotulo: "R$ 1 a 5 milhões", limite: 5_000_000 },
  { valor: "ACIMA_5M", rotulo: "acima de R$ 5 milhões", limite: Infinity },
] as const;

export type Porte = (typeof FAIXAS_DE_PORTE)[number]["valor"];

export const PORTES: readonly string[] = FAIXAS_DE_PORTE.map((f) => f.valor);

/** Converte o valor do acervo na FAIXA — o número nunca sai do navegador. */
export function porteDoAcervo(valor: number): Porte | null {
  if (!Number.isFinite(valor) || valor <= 0) return null;
  return FAIXAS_DE_PORTE.find((f) => valor <= f.limite)!.valor;
}

export function rotuloDoPorte(valor: unknown): string {
  return FAIXAS_DE_PORTE.find((f) => f.valor === valor)?.rotulo ?? "—";
}
