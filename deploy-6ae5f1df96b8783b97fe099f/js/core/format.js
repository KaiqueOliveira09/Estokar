// Datas e números no padrão brasileiro. Datas trabalham no fuso local do navegador.

const dtFmt = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
const dFmt = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short' });
const intFmt = new Intl.NumberFormat('pt-BR');
const pctFmt = new Intl.NumberFormat('pt-BR', { style: 'percent', maximumFractionDigits: 1 });

export const fmtDateTime = (iso) => dtFmt.format(new Date(iso));
export const fmtDate = (iso) => dFmt.format(new Date(iso));
export const fmtTime = (iso) => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
export const fmtInt = (n) => intFmt.format(n || 0);
export const fmtPct = (ratio) => pctFmt.format(Number.isFinite(ratio) ? ratio : 0);

export function startOfDay(d = new Date()) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
export function endOfDay(d = new Date()) {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}
export function addDays(d, n) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

// "2026-10-30" no fuso local (chave para agrupar por dia)
export function dayKey(d) {
  const x = new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
}
export const fromDayKey = (key) => new Date(`${key}T00:00:00`);

// Períodos prontos usados em relatórios e filtros
export const PERIODS = {
  hoje: 'Hoje',
  '7d': 'Últimos 7 dias',
  '30d': 'Últimos 30 dias',
  mes: 'Este mês',
  custom: 'Personalizado',
};

export function periodRange(preset, customFrom, customTo) {
  const today = new Date();
  switch (preset) {
    case 'hoje': return { from: startOfDay(today), to: endOfDay(today) };
    case '7d': return { from: startOfDay(addDays(today, -6)), to: endOfDay(today) };
    case 'mes': return { from: startOfDay(new Date(today.getFullYear(), today.getMonth(), 1)), to: endOfDay(today) };
    case 'custom': {
      const from = customFrom ? fromDayKey(customFrom) : startOfDay(addDays(today, -29));
      const to = customTo ? endOfDay(fromDayKey(customTo)) : endOfDay(today);
      return from <= to ? { from, to } : { from: startOfDay(to), to: endOfDay(from) };
    }
    case '30d':
    default: return { from: startOfDay(addDays(today, -29)), to: endOfDay(today) };
  }
}
