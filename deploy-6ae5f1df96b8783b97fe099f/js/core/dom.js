export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const escapeHtml = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ESC[c]);

export function debounce(fn, ms = 250) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

// Modais simples com pilha (Esc fecha o do topo)
const modalStack = [];
export function openModal(id) {
  const el = document.getElementById(id);
  el.classList.remove('hidden');
  el.classList.add('flex');
  if (!modalStack.includes(id)) modalStack.push(id);
  el.querySelector('[autofocus]')?.focus();
}
export function closeModal(id) {
  const el = document.getElementById(id);
  el.classList.add('hidden');
  el.classList.remove('flex');
  const i = modalStack.indexOf(id);
  if (i >= 0) modalStack.splice(i, 1);
}
export const topModal = () => modalStack[modalStack.length - 1] ?? null;
