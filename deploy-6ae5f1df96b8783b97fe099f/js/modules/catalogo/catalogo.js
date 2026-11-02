// Catálogo: lista de produtos e cadastro/edição com geração automática da grade (tamanhos × cores).
import { formatBRL, parseBRL } from '../../core/money.js';
import { toast } from '../../core/toast.js';
import { $, escapeHtml as e, debounce } from '../../core/dom.js';
import { showModal, confirmDialog } from '../../core/modal.js';
import { fmtInt } from '../../core/format.js';

const moneyInput = (cents) => (cents ? (cents / 100).toFixed(2).replace('.', ',') : '');

export async function mount(root, ctx) {
  const { api } = ctx;
  let products = [];
  let meta = null;
  const filter = { term: '', category: '', status: 'ativos' };

  root.innerHTML = `
  <div class="mx-auto max-w-7xl space-y-4 p-4 sm:p-6">
    <div class="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h2 class="font-display text-2xl font-semibold">Catálogo</h2>
        <p class="text-sm text-muted">Produtos, grade de tamanhos/cores e preços.</p>
      </div>
      <button id="new-product" type="button" class="btn btn-gold">+ Novo produto</button>
    </div>

    <div class="card flex flex-wrap gap-3 p-3">
      <input id="cat-search" type="search" class="input min-w-[200px] flex-1" placeholder="Buscar por nome, referência ou marca…">
      <select id="cat-category" class="select !w-auto min-w-[180px]"><option value="">Todas as categorias</option></select>
      <div class="tabs">
        <button type="button" class="tab is-active" data-status="ativos">Ativos</button>
        <button type="button" class="tab" data-status="inativos">Inativos</button>
        <button type="button" class="tab" data-status="todos">Todos</button>
      </div>
    </div>

    <div id="cat-summary" class="text-xs text-muted"></div>
    <div id="cat-list" class="grid gap-3 md:grid-cols-2 xl:grid-cols-3"><div class="empty col-span-full">Carregando…</div></div>
  </div>`;

  async function load() {
    [products, meta] = await Promise.all([api.catalog.listProducts(), meta ?? api.catalog.meta()]);
    const categories = [...new Set([...meta.categories.map((c) => c.name), ...products.map((p) => p.category).filter(Boolean)])].sort();
    $('#cat-category', root).innerHTML = `<option value="">Todas as categorias</option>${categories.map((c) => `<option ${c === filter.category ? 'selected' : ''}>${e(c)}</option>`).join('')}`;
    render();
  }

  function render() {
    const t = filter.term.toLowerCase();
    const list = products.filter((p) => (!filter.category || p.category === filter.category)
      && (filter.status === 'todos' || (filter.status === 'ativos' ? p.active : !p.active))
      && (!t || [p.name, p.reference, p.brand].some((x) => (x ?? '').toLowerCase().includes(t))));
    const totalUnits = list.reduce((s, p) => s + p.totalStock, 0);
    $('#cat-summary', root).textContent = `${list.length} produto(s) · ${fmtInt(list.reduce((s, p) => s + p.variants.length, 0))} variações · ${fmtInt(totalUnits)} peças em estoque`;

    $('#cat-list', root).innerHTML = list.length ? list.map((p) => {
      const sizes = [...new Set(p.variants.map((v) => v.size))];
      const colors = [...new Map(p.variants.map((v) => [v.color, v.colorHex])).entries()];
      const low = p.variants.filter((v) => v.stock <= v.minStock).length;
      const margin = p.salePrice ? (p.salePrice - p.costPrice) / p.salePrice : 0;
      return `
      <article class="card flex flex-col p-4 ${p.active ? '' : 'opacity-60'}">
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0">
            <div class="text-[11px] font-medium uppercase tracking-wide text-muted">${e(p.category || 'Sem categoria')}</div>
            <h3 class="truncate font-semibold">${e(p.name)}</h3>
            <div class="text-xs text-muted">${e(p.brand || '—')} · Ref. ${e(p.reference || '—')}</div>
          </div>
          <div class="text-right">
            <div class="font-semibold text-gold">${formatBRL(p.salePrice)}</div>
            <div class="text-[11px] text-muted">custo ${formatBRL(p.costPrice)} · ${Math.round(margin * 100)}% margem</div>
          </div>
        </div>
        <div class="mt-3 flex flex-wrap gap-1">
          ${sizes.map((s) => `<span class="border-app rounded border px-1.5 text-[11px]">${e(s)}</span>`).join('')}
          <span class="ml-auto flex -space-x-1">${colors.map(([n, hex]) => `<span title="${e(n)}" class="h-4 w-4 rounded-full ring-2 ring-white dark:ring-slate-900" style="background:${e(hex ?? '#ccc')}"></span>`).join('')}</span>
        </div>
        <div class="mt-3 flex flex-wrap items-center gap-2 text-xs">
          <span class="badge">${p.variants.length} variações</span>
          <span class="badge ${p.totalStock ? 'badge-ok' : 'badge-danger'}">${fmtInt(p.totalStock)} em estoque</span>
          ${low ? `<span class="badge badge-warn">${low} com estoque baixo</span>` : ''}
          ${p.active ? '' : '<span class="badge">Inativo</span>'}
        </div>
        <div class="mt-4 flex gap-2">
          <button type="button" class="btn btn-sm flex-1" data-edit="${e(p.id)}">Editar</button>
          <button type="button" class="btn btn-sm btn-rose flex-1" data-grid="${e(p.id)}">Ver grade</button>
        </div>
      </article>`;
    }).join('') : '<div class="empty col-span-full">Nenhum produto encontrado.</div>';
  }

  // -------------------------------------------------------------------------
  // Cadastro de produto
  // -------------------------------------------------------------------------
  function openForm(product = null) {
    const editing = Boolean(product);
    const categories = [...new Set([...meta.categories.map((c) => c.name), ...products.map((p) => p.category).filter(Boolean)])].sort();
    // Na edição, tamanhos e cores que o produto já tem ficam travados (marcados)
    const locked = {
      sizes: new Set(product?.variants.map((v) => v.size) ?? []),
      colors: new Set(product?.variants.map((v) => v.color) ?? []),
    };
    const selected = editing
      ? { sizes: new Set(locked.sizes), colors: new Set(locked.colors) }
      : { sizes: new Set(['P', 'M', 'G'].filter((s) => meta.sizes.some((x) => x.code === s))), colors: new Set() };
    const existingCombos = new Set(product?.variants.map((v) => `${v.size}|${v.color}`) ?? []);

    const sizeChip = (code) => {
      const isLocked = locked.sizes.has(code);
      return `<button type="button" class="chip ${selected.sizes.has(code) ? 'is-active' : ''}" data-size="${e(code)}" ${isLocked ? 'data-locked title="Já cadastrado neste produto"' : ''}>${e(code)}${isLocked ? ' ✓' : ''}</button>`;
    };
    const colorChip = (c) => {
      const isLocked = locked.colors.has(c.name);
      return `<button type="button" class="chip ${selected.colors.has(c.name) ? 'is-active' : ''}" data-color="${e(c.name)}" ${isLocked ? 'data-locked title="Já cadastrada neste produto"' : ''}>
        <span class="h-3.5 w-3.5 rounded-full ring-1 ring-black/10" style="background:${e(c.hex ?? '#ccc')}"></span>${e(c.name)}${isLocked ? ' ✓' : ''}</button>`;
    };

    const m = showModal({
      title: editing ? 'Editar produto' : 'Novo produto',
      subtitle: editing ? 'Altere os dados ou acrescente tamanhos e cores (os já cadastrados estão marcados com ✓).' : 'Escolha tamanhos e cores: o sistema cria um SKU para cada combinação.',
      size: 'lg',
      body: `
        <form id="product-form" class="grid gap-4 sm:grid-cols-2">
          <div class="sm:col-span-2"><label class="label" for="pf-name">Nome do produto *</label>
            <input id="pf-name" class="input" required autofocus placeholder="Ex.: Vestido Midi Floral" value="${e(product?.name ?? '')}"></div>
          <div><label class="label" for="pf-category">Categoria (escolha ou digite uma nova)</label>
            <input id="pf-category" class="input" list="pf-categories" placeholder="Ex.: Vestidos, Bolsas, Brincos…" value="${e(product?.category ?? '')}">
            <datalist id="pf-categories">${categories.map((c) => `<option value="${e(c)}">`).join('')}</datalist></div>
          <div><label class="label" for="pf-brand">Marca</label>
            <input id="pf-brand" class="input" placeholder="Ex.: Ciboff" value="${e(product?.brand ?? '')}"></div>
          <div><label class="label" for="pf-ref">Referência (código do modelo)</label>
            <input id="pf-ref" class="input uppercase" placeholder="Ex.: VES-010 (opcional)" value="${e(product?.reference ?? '')}" ${editing ? 'disabled title="A referência compõe os SKUs e não muda depois do cadastro"' : ''}></div>
          <div class="grid grid-cols-2 gap-3">
            <div><label class="label" for="pf-cost">Preço de custo (R$)</label>
              <input id="pf-cost" class="input text-right" inputmode="decimal" placeholder="0,00" value="${moneyInput(product?.costPrice)}"></div>
            <div><label class="label" for="pf-price">Preço de venda (R$) *</label>
              <input id="pf-price" class="input text-right" inputmode="decimal" required placeholder="0,00" value="${moneyInput(product?.salePrice)}"></div>
          </div>
          ${editing ? `
          <label class="flex items-center gap-2 text-sm sm:col-span-2">
            <input id="pf-active" type="checkbox" ${product.active ? 'checked' : ''} class="h-4 w-4 accent-[#c9a24a]"> Produto ativo (aparece no PDV)
          </label>
          <hr class="border-app sm:col-span-2">
          <div class="sm:col-span-2 -mb-2 font-semibold">Acrescentar tamanhos ou cores</div>` : ''}
          <div class="sm:col-span-2"><div class="label">Tamanhos *</div>
            <div id="pf-sizes" class="flex flex-wrap items-center gap-2">
              ${meta.sizes.map((s) => sizeChip(s.code)).join('')}
              <button type="button" class="chip chip-add" data-new="size">+ Novo tamanho</button>
              <span data-new-form="size" class="hidden items-center gap-1.5">
                <input class="input !h-9 !w-36" placeholder="Ex.: 50, XGG, 2 anos" maxlength="12">
                <button type="button" class="btn btn-sm btn-gold" data-save-new="size">Criar</button>
              </span>
            </div></div>
          <div class="sm:col-span-2"><div class="label">Cores *</div>
            <div id="pf-colors" class="flex flex-wrap items-center gap-2">
              ${meta.colors.map(colorChip).join('')}
              <button type="button" class="chip chip-add" data-new="color">+ Nova cor</button>
              <span data-new-form="color" class="hidden items-center gap-1.5">
                <input type="color" value="#d9849e" class="h-9 w-10 cursor-pointer rounded-lg border-0 bg-transparent p-0" aria-label="Tom da cor">
                <input class="input !h-9 !w-36" placeholder="Ex.: Caramelo" maxlength="30">
                <button type="button" class="btn btn-sm btn-gold" data-save-new="color">Criar</button>
              </span>
            </div></div>
          <div><label class="label" for="pf-stock">Estoque inicial por variação${editing ? ' nova' : ''}</label>
            <input id="pf-stock" type="number" min="0" value="0" class="input text-right"></div>
          <div><label class="label" for="pf-min">Estoque mínimo (alerta)</label>
            <input id="pf-min" type="number" min="0" value="2" class="input text-right"></div>
          <div id="pf-preview" class="rounded-xl bg-slate-50 p-3 text-sm dark:bg-slate-800/60 sm:col-span-2"></div>
        </form>`,
      footer: `${editing ? '<button type="button" class="btn btn-danger mr-auto" data-delete-product>Excluir produto</button>' : ''}
               <button type="button" class="btn" data-close>Cancelar</button>
               <button type="submit" form="product-form" class="btn btn-gold">${editing ? 'Salvar alterações' : 'Cadastrar produto'}</button>`,
    });

    const body = m.body;
    const sizeOrderOf = (code) => meta.sizes.find((s) => s.code === code)?.order ?? 500;
    const combos = () => [...selected.sizes].sort((a, b) => sizeOrderOf(a) - sizeOrderOf(b))
      .flatMap((s) => [...selected.colors].map((c) => [s, c]))
      .filter(([s, c]) => !existingCombos.has(`${s}|${c}`));
    const preview = () => {
      const list = combos();
      const qty = Math.max(0, parseInt($('#pf-stock', body).value, 10) || 0);
      const sizes = [...new Set(list.map(([s]) => s))];
      const colors = [...new Set(list.map(([, c]) => c))];
      $('#pf-preview', body).innerHTML = list.length
        ? `Serão criadas <b>${list.length}</b> ${editing ? 'novas ' : ''}variações (${sizes.join(', ')} × ${colors.join(', ')})${qty ? ` com <b>${qty}</b> peça(s) cada = <b>${list.length * qty}</b> peças.` : '.'}`
        : `<span class="text-muted">${editing ? 'Nenhuma variação nova: marque um tamanho ou cor que o produto ainda não tem.' : 'Selecione ao menos um tamanho e uma cor.'}</span>`;
    };

    // Ordem de exibição de um tamanho novo: números em ordem numérica, letras depois do XG
    const orderForNewSize = (code) => {
      const n = parseInt(code, 10);
      if (/^\d+$/.test(code)) return 90 + (n - 34) * 5;
      return 70 + meta.sizes.filter((s) => s.order >= 70 && s.order < 90).length;
    };

    async function createNew(kind) {
      const form = body.querySelector(`[data-new-form="${kind}"]`);
      const name = form.querySelector('input:not([type=color])').value.trim();
      if (!name) return toast(kind === 'size' ? 'Digite o tamanho' : 'Digite o nome da cor', 'warn');
      try {
        if (kind === 'size') {
          const size = await api.catalog.createSize({ code: name, order: orderForNewSize(name.toUpperCase()) });
          meta.sizes = [...meta.sizes, size].sort((a, b) => a.order - b.order);
          selected.sizes.add(size.code);
          body.querySelector('[data-new="size"]').insertAdjacentHTML('beforebegin', sizeChip(size.code));
          toast(`Tamanho ${size.code} criado`, 'success');
        } else {
          const color = await api.catalog.createColor({ name, hex: form.querySelector('input[type=color]').value });
          meta.colors = [...meta.colors, color];
          selected.colors.add(color.name);
          body.querySelector('[data-new="color"]').insertAdjacentHTML('beforebegin', colorChip(color));
          toast(`Cor ${color.name} criada`, 'success');
        }
        form.querySelector('input:not([type=color])').value = '';
        form.classList.replace('flex', 'hidden');
        preview();
      } catch (err) {
        toast(err.message, 'error', 6000);
      }
    }

    body.addEventListener('click', (ev) => {
      const newBtn = ev.target.closest('[data-new]');
      if (newBtn) {
        const form = body.querySelector(`[data-new-form="${newBtn.dataset.new}"]`);
        form.classList.replace('hidden', 'flex');
        form.querySelector('input:not([type=color])').focus();
        return;
      }
      const saveBtn = ev.target.closest('[data-save-new]');
      if (saveBtn) return createNew(saveBtn.dataset.saveNew);
      const s = ev.target.closest('[data-size]');
      const c = ev.target.closest('[data-color]');
      const chip = s ?? c;
      if (!chip) return;
      if (chip.hasAttribute('data-locked')) return toast('Já faz parte deste produto', 'info', 1800);
      const set = s ? selected.sizes : selected.colors;
      const key = s ? s.dataset.size : c.dataset.color;
      set.has(key) ? set.delete(key) : set.add(key);
      chip.classList.toggle('is-active');
      preview();
    });
    // Enter dentro do "novo tamanho/cor" cria o item em vez de enviar o formulário
    body.querySelectorAll('[data-new-form] input:not([type=color])').forEach((input) => {
      input.addEventListener('keydown', (ev) => {
        if (ev.key !== 'Enter') return;
        ev.preventDefault();
        createNew(input.closest('[data-new-form]').dataset.newForm);
      });
    });
    $('#pf-stock', body).addEventListener('input', preview);
    preview();

    m.el.querySelector('[data-delete-product]')?.addEventListener('click', async () => {
      const ok = await confirmDialog({
        title: 'Excluir produto?',
        message: `"${product.name}" e todas as suas ${product.variants.length} variações serão apagados. Só é possível excluir produtos que nunca foram vendidos.`,
        confirmLabel: 'Excluir',
        danger: true,
      });
      if (!ok) return;
      try {
        await api.catalog.deleteProduct(product.id);
        toast('Produto excluído', 'success');
        m.close();
        await load();
      } catch (err) {
        toast(err.message, 'error', 9000);
      }
    });

    m.el.querySelector('#product-form').addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const submit = m.el.querySelector('[type=submit]');
      const data = {
        name: $('#pf-name', body).value,
        category: $('#pf-category', body).value.trim(),
        brand: $('#pf-brand', body).value.trim(),
        costPrice: parseBRL($('#pf-cost', body).value),
        salePrice: parseBRL($('#pf-price', body).value),
      };
      if (!data.salePrice) return toast('Informe o preço de venda', 'warn');
      const initialStock = Math.max(0, parseInt($('#pf-stock', body).value, 10) || 0);
      const minStock = Math.max(0, parseInt($('#pf-min', body).value, 10) || 0);
      const newCombos = combos();
      submit.disabled = true;
      try {
        if (editing) {
          await api.catalog.updateProduct(product.id, { ...data, active: $('#pf-active', body).checked });
          let created = 0;
          if (newCombos.length) {
            created = await api.catalog.addVariants(product.id, {
              sizes: [...new Set(newCombos.map(([s]) => s))],
              colors: [...new Set(newCombos.map(([, c]) => c))],
              initialStock,
              minStock,
            });
          }
          toast(created ? `Produto atualizado · ${created} variação(ões) nova(s)` : 'Produto atualizado', 'success');
        } else {
          if (!newCombos.length) return toast('Escolha ao menos um tamanho e uma cor', 'warn');
          await api.catalog.createProduct({
            ...data,
            reference: $('#pf-ref', body).value.trim(),
            sizes: meta.sizes.map((s) => s.code).filter((c) => selected.sizes.has(c)),
            colors: [...selected.colors],
            initialStock,
            minStock,
          });
          toast('Produto cadastrado', 'success');
        }
        m.close();
        await load();
      } catch (err) {
        toast(err.message, 'error', 6000);
      } finally {
        submit.disabled = false;
      }
    });
  }

  function openGrid(product) {
    const sizes = [...new Map(product.variants.map((v) => [v.size, v.sizeOrder])).entries()].sort((a, b) => a[1] - b[1]).map(([s]) => s);
    const colors = [...new Map(product.variants.map((v) => [v.color, v.colorHex])).entries()];
    const cell = (size, color) => {
      const v = product.variants.find((x) => x.size === size && x.color === color);
      if (!v) return '<td class="num text-muted">—</td>';
      const cls = v.stock === 0 ? 'badge-danger' : v.stock <= v.minStock ? 'badge-warn' : 'badge-ok';
      return `<td class="num"><span class="badge ${cls}" title="SKU ${e(v.sku)}">${v.stock}</span></td>`;
    };
    showModal({
      title: product.name,
      subtitle: 'Estoque por tamanho e cor',
      size: 'lg',
      body: `
        <div class="overflow-x-auto">
          <table class="tbl">
            <thead><tr><th>Cor</th>${sizes.map((s) => `<th class="num">${e(s)}</th>`).join('')}<th class="num">Total</th></tr></thead>
            <tbody>${colors.map(([c, hex]) => `
              <tr><td><span class="inline-flex items-center gap-2"><span class="h-3 w-3 rounded-full ring-1 ring-black/10" style="background:${e(hex ?? '#ccc')}"></span>${e(c)}</span></td>
                ${sizes.map((s) => cell(s, c)).join('')}
                <td class="num font-semibold">${product.variants.filter((v) => v.color === c).reduce((s, v) => s + v.stock, 0)}</td></tr>`).join('')}
            </tbody>
          </table>
        </div>
        <p class="mt-3 text-xs text-muted">Para dar entrada ou ajustar quantidades, use o menu <b>Estoque</b>.</p>`,
      footer: '<a href="#/estoque" class="btn btn-rose">Ir para Estoque</a><button type="button" class="btn" data-close>Fechar</button>',
    });
  }

  $('#new-product', root).addEventListener('click', () => meta && openForm());
  $('#cat-search', root).addEventListener('input', debounce((ev) => { filter.term = ev.target.value; render(); }, 150));
  $('#cat-category', root).addEventListener('change', (ev) => { filter.category = ev.target.value; render(); });
  root.querySelectorAll('[data-status]').forEach((b) => b.addEventListener('click', () => {
    filter.status = b.dataset.status;
    root.querySelectorAll('[data-status]').forEach((x) => x.classList.toggle('is-active', x === b));
    render();
  }));
  $('#cat-list', root).addEventListener('click', (ev) => {
    const edit = ev.target.closest('[data-edit]');
    const grid = ev.target.closest('[data-grid]');
    if (edit) openForm(products.find((p) => p.id === edit.dataset.edit));
    if (grid) openGrid(products.find((p) => p.id === grid.dataset.grid));
  });

  await load();
}
