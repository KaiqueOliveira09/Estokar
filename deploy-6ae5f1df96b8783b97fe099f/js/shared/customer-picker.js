// Janela "Identificar cliente" do PDV: busca por nome/CPF/telefone ou cadastra na hora.
import { showModal } from '../core/modal.js';
import { $, escapeHtml as e, debounce } from '../core/dom.js';
import { formatCPF, formatPhone, onlyDigits } from './customer-utils.js';
import { openCustomerForm } from './customer-form.js';

export function pickCustomer(ctx) {
  return new Promise((resolve) => {
    let chosen = null;
    let list = [];
    let goToForm = false;
    const m = showModal({
      title: 'Identificar cliente',
      subtitle: 'O nome aparece no cupom e a compra entra no histórico do cliente.',
      body: `
        <input id="cp-search" type="search" class="input" autocomplete="off" autofocus placeholder="Buscar por nome, CPF ou telefone…">
        <ul id="cp-results" class="mt-3 max-h-80 space-y-1 overflow-y-auto"></ul>`,
      footer: '<button type="button" class="btn" data-close>Cancelar</button><button type="button" class="btn btn-gold" data-new>+ Cadastrar novo cliente</button>',
      onClose: async () => {
        if (!goToForm) return resolve(chosen);
        const term = $('#cp-search', m.body).value.trim();
        const digits = onlyDigits(term);
        const initial = digits.length >= 10 && digits.length !== 11 ? { phone: digits } : digits.length === 11 ? { cpf: digits } : { name: term };
        const created = await openCustomerForm(ctx, null, { initial });
        resolve(created?.id ? created : null);
      },
    });

    const results = $('#cp-results', m.body);
    const search = $('#cp-search', m.body);

    async function run() {
      list = await ctx.api.customers.search(search.value.trim());
      results.innerHTML = list.length ? list.map((c) => `
        <li><button type="button" data-id="${e(c.id)}" class="flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-slate-50 dark:hover:bg-slate-800/60">
          <span class="min-w-0"><span class="block truncate font-medium">${e(c.name)}</span>
            <span class="text-xs text-muted">${e([c.cpf && formatCPF(c.cpf), c.phone && formatPhone(c.phone)].filter(Boolean).join(' · ') || 'sem CPF/telefone')}</span></span>
          <span class="text-gold">Selecionar →</span>
        </button></li>`).join('')
        : `<li class="empty">Nenhum cliente encontrado.${search.value ? '<br><span class="text-xs">Use “Cadastrar novo cliente”.</span>' : ''}</li>`;
    }

    search.addEventListener('input', debounce(run, 200));
    search.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter' && list.length === 1) { ev.preventDefault(); chosen = list[0]; m.close(); }
    });
    results.addEventListener('click', (ev) => {
      const b = ev.target.closest('[data-id]');
      if (!b) return;
      chosen = list.find((c) => c.id === b.dataset.id);
      m.close();
    });
    m.el.querySelector('[data-new]').addEventListener('click', () => { goToForm = true; m.close(); });
    run();
  });
}
