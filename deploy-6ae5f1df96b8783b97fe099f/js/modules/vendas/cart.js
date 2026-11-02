// Estado da venda em andamento. Sem DOM: fácil de testar e reaproveitar.
// Valores em centavos.

import { PAYMENT_METHODS } from '../../shared/constants.js';

export { PAYMENT_METHODS };

const emptyState = () => ({ items: [], payments: [], discount: 0, customer: null });

export function createCart() {
  let state = emptyState();
  const listeners = new Set();
  const emit = () => listeners.forEach((fn) => fn(state, totals()));

  const findItem = (variantId) => state.items.find((i) => i.variantId === variantId);
  const qtyOf = (variantId) => findItem(variantId)?.qty ?? 0;

  function totals() {
    const subtotal = state.items.reduce((s, i) => s + i.unitPrice * i.qty, 0);
    const discount = Math.min(state.discount, subtotal);
    const total = subtotal - discount;
    const paid = state.payments.reduce((s, p) => s + p.amount, 0);
    const cashPaid = state.payments.filter((p) => p.method === 'dinheiro').reduce((s, p) => s + p.amount, 0);
    const remaining = Math.max(total - paid, 0);
    const change = Math.max(paid - total, 0);
    const count = state.items.reduce((s, i) => s + i.qty, 0);
    return { subtotal, discount, total, paid, cashPaid, remaining, change, count };
  }

  // Pagamentos deixam de valer se o total mudar (evita troco errado)
  function invalidatePayments() {
    if (state.payments.length) state.payments = [];
  }

  return {
    getState: () => state,
    totals,
    qtyOf,

    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },

    addItem(product, variant, qty = 1) {
      if (qty <= 0) return;
      const current = qtyOf(variant.id);
      if (current + qty > variant.stock) {
        throw new Error(`Estoque insuficiente para ${product.name} (${variant.size}/${variant.color}). Disponível: ${variant.stock - current}`);
      }
      const existing = findItem(variant.id);
      if (existing) {
        existing.qty += qty;
      } else {
        state.items.push({
          variantId: variant.id,
          productId: product.id,
          name: product.name,
          size: variant.size,
          color: variant.color,
          colorHex: variant.colorHex,
          sku: variant.sku,
          unitPrice: variant.price,
          stock: variant.stock,
          qty,
        });
      }
      invalidatePayments();
      emit();
    },

    setQty(variantId, qty) {
      const item = findItem(variantId);
      if (!item) return;
      if (qty <= 0) return this.removeItem(variantId);
      if (qty > item.stock) throw new Error(`Apenas ${item.stock} unidade(s) em estoque`);
      item.qty = qty;
      invalidatePayments();
      emit();
    },

    removeItem(variantId) {
      state.items = state.items.filter((i) => i.variantId !== variantId);
      invalidatePayments();
      emit();
    },

    setDiscount(cents) {
      state.discount = Math.max(0, Math.round(cents) || 0);
      invalidatePayments();
      emit();
    },

    addPayment(method, amount) {
      if (!PAYMENT_METHODS[method]) throw new Error('Forma de pagamento inválida');
      if (!(amount > 0)) throw new Error('Informe um valor maior que zero');
      const { remaining } = totals();
      if (remaining <= 0) throw new Error('A venda já está totalmente paga');
      // Só dinheiro pode exceder o restante (gera troco)
      if (method !== 'dinheiro' && amount > remaining) {
        throw new Error(`${PAYMENT_METHODS[method]} não pode exceder o valor restante`);
      }
      state.payments.push({ id: crypto.randomUUID(), method, amount });
      emit();
    },

    // Cliente identificado (opcional): sai no cupom e entra no histórico dele
    setCustomer(customer) {
      state.customer = customer ? { id: customer.id, name: customer.name, cpf: customer.cpf ?? null } : null;
      emit();
    },

    removePayment(id) {
      state.payments = state.payments.filter((p) => p.id !== id);
      emit();
    },

    reset() {
      state = emptyState();
      emit();
    },
  };
}
