// Clientes: cadastro (nome, CPF, telefone, e-mail, nascimento), aniversariantes e histórico de compras.
import { formatBRL } from '../../core/money.js';
import { $, escapeHtml as e, debounce } from '../../core/dom.js';
import { showModal } from '../../core/modal.js';
import { fmtDate, fmtDateTime, fmtInt } from '../../core/format.js';
import { openCustomerForm } from '../../shared/customer-form.js';
import { formatCPF, formatPhone, whatsappLink, birthdayInfo } from '../../shared/customer-utils.js';
import { renderReceipt, printReceipt } from '../../shared/receipt.js';

export async function mount(root, ctx) {
  const { api } = ctx;
  let customers = [];
  const filter = { term: '', view: 'todos' };

  root.innerHTML = `
  <div class="mx-auto max-w-7xl space-y-4 p-4 sm:p-6">
    <div class="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h2 class="font-display text-2xl font-semibold">Clientes</h2>
        <p class="text-sm text-muted">Cadastro, aniversariantes e histórico de compras.</p>
      </div>
      <button id="new-customer" type="button" class="btn btn-gold">+ Novo cliente</button>
    </div>
    <div id="cl-kpis" class="grid grid-cols-2 gap-3 lg:grid-cols-4"></div>
    <div class="card overflow-hidden">
      <div class="border-app flex flex-wrap gap-3 border-b p-3">
        <input id="cl-search" type="search" class="input min-w-[200px] flex-1" placeholder="Buscar por nome, CPF, telefone ou e-mail…">
        <div class="tabs">
          <button type="button" class="tab is-active" data-view="todos">Todos</button>
          <button type="button" class="tab" data-view="aniversario">🎂 Aniversariantes do mês</button>
        </div>
      </div>
      <div class="overflow-x-auto"><table class="tbl">
        <thead><tr><th>Nome</th><th>CPF</th><th>Telefone</th><th>E-mail</th><th>Nascimento</th><th class="num">Compras</th><th class="num">Total gasto</th><th>Última compra</th><th></th></tr></thead>
        <tbody id="cl-rows"><tr><td colspan="9"><div class="empty">Carregando…</div></td></tr></tbody>
      </table></div>
    </div>
  </div>`;

  async function load() {
    customers = await api.customers.list();
    renderKpis();
    render();
  }

  function renderKpis() {
    const birthdays = customers.filter((c) => birthdayInfo(c.birthDate)?.thisMonth).length;
    const recent = customers.filter((c) => c.lastPurchase && Date.now() - new Date(c.lastPurchase) < 30 * 86400000).length;
    const buyers = customers.filter((c) => c.purchases);
    const avg = buyers.length ? Math.round(buyers.reduce((s, c) => s + c.totalSpent, 0) / buyers.length) : 0;
    const k = (label, v, sub = '') => `<div class="card p-4"><div class="kpi-label">${label}</div><div class="kpi-value mt-1">${v}</div>${sub ? `<div class="mt-1 text-xs text-muted">${sub}</div>` : ''}</div>`;
    $('#cl-kpis', root).innerHTML = k('Clientes cadastrados', fmtInt(customers.length))
      + k('Aniversariantes do mês', fmtInt(birthdays), new Date().toLocaleDateString('pt-BR', { month: 'long' }))
      + k('Compraram nos últimos 30 dias', fmtInt(recent))
      + k('Gasto médio por cliente', formatBRL(avg), 'entre quem já comprou');
  }

  function render() {
    const t = filter.term.trim().toLowerCase();
    const digits = t.replace(/\D/g, '');
    const list = customers.filter((c) => {
      if (filter.view === 'aniversario' && !birthdayInfo(c.birthDate)?.thisMonth) return false;
      return !t || c.name.toLowerCase().includes(t) || (c.email ?? '').includes(t)
        || (digits.length >= 3 && ((c.cpf ?? '').includes(digits) || (c.phone ?? '').includes(digits)));
    });
    if (filter.view === 'aniversario') list.sort((a, b) => a.birthDate.slice(8) - b.birthDate.slice(8));

    $('#cl-rows', root).innerHTML = list.length ? list.map((c) => {
      const b = birthdayInfo(c.birthDate);
      const wa = whatsappLink(c.phone);
      return `<tr>
        <td class="font-medium"><button type="button" class="text-left hover:text-rose" data-history="${e(c.id)}">${e(c.name)}</button></td>
        <td class="whitespace-nowrap">${c.cpf ? e(formatCPF(c.cpf)) : '<span class="text-muted">—</span>'}</td>
        <td class="whitespace-nowrap">${c.phone ? `${e(formatPhone(c.phone))}${wa ? ` <a href="${e(wa)}" target="_blank" rel="noopener" class="badge badge-ok ml-1" title="Abrir WhatsApp">WhatsApp</a>` : ''}` : '<span class="text-muted">—</span>'}</td>
        <td class="max-w-[200px] truncate">${c.email ? `<a href="mailto:${e(c.email)}" class="hover:text-rose">${e(c.email)}</a>` : '<span class="text-muted">—</span>'}</td>
        <td class="whitespace-nowrap">${b ? `${e(b.label)} <span class="text-xs text-muted">(${b.age} anos)</span>${b.today ? ' <span class="badge badge-gold">🎂 Hoje!</span>' : b.thisMonth ? ' <span class="badge badge-rose">🎂 este mês</span>' : ''}` : '<span class="text-muted">—</span>'}</td>
        <td class="num">${c.purchases}</td>
        <td class="num font-semibold">${formatBRL(c.totalSpent)}</td>
        <td class="whitespace-nowrap text-muted">${c.lastPurchase ? fmtDate(c.lastPurchase) : '—'}</td>
        <td class="num"><div class="inline-flex gap-1.5">
          <button type="button" class="btn btn-sm btn-rose" data-history="${e(c.id)}">Compras</button>
          <button type="button" class="btn btn-sm" data-edit="${e(c.id)}">Editar</button>
        </div></td></tr>`;
    }).join('') : `<tr><td colspan="9"><div class="empty">${filter.view === 'aniversario' ? 'Nenhum aniversariante neste mês.' : 'Nenhum cliente encontrado.'}</div></td></tr>`;
  }

  async function openHistory(c) {
    const m = showModal({
      title: c.name,
      subtitle: `${c.purchases} compra(s) · ${formatBRL(c.totalSpent)} no total`,
      size: 'lg',
      body: '<div class="empty">Carregando compras…</div>',
      footer: '<button type="button" class="btn" data-close>Fechar</button><button type="button" class="btn btn-gold" data-sell>Nova venda para este cliente</button>',
    });
    m.el.querySelector('[data-sell]').addEventListener('click', () => {
      try { sessionStorage.setItem('ciboff-pdv-customer', JSON.stringify({ id: c.id, name: c.name, cpf: c.cpf })); } catch { /* sem storage: escolhe no PDV */ }
      ctx.navigate('vendas');
    });
    const sales = await api.customers.history(c.id);
    m.body.innerHTML = sales.length ? `
      <div class="overflow-x-auto"><table class="tbl">
        <thead><tr><th>Nº</th><th>Data</th><th>Peças</th><th class="num">Total</th><th>Situação</th><th></th></tr></thead>
        <tbody>${sales.map((s) => `<tr class="${s.status === 'cancelada' ? 'opacity-60' : ''}">
          <td class="font-semibold">#${String(s.number).padStart(6, '0')}</td>
          <td class="whitespace-nowrap text-muted">${fmtDateTime(s.createdAt)}</td>
          <td class="max-w-[260px] truncate" title="${e(s.items.map((i) => `${i.qty}× ${i.name} ${i.size}/${i.color}`).join(', '))}">${e(s.items.map((i) => `${i.name} (${i.size})`).join(', '))}</td>
          <td class="num font-semibold">${formatBRL(s.total)}</td>
          <td><span class="badge ${s.status === 'cancelada' ? 'badge-danger' : 'badge-ok'}">${s.status === 'cancelada' ? 'Cancelada' : 'Concluída'}</span></td>
          <td class="num"><button type="button" class="btn btn-sm" data-receipt="${e(s.id)}">Cupom</button></td></tr>`).join('')}</tbody>
      </table></div>
      ${c.notes ? `<p class="mt-3 rounded-xl bg-slate-50 p-3 text-sm dark:bg-slate-800/60"><b>Observações:</b> ${e(c.notes)}</p>` : ''}`
      : '<div class="empty">Este cliente ainda não tem compras.</div>';
    m.body.addEventListener('click', (ev) => {
      const b = ev.target.closest('[data-receipt]');
      if (!b) return;
      const html = renderReceipt(sales.find((s) => s.id === b.dataset.receipt), ctx.store);
      const r = showModal({
        title: 'Cupom de controle interno',
        size: 'md',
        body: `<div class="-mx-5 -my-4 bg-slate-100 p-4 dark:bg-slate-950"><div class="shadow-md">${html}</div></div>`,
        footer: '<button type="button" class="btn" data-close>Fechar</button><button type="button" class="btn btn-gold" data-print>Imprimir</button>',
      });
      r.el.querySelector('[data-print]').addEventListener('click', () => printReceipt(html));
    });
  }

  async function edit(c) {
    const result = await openCustomerForm(ctx, c);
    if (result) await load();
  }

  $('#new-customer', root).addEventListener('click', () => edit(null));
  $('#cl-search', root).addEventListener('input', debounce((ev) => { filter.term = ev.target.value; render(); }, 150));
  root.addEventListener('click', (ev) => {
    const view = ev.target.closest('[data-view]');
    const ed = ev.target.closest('[data-edit]');
    const hist = ev.target.closest('[data-history]');
    if (view) {
      filter.view = view.dataset.view;
      root.querySelectorAll('[data-view]').forEach((b) => b.classList.toggle('is-active', b === view));
      render();
    }
    if (ed) edit(customers.find((c) => c.id === ed.dataset.edit));
    if (hist) openHistory(customers.find((c) => c.id === hist.dataset.history));
  });

  await load();
}
