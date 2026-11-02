// Estoque: saldo por variação, entrada de mercadoria, ajuste de inventário e histórico.
// A baixa por venda é automática (feita na finalização da venda).
import { formatBRL, parseBRL } from '../../core/money.js';
import { toast } from '../../core/toast.js';
import { $, $$, escapeHtml as e, debounce } from '../../core/dom.js';
import { showModal } from '../../core/modal.js';
import { fmtDateTime, fmtInt } from '../../core/format.js';
import { STOCK_TYPES } from '../../shared/constants.js';

export async function mount(root, ctx) {
  const { api } = ctx;
  let rows = [];
  const filter = { term: '', status: 'todos', tab: 'saldo' };

  root.innerHTML = `
  <div class="mx-auto max-w-7xl space-y-4 p-4 sm:p-6">
    <div class="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h2 class="font-display text-2xl font-semibold">Estoque</h2>
        <p class="text-sm text-muted">A baixa das vendas é automática. Aqui você registra entradas e ajustes.</p>
      </div>
      <div class="tabs" role="tablist">
        <button type="button" class="tab is-active" data-tab="saldo" role="tab">Saldo atual</button>
        <button type="button" class="tab" data-tab="historico" role="tab">Movimentações</button>
      </div>
    </div>
    <div id="stock-kpis" class="grid grid-cols-2 gap-3 lg:grid-cols-4"></div>
    <div id="stock-body"></div>
  </div>`;

  async function load() {
    const products = await api.catalog.listProducts();
    rows = products.filter((p) => p.active).flatMap((p) => p.variants.filter((v) => v.active).map((v) => ({ ...v, product: p })));
    renderKpis();
    renderTab();
  }

  function renderKpis() {
    const units = rows.reduce((s, r) => s + r.stock, 0);
    const value = rows.reduce((s, r) => s + r.stock * r.cost, 0);
    const low = rows.filter((r) => r.stock > 0 && r.stock <= r.minStock).length;
    const out = rows.filter((r) => r.stock === 0).length;
    const k = (label, v, cls = '') => `<div class="card p-4"><div class="kpi-label">${label}</div><div class="kpi-value mt-1 ${cls}">${v}</div></div>`;
    $('#stock-kpis', root).innerHTML = k('Peças em estoque', fmtInt(units)) + k('Valor em estoque (custo)', formatBRL(value))
      + k('Estoque baixo', fmtInt(low), low ? 'text-gold' : '') + k('Esgotados', fmtInt(out), out ? 'text-rose' : '');
  }

  function renderTab() {
    $$('[data-tab]', root).forEach((t) => t.classList.toggle('is-active', t.dataset.tab === filter.tab));
    if (filter.tab === 'saldo') renderStock();
    else renderHistory();
  }

  function renderStock() {
    const body = $('#stock-body', root);
    if (!$('#st-search', body)) {
      body.innerHTML = `
        <div class="card overflow-hidden">
          <div class="border-app flex flex-wrap gap-3 border-b p-3">
            <input id="st-search" type="search" class="input min-w-[200px] flex-1" placeholder="Buscar produto, SKU, tamanho ou cor…" value="${e(filter.term)}">
            <div class="tabs">
              ${[['todos', 'Todos'], ['baixo', 'Estoque baixo'], ['zerado', 'Esgotados']].map(([k, l]) => `<button type="button" class="tab ${filter.status === k ? 'is-active' : ''}" data-status="${k}">${l}</button>`).join('')}
            </div>
          </div>
          <div class="overflow-x-auto"><table class="tbl"><thead><tr>
            <th>Produto</th><th>Tam.</th><th>Cor</th><th>SKU</th><th class="num">Estoque</th><th class="num">Mínimo</th><th class="num">Custo</th><th></th>
          </tr></thead><tbody id="st-rows"></tbody></table></div>
        </div>`;
      $('#st-search', body).addEventListener('input', debounce((ev) => { filter.term = ev.target.value; renderStock(); }, 150));
    }
    $$('[data-status]', body).forEach((b) => b.classList.toggle('is-active', b.dataset.status === filter.status));

    const t = filter.term.toLowerCase();
    const list = rows.filter((r) => {
      if (filter.status === 'baixo' && !(r.stock > 0 && r.stock <= r.minStock)) return false;
      if (filter.status === 'zerado' && r.stock !== 0) return false;
      return !t || [r.product.name, r.sku, r.size, r.color, r.barcode].some((x) => (x ?? '').toLowerCase().includes(t));
    }).sort((a, b) => a.product.name.localeCompare(b.product.name) || a.sizeOrder - b.sizeOrder || a.color.localeCompare(b.color));

    $('#st-rows', body).innerHTML = list.length ? list.map((r) => {
      const cls = r.stock === 0 ? 'badge-danger' : r.stock <= r.minStock ? 'badge-warn' : 'badge-ok';
      return `<tr>
        <td class="max-w-[220px] truncate font-medium">${e(r.product.name)}</td>
        <td>${e(r.size)}</td>
        <td><span class="inline-flex items-center gap-2 whitespace-nowrap"><span class="h-3 w-3 rounded-full ring-1 ring-black/10" style="background:${e(r.colorHex ?? '#ccc')}"></span>${e(r.color)}</span></td>
        <td class="whitespace-nowrap text-xs text-muted">${e(r.sku)}</td>
        <td class="num"><span class="badge ${cls}">${r.stock}</span></td>
        <td class="num text-muted">${r.minStock}</td>
        <td class="num text-muted">${formatBRL(r.cost)}</td>
        <td class="num"><div class="inline-flex gap-1.5">
          <button type="button" class="btn btn-sm btn-gold" data-entry="${e(r.id)}">+ Entrada</button>
          <button type="button" class="btn btn-sm" data-adjust="${e(r.id)}">Ajustar</button>
        </div></td></tr>`;
    }).join('') : '<tr><td colspan="8"><div class="empty">Nenhum item encontrado.</div></td></tr>';
  }

  async function renderHistory() {
    const body = $('#stock-body', root);
    body.innerHTML = '<div class="card"><div class="empty">Carregando movimentações…</div></div>';
    const movs = await api.stock.movements({ limit: 200 });
    if (filter.tab !== 'historico') return;
    body.innerHTML = `
      <div class="card overflow-hidden"><div class="overflow-x-auto"><table class="tbl">
        <thead><tr><th>Data</th><th>Tipo</th><th>Produto</th><th>Tam./Cor</th><th class="num">Qtd.</th><th>Motivo</th></tr></thead>
        <tbody>${movs.length ? movs.map((m) => `<tr>
          <td class="whitespace-nowrap text-muted">${fmtDateTime(m.at)}</td>
          <td><span class="badge ${m.quantity > 0 ? 'badge-ok' : 'badge-rose'}">${e(STOCK_TYPES[m.type] ?? m.type)}</span></td>
          <td class="max-w-[220px] truncate">${e(m.productName)}</td>
          <td class="whitespace-nowrap">${e(m.size ?? '')} · ${e(m.color ?? '')}</td>
          <td class="num font-semibold ${m.quantity > 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose'}">${m.quantity > 0 ? '+' : ''}${m.quantity}</td>
          <td class="text-muted">${e(m.reason ?? '')}</td></tr>`).join('')
        : '<tr><td colspan="6"><div class="empty">Nenhuma movimentação.</div></td></tr>'}</tbody>
      </table></div></div>`;
  }

  function variantTitle(r) {
    return `${r.product.name} · Tam ${r.size} · ${r.color}`;
  }

  function openEntry(r) {
    const m = showModal({
      title: 'Entrada de mercadoria',
      subtitle: variantTitle(r),
      size: 'sm',
      body: `
        <form id="entry-form" class="space-y-3">
          <div class="rounded-xl bg-slate-50 px-3 py-2 text-sm dark:bg-slate-800/60">Estoque atual: <b>${r.stock}</b> peça(s)</div>
          <div><label class="label" for="en-qty">Quantidade recebida *</label>
            <input id="en-qty" type="number" min="1" class="input text-right" required autofocus></div>
          <div><label class="label" for="en-cost">Custo unitário (R$)</label>
            <input id="en-cost" class="input text-right" inputmode="decimal" placeholder="${(r.cost / 100).toFixed(2).replace('.', ',')}"></div>
          <div><label class="label" for="en-reason">Observação</label>
            <input id="en-reason" class="input" placeholder="Ex.: NF do fornecedor 1234" value="Entrada de mercadoria"></div>
        </form>`,
      footer: '<button type="button" class="btn" data-close>Cancelar</button><button type="submit" form="entry-form" class="btn btn-gold">Registrar entrada</button>',
    });
    m.el.querySelector('form').addEventListener('submit', async (ev) => {
      ev.preventDefault();
      try {
        await api.stock.entry({
          variantId: r.id,
          quantity: parseInt($('#en-qty', m.body).value, 10),
          unitCost: parseBRL($('#en-cost', m.body).value) || null,
          reason: $('#en-reason', m.body).value.trim() || 'Entrada de mercadoria',
        });
        m.close();
        toast('Entrada registrada', 'success');
        await load();
      } catch (err) { toast(err.message, 'error'); }
    });
  }

  function openAdjust(r) {
    const m = showModal({
      title: 'Ajuste de inventário',
      subtitle: variantTitle(r),
      size: 'sm',
      body: `
        <form id="adjust-form" class="space-y-3">
          <p class="text-sm text-muted">Use após uma contagem física. O sistema registra a diferença no histórico.</p>
          <div class="grid grid-cols-2 gap-3">
            <div><label class="label" for="aj-qty">Quantidade contada *</label>
              <input id="aj-qty" type="number" min="0" class="input text-right" required autofocus value="${r.stock}"></div>
            <div><label class="label" for="aj-min">Estoque mínimo</label>
              <input id="aj-min" type="number" min="0" class="input text-right" value="${r.minStock}"></div>
          </div>
          <div><label class="label" for="aj-reason">Motivo</label>
            <input id="aj-reason" class="input" value="Contagem de inventário"></div>
        </form>`,
      footer: '<button type="button" class="btn" data-close>Cancelar</button><button type="submit" form="adjust-form" class="btn btn-gold">Salvar ajuste</button>',
    });
    m.el.querySelector('form').addEventListener('submit', async (ev) => {
      ev.preventDefault();
      try {
        const newStock = parseInt($('#aj-qty', m.body).value, 10);
        const minStock = parseInt($('#aj-min', m.body).value, 10);
        if (newStock !== r.stock) await api.stock.adjust({ variantId: r.id, newStock, reason: $('#aj-reason', m.body).value.trim() });
        if (minStock !== r.minStock) await api.stock.setMinStock(r.id, minStock);
        m.close();
        toast('Estoque atualizado', 'success');
        await load();
      } catch (err) { toast(err.message, 'error'); }
    });
  }

  root.addEventListener('click', (ev) => {
    const tab = ev.target.closest('[data-tab]');
    const status = ev.target.closest('[data-status]');
    const entry = ev.target.closest('[data-entry]');
    const adjust = ev.target.closest('[data-adjust]');
    if (tab) { filter.tab = tab.dataset.tab; renderTab(); }
    if (status) { filter.status = status.dataset.status; renderStock(); }
    if (entry) openEntry(rows.find((r) => r.id === entry.dataset.entry));
    if (adjust) openAdjust(rows.find((r) => r.id === adjust.dataset.adjust));
  });

  await load();
}
