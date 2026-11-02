// Relatório: escolha o período e gere um dashboard com indicadores, gráficos e ranking.
// Também permite imprimir/salvar em PDF e exportar CSV das vendas.
import { formatBRL } from '../../core/money.js';
import { toast } from '../../core/toast.js';
import { $, escapeHtml as e } from '../../core/dom.js';
import { fmtDate, fmtDateTime, fmtInt, fmtPct, PERIODS, periodRange, dayKey } from '../../core/format.js';
import { computeReport } from '../../shared/reports.js';
import { columnChart, barList } from '../../shared/charts.js';
import { PAYMENT_METHODS } from '../../shared/constants.js';
import { printHtml } from '../../shared/receipt.js';

const compactBRL = (cents) => {
  const v = cents / 100;
  if (v >= 1000) return `R$ ${(v / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} mil`;
  return `R$ ${Math.round(v).toLocaleString('pt-BR')}`;
};

export async function mount(root, ctx) {
  const { api } = ctx;
  const state = { period: '30d', from: '', to: '', sales: [], report: null };

  root.innerHTML = `
  <div class="mx-auto max-w-7xl space-y-5 p-4 sm:p-6">
    <div>
      <h2 class="font-display text-2xl font-semibold">Relatório</h2>
      <p class="text-sm text-muted">Escolha o período e gere o dashboard da loja.</p>
    </div>

    <div class="card flex flex-wrap items-end gap-3 p-4">
      <div class="flex flex-wrap gap-2" id="rp-presets">
        ${Object.entries(PERIODS).map(([k, l]) => `<button type="button" class="chip ${k === state.period ? 'is-active' : ''}" data-period="${k}">${l}</button>`).join('')}
      </div>
      <div id="rp-custom" class="hidden flex-wrap gap-2">
        <div><label class="label" for="rp-from">De</label><input id="rp-from" type="date" class="input"></div>
        <div><label class="label" for="rp-to">Até</label><input id="rp-to" type="date" class="input"></div>
      </div>
      <button id="rp-generate" type="button" class="btn btn-gold ml-auto">Gerar dashboard</button>
    </div>

    <div id="rp-output"></div>
  </div>`;

  async function generate() {
    const btn = $('#rp-generate', root);
    btn.disabled = true;
    btn.textContent = 'Gerando…';
    try {
      const range = periodRange(state.period, state.from, state.to);
      state.sales = await api.sales.list(range);
      state.report = computeReport(state.sales, range);
      renderDashboard();
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Gerar dashboard';
    }
  }

  function renderDashboard() {
    const r = state.report;
    const out = $('#rp-output', root);
    const label = state.period === 'custom' ? `${fmtDate(r.range.from)} a ${fmtDate(r.range.to)}` : `${PERIODS[state.period]} (${fmtDate(r.range.from)} a ${fmtDate(r.range.to)})`;

    if (!r.count) {
      out.innerHTML = `<div class="card"><div class="empty">Nenhuma venda em ${e(label)}.</div></div>`;
      return;
    }

    const kpi = (lbl, value, sub = '') => `<div class="card p-4"><div class="kpi-label">${lbl}</div><div class="kpi-value mt-1">${value}</div>${sub ? `<div class="mt-1 text-xs text-muted">${sub}</div>` : ''}</div>`;
    const best = r.series.reduce((a, b) => (b.value > a.value ? b : a), r.series[0]);

    out.innerHTML = `
      <div id="rp-dashboard" class="space-y-4">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div class="font-display text-xl font-semibold">Dashboard <span class="text-gold">✦</span> ${e(ctx.store?.name ?? 'Ciboff')}</div>
            <div class="text-sm text-muted">${e(label)}</div>
          </div>
          <div class="flex gap-2 print:hidden">
            <button type="button" class="btn btn-sm" data-export>Exportar CSV</button>
            <button type="button" class="btn btn-sm btn-rose" data-print>Imprimir / PDF</button>
          </div>
        </div>

        <div class="grid grid-cols-2 gap-3 lg:grid-cols-4">
          ${kpi('Faturamento', formatBRL(r.revenue), `${fmtInt(r.count)} vendas`)}
          ${kpi('Ticket médio', formatBRL(r.avgTicket), `${r.piecesPerSale.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} peças por venda`)}
          ${kpi('Lucro bruto', formatBRL(r.grossProfit), `margem de ${fmtPct(r.margin)}`)}
          ${kpi('Peças vendidas', fmtInt(r.pieces), `${formatBRL(r.discounts)} em descontos${r.canceled ? ` · ${r.canceled} cancelada(s)` : ''}`)}
        </div>

        <section class="card p-5">
          <div class="mb-4 flex flex-wrap items-baseline justify-between gap-2">
            <h3 class="card-title">Faturamento por ${r.range.monthly ? 'mês' : 'dia'}</h3>
            <span class="text-xs text-muted">Melhor ${r.range.monthly ? 'mês' : 'dia'}: <b>${e(best.tooltip ?? best.label)}</b> · ${formatBRL(best.value)}</span>
          </div>
          <div id="rp-chart-days"></div>
          <details class="mt-3 text-sm">
            <summary class="cursor-pointer text-xs font-medium text-rose">Ver dados em tabela</summary>
            <div class="mt-2 max-h-64 overflow-y-auto"><table class="tbl">
              <thead><tr><th>${r.range.monthly ? 'Mês' : 'Dia'}</th><th class="num">Vendas</th><th class="num">Faturamento</th></tr></thead>
              <tbody>${r.series.map((d) => `<tr><td>${e(d.tooltip ?? d.label)}</td><td class="num">${d.count}</td><td class="num">${formatBRL(d.value)}</td></tr>`).join('')}</tbody>
            </table></div>
          </details>
        </section>

        <div class="grid gap-4 lg:grid-cols-3">
          <section class="card p-5">
            <h3 class="card-title mb-4">Formas de pagamento</h3>
            ${barList(r.byMethod.map((m) => ({ label: m.label, value: m.value, sub: fmtPct(m.value / r.revenue) })), { format: formatBRL })}
          </section>
          <section class="card p-5">
            <h3 class="card-title mb-4">Vendas por categoria</h3>
            ${barList(r.byCategory.slice(0, 8), { format: formatBRL })}
          </section>
          <section class="card p-5">
            <h3 class="card-title mb-4">Peças por tamanho</h3>
            ${barList(r.bySize, { format: (v) => `${fmtInt(v)} pç` })}
          </section>
        </div>

        <div class="grid gap-4 lg:grid-cols-3">
          <section class="card overflow-hidden lg:col-span-2">
            <div class="border-app flex items-center justify-between border-b px-5 py-3">
              <h3 class="card-title">Produtos mais vendidos</h3>
              <span class="text-xs text-muted">${r.products.length} produto(s)</span>
            </div>
            <div class="max-h-[420px] overflow-auto"><table class="tbl">
              <thead><tr><th>#</th><th>Produto</th><th class="num">Peças</th><th class="num">Faturamento</th><th class="num">Lucro</th><th class="num">Margem</th></tr></thead>
              <tbody>${r.products.slice(0, 15).map((p, i) => `<tr>
                <td class="text-muted">${i + 1}</td>
                <td class="font-medium">${e(p.label)}</td>
                <td class="num">${fmtInt(p.qty)}</td>
                <td class="num">${formatBRL(p.revenue)}</td>
                <td class="num">${formatBRL(p.revenue - p.cost)}</td>
                <td class="num text-muted">${fmtPct(p.revenue ? (p.revenue - p.cost) / p.revenue : 0)}</td></tr>`).join('')}</tbody>
            </table></div>
          </section>
          <section class="card p-5">
            <h3 class="card-title mb-4">Cores mais vendidas</h3>
            ${barList(r.byColor.slice(0, 8), { format: (v) => `${fmtInt(v)} pç` })}
          </section>
        </div>

        <div class="grid gap-4 lg:grid-cols-3">
          <section class="card p-5 lg:col-span-2">
            <div class="mb-4 flex flex-wrap items-baseline justify-between gap-2">
              <h3 class="card-title">Movimento por horário</h3>
              <span class="text-xs text-muted">Número de vendas em cada faixa de horário</span>
            </div>
            <div id="rp-chart-hours"></div>
          </section>
          <section class="card p-5">
            <div class="mb-4 flex flex-wrap items-baseline justify-between gap-2">
              <h3 class="card-title">Melhores clientes</h3>
              <span class="text-xs text-muted">${fmtPct(r.identifiedShare)} das vendas identificadas</span>
            </div>
            ${barList(r.topCustomers.slice(0, 6).map((c) => ({ label: c.label, value: c.value, sub: `${c.purchases} compra(s)` })), { format: formatBRL, emptyText: 'Nenhuma venda com cliente identificado.' })}
          </section>
        </div>
      </div>`;

    columnChart($('#rp-chart-days', out), { data: r.series, format: compactBRL, ariaLabel: `Faturamento por ${r.range.monthly ? 'mês' : 'dia'}` });
    columnChart($('#rp-chart-hours', out), {
      data: r.byHour,
      format: (v) => `${Math.round(v)} venda${Math.round(v) === 1 ? '' : 's'}`,
      height: 160,
      ariaLabel: 'Vendas por horário',
    });
  }

  function exportCsv() {
    const rows = [['Numero', 'Data', 'Situacao', 'Operador', 'Itens', 'Subtotal', 'Desconto', 'Total', 'Pagamento']];
    for (const s of state.sales) {
      rows.push([
        s.number, fmtDateTime(s.createdAt), s.status, s.operator ?? '',
        s.items.map((i) => `${i.qty}x ${i.name} ${i.size}/${i.color}`).join(' | '),
        (s.subtotal / 100).toFixed(2).replace('.', ','), (s.discount / 100).toFixed(2).replace('.', ','),
        (s.total / 100).toFixed(2).replace('.', ','),
        s.payments.map((p) => `${PAYMENT_METHODS[p.method]} ${(p.amount / 100).toFixed(2).replace('.', ',')}`).join(' + '),
      ]);
    }
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(';')).join('\r\n');
    const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
    const a = Object.assign(document.createElement('a'), { href: url, download: `vendas-ciboff-${dayKey(new Date())}.csv` });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  root.addEventListener('click', (ev) => {
    const p = ev.target.closest('[data-period]');
    if (p) {
      state.period = p.dataset.period;
      root.querySelectorAll('[data-period]').forEach((b) => b.classList.toggle('is-active', b === p));
      const custom = state.period === 'custom';
      $('#rp-custom', root).classList.toggle('hidden', !custom);
      $('#rp-custom', root).classList.toggle('flex', custom);
      if (custom && !state.from) {
        const r = periodRange('30d');
        state.from = $('#rp-from', root).value = dayKey(r.from);
        state.to = $('#rp-to', root).value = dayKey(r.to);
      }
      if (!custom) generate();
    }
    if (ev.target.closest('[data-export]')) exportCsv();
    if (ev.target.closest('[data-print]')) printHtml($('#rp-dashboard', root).outerHTML, { page: 'a4' });
  });
  $('#rp-generate', root).addEventListener('click', generate);
  $('#rp-from', root).addEventListener('change', (ev) => { state.from = ev.target.value; });
  $('#rp-to', root).addEventListener('change', (ev) => { state.to = ev.target.value; });

  await generate();
}
