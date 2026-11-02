// Janela de abertura de caixa (usada em Vendas e Financeiro)
import { showModal } from '../core/modal.js';
import { parseBRL } from '../core/money.js';
import { toast } from '../core/toast.js';

export function openCashDialog(ctx) {
  return new Promise((resolve) => {
    let done = false;
    const m = showModal({
      title: 'Abrir caixa',
      subtitle: 'Informe o dinheiro disponível na gaveta para troco.',
      size: 'sm',
      body: `
        <form id="cash-open-form">
          <label class="label" for="opening-amount">Fundo de troco (R$)</label>
          <input id="opening-amount" class="input text-right text-lg" inputmode="decimal" placeholder="0,00" autofocus>
          <button type="submit" class="btn btn-gold btn-lg mt-4 w-full">Abrir caixa</button>
        </form>`,
      onClose: () => !done && resolve(null),
    });
    m.body.querySelector('form').addEventListener('submit', async (ev) => {
      ev.preventDefault();
      try {
        const session = await ctx.api.cash.openSession(parseBRL(m.body.querySelector('#opening-amount').value));
        ctx.setSession(session);
        done = true;
        m.close();
        toast('Caixa aberto', 'success');
        resolve(session);
      } catch (err) {
        toast(err.message, 'error');
      }
    });
  });
}
