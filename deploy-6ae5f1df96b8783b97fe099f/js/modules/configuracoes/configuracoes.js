// Configurações: dados da loja que aparecem no cabeçalho e no rodapé do cupom.
import { toast } from '../../core/toast.js';
import { $, escapeHtml as e } from '../../core/dom.js';
import { renderReceipt } from '../../shared/receipt.js';

const SAMPLE_SALE = {
  id: '00000000-0000-0000-0000-000000000000',
  number: 1,
  createdAt: new Date().toISOString(),
  status: 'concluida',
  operator: 'Exemplo',
  customer: { name: 'Cliente Exemplo', cpf: null },
  items: [{ name: 'Produto de exemplo', size: 'M', color: 'Rosa', sku: 'REF-M-ROS', qty: 1, unitPrice: 9990, total: 9990 }],
  payments: [{ method: 'pix', amount: 9990 }],
  subtotal: 9990, discount: 0, total: 9990, paid: 9990, change: 0,
};

export async function mount(root, ctx) {
  const canEdit = ctx.demo || ['admin', 'gerente'].includes(ctx.profile?.role);
  const s = ctx.store;

  const field = (id, label, value, attrs = '') => `
    <div><label class="label" for="${id}">${label}</label>
      <input id="${id}" class="input" value="${e(value ?? '')}" ${attrs} ${canEdit ? '' : 'disabled'}></div>`;

  root.innerHTML = `
  <div class="mx-auto max-w-6xl space-y-4 p-4 sm:p-6">
    <div>
      <h2 class="font-display text-2xl font-semibold">Configurações</h2>
      <p class="text-sm text-muted">Dados da loja que aparecem no cupom de controle interno.</p>
    </div>
    ${canEdit ? '' : '<div class="rounded-xl border border-gold-300 bg-gold-50 px-4 py-3 text-sm text-gold-700 dark:border-gold-700/50 dark:bg-gold-500/10 dark:text-gold-200">Somente a administradora ou gerente pode alterar estes dados.</div>'}
    <div class="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
      <form id="settings-form" class="card grid gap-4 p-5 sm:grid-cols-2">
        <div class="sm:col-span-2">${field('st-name', 'Nome da loja (aparece em destaque) *', s.name, 'required')}</div>
        ${field('st-legal', 'Razão social', s.legalName, 'placeholder="Ex.: Ciboff Comércio de Roupas LTDA"')}
        ${field('st-doc', 'CNPJ ou CPF', s.document, 'placeholder="00.000.000/0000-00"')}
        <div class="sm:col-span-2">${field('st-address', 'Endereço', s.address, 'placeholder="Rua, número - bairro - cidade/UF"')}</div>
        ${field('st-phone', 'Telefone / WhatsApp', s.phone, 'placeholder="(00) 00000-0000"')}
        ${field('st-insta', 'Instagram', s.instagram, 'placeholder="@ciboff"')}
        <div class="sm:col-span-2"><label class="label" for="st-footer">Mensagem no rodapé do cupom</label>
          <textarea id="st-footer" class="textarea" rows="2" ${canEdit ? '' : 'disabled'}>${e(s.receiptFooter ?? '')}</textarea></div>
        <div><label class="label" for="st-width">Largura da impressora térmica</label>
          <select id="st-width" class="select" ${canEdit ? '' : 'disabled'}>
            <option value="80" ${Number(s.receiptWidthMm) !== 58 ? 'selected' : ''}>80 mm (mais comum)</option>
            <option value="58" ${Number(s.receiptWidthMm) === 58 ? 'selected' : ''}>58 mm (compacta)</option>
          </select></div>
        <div class="flex items-end justify-end sm:col-span-2">
          ${canEdit ? '<button type="submit" class="btn btn-gold">Salvar configurações</button>' : ''}
        </div>
      </form>
      <aside class="space-y-2">
        <div class="text-sm font-medium text-muted">Prévia do cupom</div>
        <div class="rounded-2xl bg-slate-100 p-4 dark:bg-slate-950"><div id="st-preview" class="shadow-md"></div></div>
      </aside>
    </div>
  </div>`;

  const read = () => ({
    name: $('#st-name', root).value.trim(),
    legalName: $('#st-legal', root).value.trim(),
    document: $('#st-doc', root).value.trim(),
    address: $('#st-address', root).value.trim(),
    phone: $('#st-phone', root).value.trim(),
    instagram: $('#st-insta', root).value.trim(),
    receiptFooter: $('#st-footer', root).value.trim(),
    receiptWidthMm: Number($('#st-width', root).value),
  });
  const preview = () => { $('#st-preview', root).innerHTML = renderReceipt(SAMPLE_SALE, read()); };

  root.querySelector('form').addEventListener('input', preview);
  root.querySelector('form').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const data = read();
    if (!data.name) return toast('Informe o nome da loja', 'warn');
    const btn = ev.submitter;
    btn.disabled = true;
    try {
      ctx.store = await ctx.api.store.updateSettings(data);
      toast('Configurações salvas', 'success');
    } catch (err) {
      toast(err.message, 'error', 6000);
    } finally {
      btn.disabled = false;
    }
  });
  preview();
}
