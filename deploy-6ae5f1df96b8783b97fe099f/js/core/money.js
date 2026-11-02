// Todo cálculo monetário no frontend é feito em CENTAVOS (inteiros) para evitar erros de ponto flutuante.

const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

export const toCents = (value) => Math.round(Number(value || 0) * 100);
export const fromCents = (cents) => Number((cents / 100).toFixed(2));
export const formatBRL = (cents) => brl.format((cents || 0) / 100);

// Aceita "10", "10,5", "1.234,56", "R$ 10,00", "10.50"
export function parseBRL(input) {
  if (input == null) return 0;
  let s = String(input).replace(/[^\d,.-]/g, '').trim();
  if (!s) return 0;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  const n = Number(s);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : 0;
}
