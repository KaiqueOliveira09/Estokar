// Financeiro: caixa do dia (abertura, sangria, suprimento, despesas, fechamento) e fluxo de caixa diário.
import { formatBRL, parseBRL } from '../../core/money.js';
import { toast } from '../../core/toast.js';
import { $, escapeHtml as e } from '../../core/dom.js';
import { showModal } from '../../core/modal.js';
import { fmtTime, fmtDate, dayKey, fromDayKey, periodRange } from '../../core/format.js';
import { CASH_TYPES, PAYMENT_METHODS } from '../../shared/constants.js';
import { openCashDialog } from '../../shared/cash-dialog.js';

const signed = (m) => CASH_TYPES[m.type].sign * m.amount;

export async function mount(root, ctx) {
  const { api } = ctx;
  let flowDays = '7d';

  root.innerHTML = `
  <div class="mx-auto max-w-7xl space-y-6 p-4 sm:p-6">
    <div class="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h2 class="font-display text-2xl font-semibold">Financeiro</h2>
        <p class="text-sm text-muted">Caixa do dia e fluxo de entradas e saídas.</p>
      </div>
      <div id="fin-actions" class="flex flex-wrap gap-2"></div>
    </div>
    <div id="fin-session"></div>
    <section class="space-y-3">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <h3 class="font-display text-xl font-semibold">Fluxo de caixa diário</h3>
        <div class="tabs">${[['7d', '7 dias'], ['30d', '30 dias'], ['mes', 'Este mês']].map(([k, l]) => `<button type="button" class="tab ${k === flowDays ? 'is-active' : ''}" data-flow="${k}">${l}</button>`).join('')}</div>
      </div>
      <div id="fin-flow"></div>
    </section>
  </div>`;

  async function loadSession() {
    const summary = await api.cash.summary();
    const actions = $('#fin-actions', root);
    const box = $('#fin-session', root);

    if (!summary) {
      actions.innerHTML = '<button type="button" class="btn btn-gold" data-open>Abrir caixa</button>';
      box.innerHTML = `
        <div class="card flex flex-col items-center gap-3 p-8 text-center">
          <div class="font-display text-xl">O caixa está fechado</div>
          <p class="max-w-md text-sm text-muted">Abra o caixa informando o fundo de troco para começar a vender e registrar movimentações.</p>
          <button type="button" class="btn btn-gold" data-open>Abrir caixa</button>
        </div>`;
      return;
    }

    const { session, expected, movements } = summary;
    const byMethod = Object.fromEntries(Object.keys(PAYMENT_METHODS).map((k) => [k, 0]));
    movements.filter((m) => m.type === 'venda' || m.type === 'estorno').forEach((m) => { byMethod[m.method] += signed(m); });
    const sales = Object.values(byMethod).reduce((s, v) => s + v, 0);
    const outs = movements.filter((m) => m.type === 'saida' || m.type === 'sangria').reduce((s, m) => s + m.amount, 0);

    actions.innerHTML = `
      <button type="button" class="btn" data-mov="suprimento">+ Suprimento</button>
      <button type="button" class="btn" data-mov="entrada">+ Entrada</button>
      <button type="button" class="btn" data-mov="saida">− Despesa</button>
      <button type="button" class="btn" data-mov="sangria">− Sangria</button>
      <button type="button" class="btn btn-gold" data-close-cash>Fechar caixa</button>`;

    box.innerHTML = `
      <div class="grid gap-4 lg:grid-cols-3">
        <div class="card relative overflow-hidden p-5">
          <div class="absolute inset-x-0 top-0 h-1" style="background:var(--gold-gradient)"></div>
          <div class="kpi-label">Dinheiro esperado na gaveta</div>
          <div class="kpi-value mt-1 text-gold">${formatBRL(expected)}</div>
          <div class="mt-2 text-xs text-muted">Aberto às ${fmtTime(session.openedAt)} · fundo de troco ${formatBRL(session.openingAmount)}</div>
        </div>
        <div class="card p-5">
          <div class="kpi-label">Vendas deste caixa</div>
          <div class="kpi-value mt-1">${formatBRL(sales)}</div>
          <ul class="mt-3 space-y-1 text-sm">
            ${Object.entries(byMethod).map(([k, v]) => `<li class="flex justify-between"><span class="text-muted">${PAYMENT_METHODS[k]}</span><span class="tabular-nums">${formatBRL(v)}</span></li>`).join('')}
          </ul>
        </div>
        <div class="card p-5">
          <div class="kpi-label">Saídas (despesas e sangrias)</div>
          <div class="kpi-value mt-1 text-rose">${formatBRL(outs)}</div>
          <p class="mt-2 text-xs text-muted">Pix e cartão não entram na gaveta: o esperado considera apenas dinheiro.</p>
        </div>
      </div>

      <div class="card mt-4 overflow-hidden">
        <div class="border-app border-b px-4 py-3 font-semibold">Movimentações do caixa atual</div>
        <div class="overflow-x-auto"><table class="tbl">
          <thead><tr><th>Hora</th><th>Tipo</th><th>Descrição</th><th>Forma</th><th class="num">Valor</th></tr></thead>
          <tbody>${movements.length ? movements.map((m) => `<tr>
            <td class="text-muted">${fmtTime(m.at)}</td>
            <td><span class="badge ${CASH_TYPES[m.type].sign > 0 ? 'badge-ok' : 'badge-rose'}">${CASH_TYPES[m.type].label}</span></td>
            <td>${e(m.description ?? '')}</td>
            <td class="text-muted">${e(PAYMENT_METHODS[m.method] ?? m.method)}</td>
            <td class="num font-semibold ${signed(m) > 0 ? '' : 'text-rose'}">${signed(m) > 0 ? '' : '− '}${formatBRL(m.amount)}</td>
          </tr>`).join('') : '<tr><td colspan="5"><div class="empty">Nenhuma movimentação ainda.</div></td></tr>'}</tbody>
        </table></div>
      </div>`;
    box.dataset.expected = expected;
  }

  async function loadFlow() {
    const range = periodRange(flowDays);
    const movs = await api.cash.flow(range);
    const days = new Map();
    for (const m of movs) {
      const k = dayKey(m.at);
      const d = days.get(k) ?? { in: 0, out: 0, sales: 0 };
      const v = signed(m);
      if (v > 0) d.in += v; else d.out -= v;
      if (m.type === 'venda') d.sales += m.amount;
      days.set(k, d);
    }
    const list = [...days].sort((a, b) => b[0].localeCompare(a[0]));
    const tot = list.reduce((s, [, d]) => ({ in: s.in + d.in, out: s.out + d.out }), { in: 0, out: 0 });

    $('#fin-flow', root).innerHTML = `
      <div class="card overflow-hidden"><div class="overflow-x-auto"><table class="tbl">
        <thead><tr><th>Dia</th><th class="num">Entradas</th><th class="num">Saídas</th><th class="num">Saldo do dia</th></tr></thead>
        <tbody>${list.length ? list.map(([k, d]) => `<tr>
          <td>${fromDayKey(k).toLocaleDateString('pt-BR', { weekday: 'short' })} · ${fmtDate(fromDayKey(k))}</td>
          <td class="num">${formatBRL(d.in)}</td>
          <td class="num text-rose">${d.out ? `− ${formatBRL(d.out)}` : formatBRL(0)}</td>
          <td class="num font-semibold">${formatBRL(d.in - d.out)}</td></tr>`).join('')
        : '<tr><td colspan="4"><div class="empty">Sem movimentações no período.</div></td></tr>'}</tbody>
        ${list.length ? `<tfoot><tr class="font-semibold"><td class="px-[.9rem] py-3">Total</td><td class="num px-[.9rem]">${formatBRL(tot.in)}</td><td class="num px-[.9rem] text-rose">− ${formatBRL(tot.out)}</td><td class="num px-[.9rem] text-gold">${formatBRL(tot.in - tot.out)}</td></tr></tfoot>` : ''}
      </table></div></div>
      <p class="mt-2 text-xs text-muted">Entradas incluem vendas em todas as formas de pagamento. Sangrias aparecem como saída (dinheiro retirado da gaveta).</p>`;
  }

  function openMovement(type) {
    const labels = {
      suprimento: ['Suprimento', 'Dinheiro colocado na gaveta (ex.: reforço de troco).'],
      entrada: ['Entrada avulsa', 'Recebimento que não é venda do PDV.'],
      saida: ['Despesa', 'Pagamento feito com dinheiro do caixa (ex.: embalagens, motoboy).'],
      sangria: ['Sangria', 'Retirada de dinheiro da gaveta (ex.: depósito no banco).'],
    };
    const [title, help] = labels[type];
    const m = showModal({
      title,
      subtitle: help,
      size: 'sm',
      body: `
        <form id="mov-form" class="space-y-3">
          <div><label class="label" for="mv-amount">Valor (R$) *</label>
            <input id="mv-amount" class="input text-right text-lg" inputmode="decimal" placeholder="0,00" required autofocus></div>
          <div><label class="label" for="mv-desc">Descrição *</label>
            <input id="mv-desc" class="input" required placeholder="${type === 'saida' ? 'Ex.: Sacolas e papel de seda' : 'Descreva o motivo'}"></div>
          ${type === 'entrada' || type === 'saida' ? `<div><label class="label" for="mv-method">Forma</label>
            <select id="mv-method" class="select">${Object.entries(PAYMENT_METHODS).map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select></div>` : ''}
        </form>`,
      footer: '<button type="button" class="btn" data-close>Cancelar</button><button type="submit" form="mov-form" class="btn btn-gold">Registrar</button>',
    });
    m.el.querySelector('form').addEventListener('submit', async (ev) => {
      ev.preventDefault();
      try {
        await api.cash.register({
          type,
          amount: parseBRL($('#mv-amount', m.body).value),
          description: $('#mv-desc', m.body).value.trim(),
          method: $('#mv-method', m.body)?.value ?? 'dinheiro',
        });
        m.close();
        toast(`${title} registrada`, 'success');
        await Promise.all([loadSession(), loadFlow()]);
      } catch (err) { toast(err.message, 'error'); }
    });
  }

  function openClose() {
    const expected = Number($('#fin-session', root).dataset.expected || 0);
    const m = showModal({
      title: 'Fechar caixa',
      subtitle: 'Conte o dinheiro da gaveta e informe o valor.',
      size: 'sm',
      body: `
        <form id="close-form" class="space-y-3">
          <div class="flex justify-between rounded-xl bg-slate-50 px-3 py-2 text-sm dark:bg-slate-800/60"><span>Esperado em dinheiro</span><b>${formatBRL(expected)}</b></div>
          <div><label class="label" for="cl-counted">Valor contado (R$) *</label>
            <input id="cl-counted" class="input text-right text-lg" inputmode="decimal" required autofocus placeholder="0,00"></div>
          <div id="cl-diff" class="text-sm"></div>
          <div><label class="label" for="cl-notes">Observações</label>
            <textarea id="cl-notes" class="textarea" rows="2"></textarea></div>
        </form>`,
      footer: '<button type="button" class="btn" data-close>Cancelar</button><button type="submit" form="close-form" class="btn btn-gold">Fechar caixa</button>',
    });
    const counted = $('#cl-counted', m.body);
    counted.addEventListener('input', () => {
      const diff = parseBRL(counted.value) - expected;
      $('#cl-diff', m.body).innerHTML = !counted.value ? '' : diff === 0
        ? '<span class="badge badge-ok">Caixa confere ✓</span>'
        : `<span class="badge ${diff > 0 ? 'badge-warn' : 'badge-danger'}">${diff > 0 ? 'Sobra' : 'Falta'} de ${formatBRL(Math.abs(diff))}</span>`;
    });
    m.el.querySelector('form').addEventListener('submit', async (ev) => {
      ev.preventDefault();
      try {
        const r = await api.cash.close({ counted: parseBRL(counted.value), notes: $('#cl-notes', m.body).value.trim() });
        m.close();
        ctx.setSession(null);
        toast(r.difference === 0 ? 'Caixa fechado. Tudo confere!' : `Caixa fechado com diferença de ${formatBRL(r.difference)}`, r.difference === 0 ? 'success' : 'warn', 6000);
        await Promise.all([loadSession(), loadFlow()]);
      } catch (err) { toast(err.message, 'error'); }
    });
  }

  root.addEventListener('click', async (ev) => {
    if (ev.target.closest('[data-open]')) {
      if (await openCashDialog(ctx)) await loadSession();
    }
    const mov = ev.target.closest('[data-mov]');
    if (mov) openMovement(mov.dataset.mov);
    if (ev.target.closest('[data-close-cash]')) openClose();
    const flow = ev.target.closest('[data-flow]');
    if (flow) {
      flowDays = flow.dataset.flow;
      root.querySelectorAll('[data-flow]').forEach((b) => b.classList.toggle('is-active', b === flow));
      loadFlow();
    }
  });

  await Promise.all([loadSession(), loadFlow()]);
}
