// Moeda (R$) — fonte ÚNICA da máscara de valores monetários (portada do
// calcarios-polar-app, mesma filosofia): os dígitos digitados são tratados
// como CENTAVOS — "1234" vira "12,34" — e o ponto de milhar entra sozinho.
// Idempotente sobre um valor já mascarado.

/**
 * Máscara pt-BR sem o prefixo "R$". Aceita número (exibir valor já gravado)
 * ou string (o que vem do input). Sem dígitos → "" (campo vazio continua
 * vazio, para o placeholder aparecer e o zod exigir quando obrigatório).
 */
export function mascararMoeda(valor: string | number): string {
  const digitos =
    typeof valor === "number"
      ? String(Math.round(valor * 100))
      : valor.replace(/\D/g, "");
  if (!digitos) return "";

  const cents = Math.min(Number.MAX_SAFE_INTEGER, parseInt(digitos.slice(0, 15), 10));
  return (cents / 100)
    .toFixed(2)
    .replace(/\./g, ",")
    .replace(/(\d)(?=(\d{3})+(?!\d))/g, "$1.");
}

/** Inverso da máscara: "1.234,56" → 1234.56. Vazio → undefined. */
export function moedaParaNumero(mascarado: string): number | undefined {
  const digitos = mascarado.replace(/\D/g, "");
  if (!digitos) return undefined;
  return Number(digitos) / 100;
}
