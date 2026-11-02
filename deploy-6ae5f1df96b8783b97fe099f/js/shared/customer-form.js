// Formulário de cadastro/edição de cliente (usado na aba Clientes e no PDV).
import { showModal, confirmDialog } from '../core/modal.js';
import { $, escapeHtml as e } from '../core/dom.js';
import { toast } from '../core/toast.js';
import { formatCPF, formatPhone, isValidCPF, isValidEmail, onlyDigits, bindMask } from './customer-utils.js';

/**
 * Abre o formulário. Resolve com o cliente salvo, { deleted: true } ou null (cancelado).
 * initial: dados para preencher (ex.: { name: 'Maria' } vindo da busca do PDV)
 */
export function openCustomerForm(ctx, customer = null, { initial = {}, allowDelete = true } = {}) {
  const editing = Boolean(customer?.id);
  const c = { ...initial, ...customer };
  return new Promise((resolve) => {
    let result = null;
    const m = showModal({
      title: editing ? 'Editar cliente' : 'Novo cliente',
      subtitle: 'Só o nome é obrigatório. O CPF é conferido automaticamente.',
      body: `
        <form id="customer-form" class="grid gap-4 sm:grid-cols-2" novalidate>
          <div class="sm:col-span-2"><label class="label" for="cf-name">Nome completo *</label>
            <input id="cf-name" class="input" required autofocus autocomplete="off" placeholder="Ex.: Maria da Silva" value="${e(c.name ?? '')}"></div>
          <div><label class="label" for="cf-cpf">CPF</label>
            <input id="cf-cpf" class="input" inputmode="numeric" placeholder="000.000.000-00" value="${e(formatCPF(c.cpf ?? ''))}">
            <p id="cf-cpf-msg" class="mt-1 text-xs"></p></div>
          <div><label class="label" for="cf-phone">Telefone / WhatsApp</label>
            <input id="cf-phone" class="input" inputmode="tel" placeholder="(00) 00000-0000" value="${e(formatPhone(c.phone ?? ''))}"></div>
          <div><label class="label" for="cf-email">E-mail</label>
            <input id="cf-email" type="email" class="input" placeholder="nome@email.com" value="${e(c.email ?? '')}"></div>
          <div><label class="label" for="cf-birth">Data de nascimento</label>
            <input id="cf-birth" type="date" class="input" max="${new Date().toISOString().slice(0, 10)}" value="${e(c.birthDate ?? '')}"></div>
          <div class="sm:col-span-2"><label class="label" for="cf-notes">Observações</label>
            <textarea id="cf-notes" class="textarea" rows="2" placeholder="Ex.: prefere tamanho M, gosta de peças em tons pastel">${e(c.notes ?? '')}</textarea></div>
        </form>`,
      footer: `${editing && allowDelete ? '<button type="button" class="btn btn-danger mr-auto" data-delete>Excluir</button>' : ''}
               <button type="button" class="btn" data-close>Cancelar</button>
               <button type="submit" form="customer-form" class="btn btn-gold">${editing ? 'Salvar' : 'Cadastrar cliente'}</button>`,
      onClose: () => resolve(result),
    });

    const body = m.body;
    const cpf = $('#cf-cpf', body);
    const cpfMsg = $('#cf-cpf-msg', body);
    bindMask(cpf, formatCPF);
    bindMask($('#cf-phone', body), formatPhone);
    const checkCpf = () => {
      const d = onlyDigits(cpf.value);
      const ok = !d || isValidCPF(d);
      cpfMsg.textContent = !d ? '' : ok ? 'CPF válido ✓' : d.length < 11 ? 'CPF incompleto' : 'CPF inválido: confira os números';
      cpfMsg.className = `mt-1 text-xs ${ok ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose'}`;
      return ok;
    };
    cpf.addEventListener('input', checkCpf);
    checkCpf();

    m.el.querySelector('form').addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const data = {
        name: $('#cf-name', body).value.trim(),
        cpf: onlyDigits(cpf.value) || null,
        phone: onlyDigits($('#cf-phone', body).value) || null,
        email: $('#cf-email', body).value.trim().toLowerCase() || null,
        birthDate: $('#cf-birth', body).value || null,
        notes: $('#cf-notes', body).value.trim() || null,
      };
      if (!data.name) return toast('Informe o nome do cliente', 'warn');
      if (!checkCpf()) return toast('O CPF informado não é válido', 'warn');
      if (!isValidEmail(data.email)) return toast('E-mail inválido', 'warn');
      const submit = m.el.querySelector('[type=submit]');
      submit.disabled = true;
      try {
        result = editing ? await ctx.api.customers.update(customer.id, data) : await ctx.api.customers.create(data);
        toast(editing ? 'Cliente atualizado' : 'Cliente cadastrado', 'success');
        m.close();
      } catch (err) {
        toast(err.message, 'error', 6000);
        submit.disabled = false;
      }
    });

    m.el.querySelector('[data-delete]')?.addEventListener('click', async () => {
      const ok = await confirmDialog({
        title: 'Excluir cliente?',
        message: customer.purchases
          ? `${customer.name} tem ${customer.purchases} compra(s). As vendas continuam registradas, mas sem o vínculo com o cadastro.`
          : `O cadastro de ${customer.name} será removido.`,
        confirmLabel: 'Excluir',
        danger: true,
      });
      if (!ok) return;
      try {
        await ctx.api.customers.remove(customer.id);
        toast('Cliente excluído', 'success');
        result = { deleted: true };
        m.close();
      } catch (err) { toast(err.message, 'error'); }
    });
  });
}
