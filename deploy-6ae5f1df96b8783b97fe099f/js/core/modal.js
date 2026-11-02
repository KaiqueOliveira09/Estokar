// Janelas modais criadas sob demanda (formulários, confirmações, visualização de cupom).
import { openModal, closeModal, topModal } from './dom.js';

let seq = 0;

/**
 * showModal({ title, subtitle, body, footer, size }) → { el, body, close }
 * body/footer: string HTML. size: 'sm' | 'md' | 'lg'
 */
export function showModal({ title = '', subtitle = '', body = '', footer = '', size = 'md', onClose } = {}) {
  const id = `modal-${++seq}`;
  const width = { sm: 'max-w-sm', md: 'max-w-lg', lg: 'max-w-3xl' }[size] ?? 'max-w-lg';
  const wrap = document.createElement('div');
  wrap.id = id;
  wrap.className = 'fixed inset-0 z-[60] hidden items-end justify-center bg-black/40 p-0 backdrop-blur-sm sm:items-center sm:p-4';
  wrap.innerHTML = `
    <div class="app-surface flex max-h-[92vh] w-full ${width} flex-col rounded-t-2xl shadow-2xl sm:rounded-2xl" role="dialog" aria-modal="true" aria-labelledby="${id}-title">
      <div class="border-app flex items-start justify-between gap-3 border-b px-5 py-4">
        <div class="min-w-0">
          <h3 id="${id}-title" class="font-display text-lg font-semibold"></h3>
          <p class="modal-subtitle text-sm text-muted"></p>
        </div>
        <button type="button" data-close class="icon-btn -mr-2 -mt-1" aria-label="Fechar">
          <svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" d="M6 6l12 12M18 6 6 18"/></svg>
        </button>
      </div>
      <div class="modal-body scroll-thin overflow-y-auto px-5 py-4"></div>
      ${footer ? '<div class="modal-footer border-app flex flex-wrap justify-end gap-2 border-t px-5 py-3"></div>' : ''}
    </div>`;
  wrap.querySelector(`#${id}-title`).textContent = title;
  wrap.querySelector('.modal-subtitle').textContent = subtitle;
  wrap.querySelector('.modal-body').innerHTML = body;
  if (footer) wrap.querySelector('.modal-footer').innerHTML = footer;
  document.body.append(wrap);

  const onKey = (ev) => {
    if (ev.key === 'Escape' && topModal() === id) { ev.preventDefault(); ev.stopImmediatePropagation(); close(); }
  };
  function close() {
    document.removeEventListener('keydown', onKey, true);
    closeModal(id);
    wrap.remove();
    onClose?.();
  }
  document.addEventListener('keydown', onKey, true);
  wrap.addEventListener('click', (ev) => {
    if (ev.target === wrap || ev.target.closest('[data-close]')) close();
  });

  openModal(id);
  wrap.querySelector('[autofocus]')?.focus();
  return { el: wrap, body: wrap.querySelector('.modal-body'), close };
}

// Confirmação simples. Resolve true/false.
export function confirmDialog({ title, message, confirmLabel = 'Confirmar', danger = false }) {
  return new Promise((resolve) => {
    let answered = false;
    const m = showModal({
      title,
      size: 'sm',
      body: `<p class="text-sm"></p>`,
      footer: `<button type="button" class="btn" data-close>Voltar</button>
               <button type="button" class="btn ${danger ? 'btn-danger' : 'btn-gold'}" data-ok>${confirmLabel}</button>`,
      onClose: () => !answered && resolve(false),
    });
    m.body.querySelector('p').textContent = message;
    m.el.querySelector('[data-ok]').addEventListener('click', () => { answered = true; m.close(); resolve(true); });
  });
}
