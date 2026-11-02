// Tela de Vendas / Frente de Caixa (PDV).
// UI e eventos ficam aqui; regras do carrinho em cart.js; dados via ctx.api; cupom em shared/receipt.js.
import { formatBRL, parseBRL } from '../../core/money.js';
import { toast } from '../../core/toast.js';
import { $, $$, escapeHtml as e, debounce, openModal, closeModal, topModal } from '../../core/dom.js';
import { renderReceipt, printReceipt } from '../../shared/receipt.js';
import { openCashDialog } from '../../shared/cash-dialog.js';
import { pickCustomer } from '../../shared/customer-picker.js';
import { formatCPF } from '../../shared/customer-utils.js';
import { createCart, PAYMENT_METHODS } from './cart.js';

// O carrinho vive fora do mount: a venda em andamento sobrevive à troca de tela
const cart = createCart();
const PDV_MODALS = ['variant-modal', 'receipt-modal'];

const TEMPLATE = `
<div class="grid grid-cols-1 lg:h-full lg:grid-cols-[minmax(0,1fr)_420px]">

  <!-- Busca e vitrine -->
  <section class="flex min-h-0 flex-col gap-3 p-4">
    <div class="relative">
      <svg class="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path stroke-linecap="round" d="m20 20-3.5-3.5"/></svg>
      <input id="search" type="search" autocomplete="off" placeholder="Buscar produto, SKU ou bipar código de barras…"
             class="input !h-12 !rounded-xl !pl-10 !pr-14 !text-base">
      <kbd class="absolute right-3 top-1/2 -translate-y-1/2 text-muted">F4</kbd>
    </div>
    <div id="result-info" class="text-xs text-muted"></div>
    <div id="product-grid" class="scroll-thin grid max-h-[60vh] min-h-[200px] flex-1 auto-rows-min grid-cols-2 gap-3 overflow-y-auto pb-2 sm:grid-cols-3 lg:max-h-none xl:grid-cols-4"></div>
  </section>

  <!-- Venda atual -->
  <aside class="app-surface border-app flex min-h-0 flex-col border-t lg:border-l lg:border-t-0">
    <div class="border-app flex items-center justify-between border-b px-4 py-3">
      <h2 class="font-display text-lg font-semibold">Venda atual <span id="cart-count" class="font-sans text-sm font-normal text-muted"></span></h2>
      <button id="clear-cart" type="button" class="btn btn-sm btn-danger !border-transparent">Limpar</button>
    </div>

    <div id="customer-box" class="border-app border-b px-4 py-2.5"></div>

    <ul id="cart-list" class="scroll-thin min-h-[120px] flex-1 divide-y divide-slate-100 overflow-y-auto dark:divide-slate-800"></ul>

    <div class="border-app space-y-3 border-t p-4">
      <div class="space-y-1 text-sm">
        <div class="flex justify-between"><span class="text-muted">Subtotal</span><span id="t-subtotal">R$ 0,00</span></div>
        <div class="flex items-center justify-between gap-3">
          <label for="discount" class="text-muted">Desconto</label>
          <input id="discount" type="text" inputmode="decimal" placeholder="0,00 ou 10%" class="input !h-8 !w-28 text-right">
        </div>
        <div class="flex items-baseline justify-between pt-1"><span class="font-medium">Total</span><span id="t-total" class="text-2xl font-bold tracking-tight">R$ 0,00</span></div>
      </div>

      <div>
        <div class="mb-2 grid grid-cols-4 gap-1.5" id="method-buttons">
          ${Object.entries({ dinheiro: 'Dinheiro', pix: 'Pix', debito: 'Débito', credito: 'Crédito' })
            .map(([k, l]) => `<button type="button" data-method="${k}" class="chip justify-center !px-1">${l}</button>`).join('')}
        </div>
        <div class="flex gap-2">
          <input id="pay-amount" type="text" inputmode="decimal" placeholder="Valor recebido" class="input min-w-0 flex-1 text-right">
          <button id="add-payment" type="button" class="btn">Adicionar</button>
        </div>
        <div id="quick-cash" class="mt-2 flex gap-1.5">
          ${['1000:+10', '2000:+20', '5000:+50', '10000:+100', 'exact:Exato']
            .map((x) => { const [v, l] = x.split(':'); return `<button type="button" data-add="${v}" class="btn btn-sm btn-rose flex-1 !px-1">${l}</button>`; }).join('')}
        </div>
        <ul id="payment-list" class="mt-2 space-y-1 text-sm"></ul>
      </div>

      <div class="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2 text-sm dark:bg-slate-800/60">
        <span id="balance-label" class="text-muted">A receber</span>
        <span id="balance-value" class="text-lg font-semibold">R$ 0,00</span>
      </div>

      <button id="finalize" type="button" disabled class="btn btn-gold btn-lg w-full">
        Finalizar venda <kbd>F2</kbd>
      </button>
    </div>
  </aside>
</div>

<!-- Seleção de tamanho / cor -->
<div id="variant-modal" class="fixed inset-0 z-50 hidden items-end justify-center bg-black/40 p-0 backdrop-blur-sm sm:items-center sm:p-4" data-pdv-modal>
  <div class="app-surface w-full max-w-md rounded-t-2xl p-5 shadow-2xl sm:rounded-2xl">
    <div class="mb-4 flex items-start justify-between gap-3">
      <div>
        <h3 id="vm-name" class="font-display text-lg font-semibold"></h3>
        <p id="vm-meta" class="text-sm text-muted"></p>
      </div>
      <button type="button" data-close class="icon-btn -mr-2 -mt-1" aria-label="Fechar">
        <svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" d="M6 6l12 12M18 6 6 18"/></svg>
      </button>
    </div>
    <div class="label uppercase tracking-wide">Tamanho</div>
    <div id="vm-sizes" class="mb-4 flex flex-wrap gap-2"></div>
    <div class="label uppercase tracking-wide">Cor</div>
    <div id="vm-colors" class="mb-4 flex flex-wrap gap-2"></div>
    <div id="vm-variant-info" class="mb-4 min-h-[48px] rounded-xl bg-slate-50 px-3 py-2 text-sm dark:bg-slate-800/60"></div>
    <div class="flex items-center gap-3">
      <div class="border-app flex items-center rounded-xl border">
        <button type="button" id="vm-minus" class="h-10 w-10 text-lg" aria-label="Diminuir">−</button>
        <input id="vm-qty" type="number" min="1" value="1" class="h-10 w-12 bg-transparent text-center outline-none" aria-label="Quantidade">
        <button type="button" id="vm-plus" class="h-10 w-10 text-lg" aria-label="Aumentar">+</button>
      </div>
      <button id="vm-add" type="button" disabled class="btn btn-gold flex-1">Adicionar à venda</button>
    </div>
  </div>
</div>

<!-- Cupom de controle interno -->
<div id="receipt-modal" class="fixed inset-0 z-50 hidden items-center justify-center bg-black/50 p-4 backdrop-blur-sm" data-pdv-modal>
  <div class="app-surface flex max-h-full w-full max-w-md flex-col rounded-2xl shadow-2xl">
    <div class="border-app flex items-center justify-between border-b px-5 py-3">
      <div>
        <h3 class="font-display text-lg font-semibold text-gold">Venda finalizada ✓</h3>
        <p id="receipt-summary" class="text-xs text-muted"></p>
      </div>
      <button type="button" data-close class="icon-btn -mr-2" aria-label="Fechar">
        <svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" d="M6 6l12 12M18 6 6 18"/></svg>
      </button>
    </div>
    <div class="scroll-thin overflow-y-auto bg-slate-100 p-4 dark:bg-slate-950">
      <div id="receipt-preview" class="shadow-md"></div>
    </div>
    <div class="border-app flex gap-2 border-t p-4">
      <button id="print-receipt" type="button" class="btn flex-1">Imprimir <kbd>P</kbd></button>
      <button id="new-sale" type="button" class="btn btn-gold flex-1">Nova venda <kbd>Enter</kbd></button>
    </div>
  </div>
</div>`;

export async function mount(root, ctx) {
  root.innerHTML = TEMPLATE;
  root.classList.add('lg:overflow-hidden');

  const { api } = ctx;
  const ui = {
    search: $('#search', root),
    resultInfo: $('#result-info', root),
    grid: $('#product-grid', root),
    cartList: $('#cart-list', root),
    customerBox: $('#customer-box', root),
    cartCount: $('#cart-count', root),
    clearCart: $('#clear-cart', root),
    subtotal: $('#t-subtotal', root),
    discount: $('#discount', root),
    total: $('#t-total', root),
    payAmount: $('#pay-amount', root),
    quickCash: $('#quick-cash', root),
    paymentList: $('#payment-list', root),
    balanceLabel: $('#balance-label', root),
    balanceValue: $('#balance-value', root),
    finalize: $('#finalize', root),
  };

  const state = {
    products: [],
    method: 'dinheiro',
    busy: false,
    lastReceiptHtml: '',
    picker: { product: null, size: null, color: null },
  };

  // -------------------------------------------------------------------------
  // Busca / vitrine
  // -------------------------------------------------------------------------
  let searchSeq = 0;
  async function runSearch(term) {
    const seq = ++searchSeq;
    try {
      const products = await api.catalog.search(term);
      if (seq !== searchSeq) return; // descarta respostas fora de ordem
      state.products = products;
      renderGrid();
    } catch (err) {
      toast(`Falha na busca: ${err.message}`, 'error');
    }
  }

  // Enter no campo de busca: tenta código exato (leitor de código de barras)
  async function handleCodeEntry(raw) {
    const code = raw.trim();
    if (!code) return;
    const found = await api.catalog.findByCode(code);
    if (found) {
      guard(() => {
        cart.addItem(found.product, found.variant, 1);
        toast(`${found.product.name} · ${found.variant.size}/${found.variant.color} adicionado`, 'success', 1800);
      });
      ui.search.value = '';
      runSearch('');
      return;
    }
    if (state.products.length === 1) openPicker(state.products[0]);
  }

  function renderGrid() {
    const { products } = state;
    ui.resultInfo.textContent = `${products.length} produto(s)`;
    if (!products.length) {
      ui.grid.innerHTML = '<div class="empty col-span-full">Nenhum produto encontrado.</div>';
      return;
    }
    ui.grid.innerHTML = products.map((p) => {
      const available = p.variants.filter((v) => v.stock > 0);
      const sizes = [...new Set(available.map((v) => v.size))];
      const colors = [...new Map(available.map((v) => [v.color, v.colorHex])).entries()];
      const low = p.variants.some((v) => v.stock > 0 && v.stock <= v.minStock);
      const out = p.totalStock === 0;
      return `
        <button type="button" data-product-id="${e(p.id)}" ${out ? 'disabled' : ''}
          class="card group flex flex-col p-3 text-left transition hover:-translate-y-0.5 hover:border-brand-400 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0">
          <div class="mb-2 flex items-start justify-between gap-2">
            <span class="truncate text-[11px] font-medium uppercase tracking-wide text-muted">${e(p.category ?? '')}</span>
            ${out ? '<span class="badge">ESGOTADO</span>' : low ? '<span class="badge badge-warn">BAIXO</span>' : ''}
          </div>
          <div class="line-clamp-2 text-sm font-medium leading-snug">${e(p.name)}</div>
          <div class="mt-0.5 truncate text-xs text-muted">${e(p.brand ?? '')} · ${e(p.reference ?? '')}</div>
          <div class="mt-2 flex flex-wrap gap-1">
            ${sizes.map((s) => `<span class="border-app rounded border px-1.5 text-[11px]">${e(s)}</span>`).join('')}
          </div>
          <div class="mt-auto flex items-end justify-between pt-3">
            <span class="font-semibold text-gold">${formatBRL(p.minPrice)}</span>
            <span class="flex -space-x-1">
              ${colors.map(([name, hex]) => `<span title="${e(name)}" class="h-4 w-4 rounded-full ring-2 ring-white dark:ring-slate-900" style="background:${e(hex ?? '#ccc')}"></span>`).join('')}
            </span>
          </div>
          <div class="mt-1 text-[11px] text-muted">${p.totalStock} em estoque</div>
        </button>`;
    }).join('');
  }

  // -------------------------------------------------------------------------
  // Seletor de tamanho / cor
  // -------------------------------------------------------------------------
  const availableOf = (v) => v.stock - cart.qtyOf(v.id);
  const pickerQty = () => Math.max(1, parseInt($('#vm-qty', root).value, 10) || 1);
  const setPickerQty = (n) => { $('#vm-qty', root).value = Math.max(1, n); renderPicker(); };

  function openPicker(product) {
    const withStock = product.variants.filter((v) => availableOf(v) > 0);
    if (!withStock.length) return toast('Todas as variações deste produto já estão na venda ou esgotadas', 'warn');
    if (product.variants.length === 1) return guard(() => cart.addItem(product, product.variants[0], 1));

    const sizes = new Set(withStock.map((v) => v.size));
    const colors = new Set(withStock.map((v) => v.color));
    state.picker = {
      product,
      size: sizes.size === 1 ? [...sizes][0] : null,
      color: colors.size === 1 ? [...colors][0] : null,
    };
    $('#vm-qty', root).value = 1;
    $('#vm-name', root).textContent = product.name;
    $('#vm-meta', root).textContent = [product.brand, product.reference].filter(Boolean).join(' · ');
    renderPicker();
    openModal('variant-modal');
  }

  function selectedVariant() {
    const { product, size, color } = state.picker;
    if (!product || !size || !color) return null;
    return product.variants.find((v) => v.size === size && v.color === color) ?? null;
  }

  function renderPicker() {
    const { product, size, color } = state.picker;
    if (!product) return;
    const sizes = [...new Map(product.variants.map((v) => [v.size, v.sizeOrder])).entries()].sort((a, b) => a[1] - b[1]).map(([s]) => s);
    const colors = [...new Map(product.variants.map((v) => [v.color, v.colorHex])).entries()];
    const sizeEnabled = (s) => product.variants.some((v) => v.size === s && (!color || v.color === color) && availableOf(v) > 0);
    const colorEnabled = (c) => product.variants.some((v) => v.color === c && (!size || v.size === size) && availableOf(v) > 0);

    $('#vm-sizes', root).innerHTML = sizes.map((s) => `
      <button type="button" data-size="${e(s)}" ${sizeEnabled(s) ? '' : 'disabled'} class="chip min-w-[48px] justify-center ${s === size ? 'is-active' : ''}">${e(s)}</button>`).join('');
    $('#vm-colors', root).innerHTML = colors.map(([c, hex]) => `
      <button type="button" data-color="${e(c)}" ${colorEnabled(c) ? '' : 'disabled'} class="chip ${c === color ? 'is-active' : ''}">
        <span class="h-3.5 w-3.5 rounded-full ring-1 ring-black/10" style="background:${e(hex ?? '#ccc')}"></span>${e(c)}</button>`).join('');

    const v = selectedVariant();
    const info = $('#vm-variant-info', root);
    const addBtn = $('#vm-add', root);
    const qty = pickerQty();
    if (!v) {
      const missing = [!size && 'o tamanho', !color && 'a cor'].filter(Boolean).join(' e ');
      info.innerHTML = `<span class="text-muted">Selecione ${missing}.</span>`;
      addBtn.disabled = true;
      addBtn.textContent = 'Adicionar à venda';
      return;
    }
    const avail = availableOf(v);
    const inCart = cart.qtyOf(v.id);
    info.innerHTML = `
      <div class="flex justify-between"><span class="font-semibold text-gold">${formatBRL(v.price)}</span>
        <span class="badge ${avail <= v.minStock ? 'badge-warn' : 'badge-ok'}">${avail} disponível(is)</span></div>
      <div class="mt-0.5 text-xs text-muted">SKU ${e(v.sku)}${v.barcode ? ` · EAN ${e(v.barcode)}` : ''}${inCart ? ` · ${inCart} já na venda` : ''}</div>`;
    addBtn.disabled = avail < qty;
    addBtn.textContent = avail < qty ? 'Quantidade indisponível' : `Adicionar · ${formatBRL(v.price * qty)}`;
  }

  function addFromPicker() {
    const v = selectedVariant();
    if (!v || $('#vm-add', root).disabled) return;
    guard(() => {
      cart.addItem(state.picker.product, v, pickerQty());
      closeModal('variant-modal');
      ui.search.focus();
    });
  }

  // -------------------------------------------------------------------------
  // Carrinho, desconto e pagamentos
  // -------------------------------------------------------------------------
  function guard(fn) {
    try { fn(); } catch (err) { toast(err.message, 'warn'); }
  }

  function applyDiscount() {
    const raw = ui.discount.value.trim();
    const { subtotal } = cart.totals();
    let value = raw.endsWith('%')
      ? Math.round(subtotal * Math.min(100, Math.max(0, parseFloat(raw.replace(',', '.')) || 0)) / 100)
      : parseBRL(raw);
    if (value > subtotal) {
      toast('Desconto maior que o subtotal', 'warn');
      value = subtotal;
    }
    const hadPayments = cart.getState().payments.length > 0;
    cart.setDiscount(value);
    if (hadPayments) toast('Pagamentos removidos: o total mudou', 'info');
  }

  function selectMethod(method) {
    state.method = method;
    $$('[data-method]', root).forEach((b) => b.classList.toggle('is-active', b.dataset.method === method));
    ui.quickCash.classList.toggle('hidden', method !== 'dinheiro');
    ui.payAmount.placeholder = method === 'dinheiro' ? 'Valor recebido' : 'Valor (vazio = restante)';
  }

  function addPaymentFromInput() {
    const amount = parseBRL(ui.payAmount.value) || cart.totals().remaining;
    guard(() => {
      cart.addPayment(state.method, amount);
      ui.payAmount.value = '';
    });
  }

  function renderCustomer(customer) {
    ui.customerBox.innerHTML = customer ? `
      <div class="flex items-center gap-3">
        <span class="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-brand-100 text-sm font-semibold text-brand-700 dark:bg-brand-500/20 dark:text-brand-200">${e(customer.name.trim()[0]?.toUpperCase() ?? '?')}</span>
        <div class="min-w-0 flex-1">
          <div class="truncate text-sm font-semibold">${e(customer.name)}</div>
          <div class="text-xs text-muted">${customer.cpf ? `CPF ${e(formatCPF(customer.cpf))}` : 'Cliente identificado'}</div>
        </div>
        <button type="button" data-customer="pick" class="btn btn-sm">Trocar</button>
        <button type="button" data-customer="clear" class="icon-btn !h-8 !w-8" title="Remover cliente" aria-label="Remover cliente">✕</button>
      </div>`
      : `<button type="button" data-customer="pick" class="flex w-full items-center justify-between gap-2 rounded-xl border border-dashed border-slate-300 px-3 py-2 text-sm text-muted transition hover:border-brand-400 hover:text-rose dark:border-slate-700">
          <span>👤 Identificar cliente <span class="text-xs">(opcional)</span></span><kbd>F3</kbd></button>`;
  }

  async function chooseCustomer() {
    const c = await pickCustomer(ctx);
    if (c) {
      cart.setCustomer(c);
      toast(`Cliente: ${c.name}`, 'success', 1800);
    }
    ui.search.focus();
  }

  function renderCart(cartState, t) {
    const { items, payments } = cartState;
    renderCustomer(cartState.customer);
    ui.cartCount.textContent = t.count ? `(${t.count} ${t.count === 1 ? 'peça' : 'peças'})` : '';
    ui.clearCart.disabled = !items.length;

    ui.cartList.innerHTML = items.length ? items.map((i) => `
      <li class="flex gap-3 px-4 py-3">
        <span class="mt-1 h-3 w-3 shrink-0 rounded-full ring-1 ring-black/10" style="background:${e(i.colorHex ?? '#ccc')}"></span>
        <div class="min-w-0 flex-1">
          <div class="truncate text-sm font-medium">${e(i.name)}</div>
          <div class="text-xs text-muted">Tam <b>${e(i.size)}</b> · ${e(i.color ?? '')} · ${e(i.sku)}</div>
          <div class="mt-2 flex items-center gap-2">
            <div class="border-app flex items-center rounded-lg border">
              <button type="button" data-action="dec" data-id="${e(i.variantId)}" class="h-7 w-7 text-muted" aria-label="Diminuir">−</button>
              <span class="w-7 text-center text-sm">${i.qty}</span>
              <button type="button" data-action="inc" data-id="${e(i.variantId)}" class="h-7 w-7 text-muted" aria-label="Aumentar">+</button>
            </div>
            <span class="text-xs text-muted">× ${formatBRL(i.unitPrice)}</span>
          </div>
        </div>
        <div class="flex flex-col items-end justify-between">
          <button type="button" data-action="remove" data-id="${e(i.variantId)}" class="text-xs text-muted hover:text-rose-600" title="Remover" aria-label="Remover item">✕</button>
          <span class="text-sm font-semibold">${formatBRL(i.unitPrice * i.qty)}</span>
        </div>
      </li>`).join('')
      : `<li class="flex h-full flex-col items-center justify-center gap-1 p-8 text-center text-sm text-muted">
           <span class="font-display text-base">Nenhuma peça na venda</span><span class="text-xs">Busque ou bipe um produto para começar</span></li>`;

    if (!items.length && ui.discount.value) ui.discount.value = '';
    ui.subtotal.textContent = formatBRL(t.subtotal);
    ui.total.textContent = formatBRL(t.total);

    ui.paymentList.innerHTML = payments.map((p) => `
      <li class="flex items-center justify-between rounded-lg bg-slate-50 px-2.5 py-1.5 dark:bg-slate-800/60">
        <span>${e(PAYMENT_METHODS[p.method])}</span>
        <span class="flex items-center gap-2"><span class="font-medium">${formatBRL(p.amount)}</span>
          <button type="button" data-remove-payment="${e(p.id)}" class="text-muted hover:text-rose-600" title="Remover" aria-label="Remover pagamento">✕</button></span>
      </li>`).join('');

    if (t.change > 0) {
      ui.balanceLabel.textContent = 'Troco';
      ui.balanceValue.textContent = formatBRL(t.change);
      ui.balanceValue.className = 'text-lg font-semibold text-emerald-700 dark:text-emerald-400';
    } else if (t.remaining > 0 && payments.length) {
      ui.balanceLabel.textContent = 'Falta pagar';
      ui.balanceValue.textContent = formatBRL(t.remaining);
      ui.balanceValue.className = 'text-lg font-semibold text-rose-700 dark:text-rose-400';
    } else {
      ui.balanceLabel.textContent = payments.length ? 'Pago' : 'A receber';
      ui.balanceValue.textContent = formatBRL(payments.length ? t.paid : t.total);
      ui.balanceValue.className = 'text-lg font-semibold';
    }
    ui.finalize.disabled = !items.length || state.busy;
  }

  // -------------------------------------------------------------------------
  // Finalização
  // -------------------------------------------------------------------------
  async function finalizeSale() {
    if (state.busy) return;
    const { items } = cart.getState();
    if (!items.length) return toast('Adicione ao menos uma peça', 'warn');
    if (!ctx.session && !(await openCashDialog(ctx))) return;

    if (parseBRL(ui.payAmount.value) > 0) {
      addPaymentFromInput();
      if (ui.payAmount.value) return; // falhou na validação
    }
    if (!cart.getState().payments.length) guard(() => cart.addPayment(state.method, cart.totals().remaining));

    const t = cart.totals();
    if (t.remaining > 0) return toast(`Falta receber ${formatBRL(t.remaining)}`, 'warn');
    if (t.change > t.cashPaid) return toast('Troco só pode ser dado sobre pagamento em dinheiro', 'warn');

    setBusy(true);
    try {
      const { payments, discount, customer } = cart.getState();
      const saleId = await api.sales.finalize({
        items: items.map((i) => ({ variantId: i.variantId, quantity: i.qty })),
        payments: payments.map(({ method, amount }) => ({ method, amount })),
        discount,
        customerId: customer?.id ?? null,
      });
      const receipt = await api.sales.getReceipt(saleId);
      showReceipt(receipt);
      cart.reset();
      ui.discount.value = '';
      runSearch(ui.search.value);
    } catch (err) {
      toast(err.message, 'error', 6000);
    } finally {
      setBusy(false);
    }
  }

  function setBusy(busy) {
    state.busy = busy;
    ui.finalize.innerHTML = busy ? 'Registrando…' : 'Finalizar venda <kbd>F2</kbd>';
    renderCart(cart.getState(), cart.totals());
  }

  function showReceipt(sale) {
    state.lastReceiptHtml = renderReceipt(sale, ctx.store);
    $('#receipt-preview', root).innerHTML = state.lastReceiptHtml;
    $('#receipt-summary', root).textContent = `Venda nº ${sale.number} · ${formatBRL(sale.total)}${sale.change ? ` · Troco ${formatBRL(sale.change)}` : ''}${sale.customer?.name ? ` · ${sale.customer.name}` : ''}`;
    openModal('receipt-modal');
    $('#new-sale', root).focus();
  }

  function startNewSale() {
    closeModal('receipt-modal');
    ui.search.value = '';
    runSearch('');
    ui.search.focus();
  }

  function dismissModal(id) {
    if (id === 'receipt-modal') return startNewSale();
    closeModal(id);
    ui.search.focus();
  }

  // -------------------------------------------------------------------------
  // Eventos
  // -------------------------------------------------------------------------
  const debouncedSearch = debounce((t) => runSearch(t), 250);
  ui.search.addEventListener('input', () => debouncedSearch(ui.search.value));
  ui.search.addEventListener('keydown', (ev) => {
    if (ev.key !== 'Enter') return;
    ev.preventDefault();
    handleCodeEntry(ui.search.value);
  });

  ui.grid.addEventListener('click', (ev) => {
    const card = ev.target.closest('[data-product-id]');
    const product = card && state.products.find((p) => p.id === card.dataset.productId);
    if (product) openPicker(product);
  });

  ui.cartList.addEventListener('click', (ev) => {
    const btn = ev.target.closest('[data-action]');
    if (!btn) return;
    const { action, id } = btn.dataset;
    const item = cart.getState().items.find((i) => i.variantId === id);
    if (!item) return;
    guard(() => {
      if (action === 'inc') cart.setQty(id, item.qty + 1);
      if (action === 'dec') cart.setQty(id, item.qty - 1);
      if (action === 'remove') cart.removeItem(id);
    });
  });

  ui.clearCart.addEventListener('click', () => {
    if (cart.getState().items.length && confirm('Remover todas as peças da venda?')) cart.reset();
    ui.discount.value = '';
  });

  ui.discount.addEventListener('change', applyDiscount);
  ui.discount.addEventListener('keydown', (ev) => ev.key === 'Enter' && applyDiscount());

  $('#method-buttons', root).addEventListener('click', (ev) => {
    const btn = ev.target.closest('[data-method]');
    if (btn) selectMethod(btn.dataset.method);
  });

  $('#add-payment', root).addEventListener('click', addPaymentFromInput);
  ui.payAmount.addEventListener('keydown', (ev) => {
    if (ev.key !== 'Enter') return;
    ev.preventDefault();
    if (ui.payAmount.value.trim()) addPaymentFromInput();
    else finalizeSale();
  });

  ui.quickCash.addEventListener('click', (ev) => {
    const btn = ev.target.closest('[data-add]');
    if (!btn) return;
    const exact = btn.dataset.add === 'exact';
    const value = exact ? cart.totals().remaining : parseBRL(ui.payAmount.value) + Number(btn.dataset.add);
    ui.payAmount.value = formatBRL(value).replace('R$', '').trim();
    ui.payAmount.focus();
  });

  ui.paymentList.addEventListener('click', (ev) => {
    const btn = ev.target.closest('[data-remove-payment]');
    if (btn) cart.removePayment(btn.dataset.removePayment);
  });

  ui.finalize.addEventListener('click', finalizeSale);

  ui.customerBox.addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-customer]');
    if (!b) return;
    if (b.dataset.customer === 'clear') cart.setCustomer(null);
    else chooseCustomer();
  });

  $('#vm-sizes', root).addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-size]');
    if (!b || b.disabled) return;
    state.picker.size = state.picker.size === b.dataset.size ? null : b.dataset.size;
    renderPicker();
  });
  $('#vm-colors', root).addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-color]');
    if (!b || b.disabled) return;
    state.picker.color = state.picker.color === b.dataset.color ? null : b.dataset.color;
    renderPicker();
  });
  $('#vm-minus', root).addEventListener('click', () => setPickerQty(pickerQty() - 1));
  $('#vm-plus', root).addEventListener('click', () => setPickerQty(pickerQty() + 1));
  $('#vm-qty', root).addEventListener('input', renderPicker);
  $('#vm-add', root).addEventListener('click', addFromPicker);

  $('#print-receipt', root).addEventListener('click', () => printReceipt(state.lastReceiptHtml));
  $('#new-sale', root).addEventListener('click', startNewSale);

  $$('[data-pdv-modal]', root).forEach((modal) => {
    modal.addEventListener('click', (ev) => {
      if (ev.target === modal || ev.target.closest('[data-close]')) dismissModal(modal.id);
    });
  });

  function onKeydown(ev) {
    const modal = topModal();
    if (modal && !PDV_MODALS.includes(modal)) return; // outra janela (ex.: abrir caixa) está por cima
    if (ev.key === 'Escape' && modal) { ev.preventDefault(); dismissModal(modal); return; }
    if (modal === 'receipt-modal') {
      if (ev.key === 'Enter') { ev.preventDefault(); startNewSale(); }
      if (ev.key.toLowerCase() === 'p') { ev.preventDefault(); printReceipt(state.lastReceiptHtml); }
      return;
    }
    if (modal === 'variant-modal' && ev.key === 'Enter') { ev.preventDefault(); addFromPicker(); return; }
    if (modal) return;
    if (ev.key === 'F2') { ev.preventDefault(); finalizeSale(); }
    if (ev.key === 'F4') { ev.preventDefault(); ui.search.select(); ui.search.focus(); }
    if (ev.key === 'F3') { ev.preventDefault(); chooseCustomer(); }
  }
  document.addEventListener('keydown', onKeydown);

  // "Nova venda para este cliente" na aba Clientes
  try {
    const pending = sessionStorage.getItem('ciboff-pdv-customer');
    if (pending) {
      sessionStorage.removeItem('ciboff-pdv-customer');
      cart.setCustomer(JSON.parse(pending));
    }
  } catch { /* sem storage */ }

  const unsubscribe = cart.subscribe(renderCart);
  renderCart(cart.getState(), cart.totals());
  selectMethod('dinheiro');
  await runSearch('');
  ui.search.focus();

  if (!ctx.session) openCashDialog(ctx).then(() => ui.search.focus());

  // Limpeza ao sair da tela
  return () => {
    document.removeEventListener('keydown', onKeydown);
    unsubscribe();
    PDV_MODALS.forEach((id) => closeModal(id));
    root.classList.remove('lg:overflow-hidden');
  };
}
