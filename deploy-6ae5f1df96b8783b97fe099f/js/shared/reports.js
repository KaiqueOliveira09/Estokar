// Cálculos de indicadores a partir da lista de vendas (usado no Início e no Relatório).
// Valores monetários em centavos.
import { addDays, dayKey, fromDayKey, startOfDay } from '../core/format.js';
import { PAYMENT_METHODS, SIZE_ORDER } from './constants.js';

const sumBy = (arr, fn) => arr.reduce((s, x) => s + fn(x), 0);

function groupSum(entries) {
  const map = new Map();
  for (const [key, value] of entries) map.set(key, (map.get(key) ?? 0) + value);
  return map;
}

export function computeReport(sales, { from, to }) {
  const inRange = sales.filter((s) => {
    const t = new Date(s.createdAt);
    return t >= from && t <= to;
  });
  const done = inRange.filter((s) => s.status !== 'cancelada');
  const items = done.flatMap((s) => s.items.map((i) => ({ ...i, sale: s })));

  const revenue = sumBy(done, (s) => s.total);
  const count = done.length;
  const discounts = sumBy(done, (s) => s.discount);
  const pieces = sumBy(items, (i) => i.qty);
  const cost = sumBy(items, (i) => (i.unitCost ?? 0) * i.qty);
  const grossProfit = revenue - cost;

  // Série por dia (até ~3 meses) ou por mês (períodos maiores)
  const days = Math.round((startOfDay(to) - startOfDay(from)) / 86400000) + 1;
  const monthly = days > 92;
  const keyOf = (iso) => (monthly ? dayKey(iso).slice(0, 7) : dayKey(iso));
  const revenueByKey = groupSum(done.map((s) => [keyOf(s.createdAt), s.total]));
  const countByKey = groupSum(done.map((s) => [keyOf(s.createdAt), 1]));
  const series = [];
  if (monthly) {
    for (let d = new Date(from.getFullYear(), from.getMonth(), 1); d <= to; d = new Date(d.getFullYear(), d.getMonth() + 1, 1)) {
      const k = dayKey(d).slice(0, 7);
      series.push({ key: k, label: d.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }), value: revenueByKey.get(k) ?? 0, count: countByKey.get(k) ?? 0 });
    }
  } else {
    for (let d = startOfDay(from); d <= to; d = addDays(d, 1)) {
      const k = dayKey(d);
      const dt = fromDayKey(k);
      series.push({
        key: k,
        label: dt.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
        tooltip: dt.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' }),
        value: revenueByKey.get(k) ?? 0,
        count: countByKey.get(k) ?? 0,
      });
    }
  }

  // Formas de pagamento: dinheiro descontado do troco (valor que efetivamente ficou)
  const byMethod = groupSum(done.flatMap((s) => {
    let change = s.change ?? 0;
    return s.payments.map((p) => {
      if (p.method !== 'dinheiro' || !change) return [p.method, p.amount];
      const net = Math.max(0, p.amount - change);
      change -= p.amount - net;
      return [p.method, net];
    });
  }));

  const productAgg = new Map();
  for (const i of items) {
    const a = productAgg.get(i.name) ?? { label: i.name, qty: 0, revenue: 0, cost: 0 };
    a.qty += i.qty;
    a.revenue += i.total;
    a.cost += (i.unitCost ?? 0) * i.qty;
    productAgg.set(i.name, a);
  }
  const products = [...productAgg.values()].sort((a, b) => b.qty - a.qty || b.revenue - a.revenue);

  const byCategory = groupSum(items.map((i) => [i.category || 'Sem categoria', i.total]));
  const bySize = groupSum(items.map((i) => [i.size, i.qty]));
  const byColor = groupSum(items.map((i) => [i.color || '—', i.qty]));
  const identified = done.filter((s) => s.customer?.name);
  const customerAgg = new Map();
  for (const s of identified) {
    const key = s.customerId ?? s.customer.id ?? s.customer.name;
    const a = customerAgg.get(key) ?? { label: s.customer.name, value: 0, purchases: 0 };
    a.value += s.total;
    a.purchases += 1;
    customerAgg.set(key, a);
  }
  const byHour = groupSum(done.map((s) => [new Date(s.createdAt).getHours(), 1]));

  const sortDesc = (map) => [...map].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);

  return {
    range: { from, to, days, monthly },
    revenue,
    count,
    avgTicket: count ? Math.round(revenue / count) : 0,
    discounts,
    pieces,
    piecesPerSale: count ? pieces / count : 0,
    cost,
    grossProfit,
    margin: revenue ? grossProfit / revenue : 0,
    canceled: inRange.length - done.length,
    identifiedShare: count ? identified.length / count : 0,
    topCustomers: [...customerAgg.values()].sort((a, b) => b.value - a.value),
    series,
    byMethod: Object.keys(PAYMENT_METHODS)
      .map((m) => ({ key: m, label: PAYMENT_METHODS[m], value: byMethod.get(m) ?? 0 }))
      .filter((x) => x.value > 0)
      .sort((a, b) => b.value - a.value),
    products,
    byCategory: sortDesc(byCategory),
    bySize: [...bySize].map(([label, value]) => ({ label, value }))
      .sort((a, b) => (SIZE_ORDER[a.label] ?? 500) - (SIZE_ORDER[b.label] ?? 500)),
    byColor: sortDesc(byColor),
    byHour: Array.from({ length: 24 }, (_, h) => ({ label: `${h}h`, tooltip: `${h}h às ${h + 1}h`, value: byHour.get(h) ?? 0 }))
      .filter((x, h, arr) => h >= 8 && h <= 21 || x.value > 0),
  };
}
