// Nota Fiscal → Cupons de controle interno (não fiscais): consulta, reimpressão e cancelamento.
import { formatBRL } from '../../core/money.js';
import { toast } from '../../core/toast.js';
import { $, escapeHtml as e } from '../../core/dom.js';
import { showModal } from '../../core/modal.js';
import { fmtDateTime, PERIODS, periodRange, dayKey } from '../../core/format.js';
import { PAYMENT_METHODS } from '../../shared/constants.js';
import { renderReceipt, printReceipt } from '../../shared/receipt.js';

export async function mount(root, ctx) {
  const { api } = ctx;
  let sales = [];
  const filter = { period: '7d', from: '', to: '', term: '', status: 'todas' };

  root.innerHTML = `
  <div class="mx-auto max-w-7xl space-y-4 p-4 sm:p-6">
    <div>
      <h2 class="font-display text-2xl font-semibold">Nota Fiscal <span class="text-base font-normal text-muted">· cupons internos</span></h2>
      <p class="text-sm text-muted">Comprovantes de cada venda para conferência e acerto de caixa.</p>
    </div>

    <div class="rounded-xl border border-gold-300 bg-gold-50 px-4 py-3 text-sm text-gold-700 dark:border-gold-700/50 dark:bg-gold-500/10 dark:text-gold-200">
      <b>Importante:</b> estes cupons são de <b>controle interno e não têm valor fiscal</b>.
      Para emitir NFC-e/NF-e de verdade é preciso integrar um emissor autorizado pela Sefaz e ter certificado digital.
    </div>

    <div class="card flex flex-wrap items-end gap-3 p-3">
      <div><label class="label" for="nf-period">Período</label>
        <select id="nf-period" class="select !w-auto">${Object.entries(PERIODS).map(([k, l]) => `<option value="${k}" ${k === filter.period ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
      <div id="nf-custom" class="hidden flex-wrap gap-2">
        <div><label class="label" for="nf-from">De</label><input id="nf-from" type="date" class="input"></div>
        <div><label class="label" for="nf-to">Até</label><input id="nf-to" type="date" class="input"></div>
      </div>
      <div class="min-w-[180px] flex-1"><label class="label" for="nf-search">Buscar</label>
        <input id="nf-search" type="search" class="input" placeholder="Nº do cupom, cliente, produto ou operador…"></div>
      <div><label class="label" for="nf-status">Situação</label>
        <select id="nf-status" class="select !w-auto"><option value="todas">Todas</option><option value="concluida">Concluídas</option><option value="cancelada">Canceladas</option></select></div>
    </div>

    <div id="nf-summary" class="text-xs text-muted"></div>
    <div class="card overflow-hidden"><div class="overflow-x-auto"><table class="tbl">
      <thead><tr><th>Nº</th><th>Data</th><th>Itens</th><th>Cliente</th><th>Pagamento</th><th class="num">Total</th><th>Situação</th><th></th></tr></thead>
      <tbody id="nf-rows"><tr><td colspan="8"><div class="empty">Carregando…</div></td></tr></tbody>
    </table></div></div>
  </div>`;

  async function load() {
    const range = periodRange(filter.period, filter.from, filter.to);
    sales = await api.sales.list(range);
    render();
  }

  function render() {
    const t = filter.term.trim().toLowerCase();
    const list = sales.filter((s) => (filter.status === 'todas' || s.status === filter.status)
      && (!t || String(s.number).includes(t.replace('#', '')) || (s.operator ?? '').toLowerCase().includes(t)
        || (s.customer?.name ?? '').toLowerCase().includes(t)
        || s.items.some((i) => i.name.toLowerCase().includes(t))));
    const done = list.filter((s) => s.status !== 'cancelada');
    $('#nf-summary', root).textContent = `${list.length} cupom(ns) · total ${formatBRL(done.reduce((s, x) => s + x.total, 0))}`;

    $('#nf-rows', root).innerHTML = list.length ? list.map((s) => {
      const qty = s.items.reduce((n, i) => n + i.qty, 0);
      const canceled = s.status === 'cancelada';
      return `<tr class="${canceled ? 'opacity-60' : ''}">
        <td class="font-semibold">#${String(s.number).padStart(6, '0')}</td>
        <td class="whitespace-nowrap text-muted">${fmtDateTime(s.createdAt)}</td>
        <td class="max-w-[240px] truncate" title="${e(s.items.map((i) => `${i.qty}× ${i.name} ${i.size}/${i.color}`).join(', '))}">${qty} pç · ${e(s.items[0]?.name ?? '')}${s.items.length > 1 ? ` +${s.items.length - 1}` : ''}</td>
        <td class="max-w-[180px] truncate">${s.customer?.name ? e(s.customer.name) : '<span class="text-muted">Não identificado</span>'}</td>
        <td class="whitespace-nowrap">${e([...new Set(s.payments.map((p) => PAYMENT_METHODS[p.method]))].join(' + '))}</td>
        <td class="num font-semibold">${formatBRL(s.total)}</td>
        <td><span class="badge ${canceled ? 'badge-danger' : 'badge-ok'}">${canceled ? 'Cancelada' : 'Concluída'}</span></td>
        <td class="num"><button type="button" class="btn btn-sm" data-view="${e(s.id)}">Ver cupom</button></td>
      </tr>`;
    }).join('') : '<tr><td colspan="8"><div class="empty">Nenhum cupom no período.</div></td></tr>';
  }

  function openReceipt(sale) {
    const html = renderReceipt(sale, ctx.store);
    const canceled = sale.status === 'cancelada';
    const m = showModal({
      title: `Cupom nº ${String(sale.number).padStart(6, '0')}`,
      subtitle: canceled ? `Cancelado${sale.cancelReason ? `: ${sale.cancelReason}` : ''}` : fmtDateTime(sale.createdAt),
      body: `<div class="-mx-5 -my-4 bg-slate-100 p-4 dark:bg-slate-950"><div class="shadow-md">${html}</div></div>`,
      footer: `${canceled ? '' : '<button type="button" class="btn btn-danger mr-auto" data-cancel>Cancelar venda</button>'}
               <button type="button" class="btn" data-close>Fechar</button>
               <button type="button" class="btn btn-gold" data-print>Imprimir</button>`,
    });
    m.el.querySelector('[data-print]').addEventListener('click', () => printReceipt(html));
    m.el.querySelector('[data-cancel]')?.addEventListener('click', () => { m.close(); openCancel(sale); });
  }

  function openCancel(sale) {
    const m = showModal({
      title: `Cancelar venda nº ${sale.number}`,
      subtitle: `${formatBRL(sale.total)} · ${fmtDateTime(sale.createdAt)}`,
      size: 'sm',
      body: `
        <form id="cancel-form" class="space-y-3">
          <p class="text-sm">As peças voltam para o estoque e o valor é lançado como <b>estorno</b> no caixa aberto.</p>
          <div><label class="label" for="cn-reason">Motivo *</label>
            <input id="cn-reason" class="input" required autofocus placeholder="Ex.: cliente desistiu da compra"></div>
        </form>`,
      footer: '<button type="button" class="btn" data-close>Voltar</button><button type="submit" form="cancel-form" class="btn btn-danger">Confirmar cancelamento</button>',
    });
    m.el.querySelector('form').addEventListener('submit', async (ev) => {
      ev.preventDefault();
      try {
        await api.sales.cancel(sale.id, $('#cn-reason', m.body).value.trim());
        m.close();
        toast(`Venda nº ${sale.number} cancelada`, 'success');
        await load();
      } catch (err) { toast(err.message, 'error', 6000); }
    });
  }

  $('#nf-period', root).addEventListener('change', (ev) => {
    filter.period = ev.target.value;
    const custom = filter.period === 'custom';
    $('#nf-custom', root).classList.toggle('hidden', !custom);
    $('#nf-custom', root).classList.toggle('flex', custom);
    if (custom && !filter.from) {
      const r = periodRange('30d');
      filter.from = $('#nf-from', root).value = dayKey(r.from);
      filter.to = $('#nf-to', root).value = dayKey(r.to);
    }
    load();
  });
  $('#nf-from', root).addEventListener('change', (ev) => { filter.from = ev.target.value; load(); });
  $('#nf-to', root).addEventListener('change', (ev) => { filter.to = ev.target.value; load(); });
  $('#nf-search', root).addEventListener('input', (ev) => { filter.term = ev.target.value; render(); });
  $('#nf-status', root).addEventListener('change', (ev) => { filter.status = ev.target.value; render(); });
  $('#nf-rows', root).addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-view]');
    if (b) openReceipt(sales.find((s) => s.id === b.dataset.view));
  });

  await load();
}
