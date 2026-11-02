// Início: visão rápida do dia (vendas, faturamento, mais vendidos, alertas de estoque).
import { formatBRL } from '../../core/money.js';
import { escapeHtml as e } from '../../core/dom.js';
import { fmtInt, fmtTime, periodRange } from '../../core/format.js';
import { computeReport } from '../../shared/reports.js';
import { barList } from '../../shared/charts.js';
import { PAYMENT_METHODS } from '../../shared/constants.js';

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite';
}

const kpi = (label, value, sub = '') => `
  <div class="card p-4">
    <div class="kpi-label">${label}</div>
    <div class="kpi-value mt-1">${value}</div>
    ${sub ? `<div class="mt-1 text-xs text-muted">${sub}</div>` : ''}
  </div>`;

const shortcut = (route, title, desc) => `
  <a href="#/${route}" class="card group flex items-center justify-between gap-3 p-4 transition hover:border-brand-400 hover:shadow-md">
    <div><div class="font-semibold">${title}</div><div class="text-xs text-muted">${desc}</div></div>
    <span class="text-gold transition group-hover:translate-x-1">→</span>
  </a>`;

export async function mount(root, ctx) {
  root.innerHTML = '<div class="empty">Carregando painel…</div>';
  const today = periodRange('hoje');
  const month = periodRange('30d');
  const yesterday = { from: new Date(today.from.getTime() - 86400000), to: new Date(today.to.getTime() - 86400000) };

  const [sales, products] = await Promise.all([
    ctx.api.sales.list({ from: month.from, to: month.to }),
    ctx.api.catalog.listProducts(),
  ]);
  const d = computeReport(sales, today);
  const y = computeReport(sales, yesterday);
  const m = computeReport(sales, month);

  const low = products.filter((p) => p.active).flatMap((p) => p.variants
    .filter((v) => v.active && v.stock <= v.minStock)
    .map((v) => ({ ...v, product: p.name })))
    .sort((a, b) => a.stock - b.stock);

  const recent = sales.filter((s) => s.status !== 'cancelada').slice(0, 6);
  const diff = y.revenue ? (d.revenue - y.revenue) / y.revenue : null;
  const diffText = diff == null ? 'sem vendas ontem para comparar'
    : `${diff >= 0 ? '▲' : '▼'} ${Math.abs(Math.round(diff * 100))}% em relação a ontem`;

  root.innerHTML = `
  <div class="mx-auto max-w-7xl space-y-6 p-4 sm:p-6">
    <div class="flex flex-wrap items-end justify-between gap-3">
      <div>
        <p class="text-sm text-muted">${new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
        <h2 class="font-display text-3xl font-semibold">${greeting()}! <span class="text-gold">✦</span></h2>
      </div>
      <a href="#/vendas" class="btn btn-gold btn-lg">Nova venda</a>
    </div>

    <div class="grid grid-cols-2 gap-3 lg:grid-cols-4">
      ${kpi('Faturamento hoje', formatBRL(d.revenue), diffText)}
      ${kpi('Vendas hoje', fmtInt(d.count), `${fmtInt(d.pieces)} peças vendidas`)}
      ${kpi('Ticket médio', formatBRL(d.avgTicket), 'valor médio por venda')}
      ${kpi('Últimos 30 dias', formatBRL(m.revenue), `${fmtInt(m.count)} vendas`)}
    </div>

    <div class="grid gap-4 lg:grid-cols-3">
      <section class="card p-5 lg:col-span-1">
        <div class="mb-4 flex items-center justify-between">
          <h3 class="card-title">Mais vendidos <span class="text-xs font-normal text-muted">· 30 dias</span></h3>
          <a href="#/relatorio" class="text-xs font-medium text-rose">Ver relatório</a>
        </div>
        ${barList(m.products.slice(0, 5).map((p) => ({ label: p.label, value: p.qty, sub: formatBRL(p.revenue) })), { format: (v) => `${fmtInt(v)} pç` })}
      </section>

      <section class="card p-5">
        <div class="mb-4 flex items-center justify-between">
          <h3 class="card-title">Alertas de estoque baixo</h3>
          <span class="badge ${low.length ? 'badge-warn' : 'badge-ok'}">${low.length}</span>
        </div>
        ${low.length ? `<ul class="scroll-thin max-h-72 space-y-2 overflow-y-auto pr-1">
          ${low.slice(0, 12).map((v) => `
            <li class="flex items-center justify-between gap-3 text-sm">
              <span class="min-w-0"><span class="block truncate">${e(v.product)}</span>
                <span class="text-xs text-muted">Tam ${e(v.size)} · ${e(v.color)}</span></span>
              <span class="badge ${v.stock === 0 ? 'badge-danger' : 'badge-warn'}">${v.stock === 0 ? 'Esgotado' : `${v.stock} un.`}</span>
            </li>`).join('')}
          </ul>
          <a href="#/estoque" class="btn btn-sm btn-rose mt-4 w-full">Repor estoque</a>`
        : '<div class="empty">Tudo certo! Nenhum item abaixo do mínimo.</div>'}
      </section>

      <section class="card p-5">
        <div class="mb-4 flex items-center justify-between">
          <h3 class="card-title">Últimas vendas</h3>
          <a href="#/notas" class="text-xs font-medium text-rose">Ver cupons</a>
        </div>
        ${recent.length ? `<ul class="space-y-3">
          ${recent.map((s) => `
            <li class="flex items-center justify-between gap-3 text-sm">
              <span><span class="font-medium">#${s.number}</span>
                <span class="text-xs text-muted">· ${fmtTime(s.createdAt)} · ${e(s.payments.map((p) => PAYMENT_METHODS[p.method]).join(' + '))}</span></span>
              <span class="font-semibold tabular-nums">${formatBRL(s.total)}</span>
            </li>`).join('')}
        </ul>` : '<div class="empty">Nenhuma venda ainda.</div>'}
      </section>
    </div>

    <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      ${shortcut('catalogo', 'Cadastrar produto', 'Novo item com grade de tamanhos e cores')}
      ${shortcut('estoque', 'Entrada de mercadoria', 'Registrar reposição de estoque')}
      ${shortcut('financeiro', 'Caixa do dia', ctx.session ? 'Sangria, despesas e fechamento' : 'Abrir o caixa')}
      ${shortcut('relatorio', 'Gerar dashboard', 'Indicadores por período')}
    </div>
  </div>`;
}
