/**
 * Máscara de CPF — formata progressivamente enquanto a pessoa digita:
 * "123456" → "123.456", "12345678900" → "123.456.789-00". Aceita colar o
 * número com ou sem pontuação; qualquer caractere não numérico é descartado
 * e o excedente de 11 dígitos é cortado. O valor guardado é o TEXTO mascarado
 * (o padrão visual pedido para os campos de CPF da plataforma).
 */
export function mascararCpf(texto: string): string {
  const d = texto.replace(/\D/g, '').slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}
