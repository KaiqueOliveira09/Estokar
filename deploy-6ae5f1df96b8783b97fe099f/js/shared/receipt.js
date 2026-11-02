// Cupom / Recibo de Controle Interno (NÃO FISCAL).
// Gera HTML pronto para impressora térmica (58/80 mm) ou visualização em tela.
import { escapeHtml as e } from '../core/dom.js';
import { formatBRL } from '../core/money.js';
import { PAYMENT_METHODS } from './constants.js';
import { maskCPF } from './customer-utils.js';

const dateFmt = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'medium' });

const row = (left, right, cls = '') =>
  `<div class="r-row ${cls}"><span>${left}</span><span>${right}</span></div>`;

export function renderReceipt(sale, store) {
  const items = sale.items.map((i, idx) => `
    <div class="r-item">
      <div class="r-bold">${String(idx + 1).padStart(2, '0')} ${e(i.name)}</div>
      <div class="r-muted">Tam: ${e(i.size)}${i.color ? ` | Cor: ${e(i.color)}` : ''}</div>
      ${row(`${i.qty} x ${formatBRL(i.unitPrice)}`, formatBRL(i.total))}
      <div class="r-muted r-small">SKU ${e(i.sku)}</div>
    </div>`).join('');

  const payments = sale.payments
    .map((p) => row(e(PAYMENT_METHODS[p.method] ?? p.method), formatBRL(p.amount)))
    .join('');

  const qty = sale.items.reduce((s, i) => s + i.qty, 0);

  return `
  <article class="receipt" style="--receipt-width:${Number(store.receiptWidthMm) || 80}mm">
    <header class="r-center">
      <div class="r-bold r-lg">${e(store.name)}</div>
      ${store.legalName ? `<div class="r-small">${e(store.legalName)}</div>` : ''}
      ${store.document ? `<div class="r-small">CNPJ/CPF: ${e(store.document)}</div>` : ''}
      ${store.address ? `<div class="r-small">${e(store.address)}</div>` : ''}
      ${store.phone || store.instagram ? `<div class="r-small">${e([store.phone, store.instagram].filter(Boolean).join(' · '))}</div>` : ''}
    </header>

    <div class="r-sep"></div>
    <div class="r-center r-bold">CUPOM DE CONTROLE INTERNO</div>
    <div class="r-center r-small r-bold">*** NÃO É DOCUMENTO FISCAL ***</div>
    <div class="r-sep"></div>

    ${row('Venda nº', String(sale.number).padStart(6, '0'), 'r-bold')}
    ${row('Data', dateFmt.format(new Date(sale.createdAt)))}
    ${sale.operator ? row('Operador', e(sale.operator)) : ''}
    ${sale.customer?.name ? `
    <div class="r-sep"></div>
    <div><span class="r-bold">CLIENTE:</span> ${e(sale.customer.name)}</div>
    ${maskCPF(sale.customer.cpf) ? `<div class="r-small">CPF: ${maskCPF(sale.customer.cpf)}</div>` : ''}` : ''}
    ${sale.status === 'cancelada' ? '<div class="r-center r-bold r-lg">VENDA CANCELADA</div>' : ''}

    <div class="r-sep"></div>
    ${row('ITEM / DESCRIÇÃO', 'TOTAL', 'r-bold')}
    ${items}

    <div class="r-sep"></div>
    ${row(`Qtd. de itens`, String(qty))}
    ${row('Subtotal', formatBRL(sale.subtotal))}
    ${sale.discount ? row('Desconto', `- ${formatBRL(sale.discount)}`) : ''}
    ${row('TOTAL', formatBRL(sale.total), 'r-bold r-lg')}

    <div class="r-sep"></div>
    <div class="r-bold">FORMA DE PAGAMENTO</div>
    ${payments}
    ${sale.change ? row('Troco', formatBRL(sale.change), 'r-bold') : ''}

    ${sale.notes ? `<div class="r-sep"></div><div class="r-small">Obs.: ${e(sale.notes)}</div>` : ''}

    <div class="r-sep"></div>
    ${store.receiptFooter ? `<div class="r-center r-small">${e(store.receiptFooter)}</div>` : ''}
    <div class="r-center r-small r-muted">Comprovante para controle interno e conferência de caixa. Sem valor fiscal.</div>
    <div class="r-center r-small r-muted">Ref. ${e(sale.id)}</div>
  </article>`;
}

// Imprime apenas o cupom (o CSS de impressão esconde o resto da página)
export function printReceipt(html) {
  printHtml(html);
}

// Impressão genérica: coloca o conteúdo em #print-root e chama a impressora
export function printHtml(html, { page = 'receipt' } = {}) {
  const root = document.getElementById('print-root');
  root.dataset.page = page;
  root.innerHTML = html;
  window.print();
}
