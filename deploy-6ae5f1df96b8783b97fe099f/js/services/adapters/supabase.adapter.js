import { getSupabase } from '../../core/supabase.js';
import { toCents, fromCents } from '../../core/money.js';
import { groupCatalogRows, mapStore, colorCode } from './mappers.js';

const sb = await getSupabase();

// Traduz os erros técnicos mais comuns do banco para mensagens da loja
function friendly(message = '') {
  if (/row-level security|permission denied/i.test(message)) return 'Sem permissão: apenas gerente ou administradora pode fazer isso.';
  if (/JWT expired|invalid JWT|refresh_token/i.test(message)) return 'Sua sessão expirou. Saia e entre novamente.';
  if (/Failed to fetch|NetworkError|Load failed/i.test(message)) return 'Sem conexão com o servidor. Verifique a internet.';
  return message;
}

function check({ data, error }) {
  if (error) throw new Error(friendly(error.message));
  return data;
}

// Escapa curingas do ILIKE e caracteres reservados do filtro .or() do PostgREST
const sanitize = (term) => term.replace(/[%_,()\\]/g, ' ').trim();

const SALE_SELECT = `
  id, number, created_at, subtotal, discount, total, paid_amount, change_amount, status, notes, cancel_reason,
  seller:profiles!sales_seller_id_fkey(full_name),
  customer_id, customer:customers(id, name, cpf),
  items:sale_items(variant_id, product_name, size_code, color_name, sku, quantity, unit_price, unit_cost, total,
                   variant:product_variants(product:products(category:categories(name)))),
  payments:sale_payments(method, amount)`;

function mapSale(s) {
  return {
    id: s.id,
    number: s.number,
    createdAt: s.created_at,
    status: s.status,
    operator: s.seller?.full_name ?? '',
    customerId: s.customer_id,
    customer: s.customer,
    notes: s.notes,
    cancelReason: s.cancel_reason,
    items: s.items.map((i) => ({
      variantId: i.variant_id, name: i.product_name, size: i.size_code, color: i.color_name, sku: i.sku,
      category: i.variant?.product?.category?.name ?? '',
      qty: i.quantity, unitPrice: toCents(i.unit_price), unitCost: toCents(i.unit_cost), total: toCents(i.total),
    })),
    payments: s.payments.map((p) => ({ method: p.method, amount: toCents(p.amount) })),
    subtotal: toCents(s.subtotal),
    discount: toCents(s.discount),
    total: toCents(s.total),
    paid: toCents(s.paid_amount),
    change: toCents(s.change_amount),
  };
}

const mapMovement = (m) => ({
  id: m.id, sessionId: m.cash_session_id, type: m.type, method: m.payment_method,
  amount: toCents(m.amount), description: m.description, saleId: m.sale_id, at: m.created_at,
});

const mapCustomer = (c, stats = null) => ({
  id: c.id, name: c.name, cpf: c.cpf, phone: c.phone, email: c.email, birthDate: c.birth_date, notes: c.notes,
  createdAt: c.created_at,
  purchases: stats ? Number(stats.purchases) : 0,
  totalSpent: stats ? toCents(stats.total_spent) : 0,
  lastPurchase: stats?.last_purchase ?? null,
});

const customerRow = (d) => ({
  name: d.name.trim(), cpf: d.cpf || null, phone: d.phone || null, email: d.email || null,
  birth_date: d.birthDate || null, notes: d.notes || null,
});

const friendlyCustomerError = (err) => {
  if (/customers_cpf_key|duplicate key/.test(err.message)) return new Error('Já existe um cliente cadastrado com este CPF');
  return err;
};

const customers = {
  async list() {
    const [rows, stats] = await Promise.all([
      sb.from('customers').select('*').order('name'),
      sb.from('v_customer_stats').select('*'),
    ]);
    const byId = new Map(check(stats).map((x) => [x.customer_id, x]));
    return check(rows).map((c) => mapCustomer(c, byId.get(c.id)));
  },
  async search(term = '') {
    let q = sb.from('customers').select('*').order('name').limit(20);
    const t = sanitize(term);
    const digits = term.replace(/\D/g, '');
    if (t) {
      const parts = [`name.ilike.%${t}%`, `email.ilike.%${t}%`];
      if (digits.length >= 3) parts.push(`cpf.ilike.%${digits}%`, `phone.ilike.%${digits}%`);
      q = q.or(parts.join(','));
    }
    return check(await q).map((c) => mapCustomer(c));
  },
  async create(data) {
    const { data: row, error } = await sb.from('customers').insert(customerRow(data)).select('*').single();
    if (error) throw friendlyCustomerError(error);
    return mapCustomer(row);
  },
  async update(id, data) {
    const { data: row, error } = await sb.from('customers').update(customerRow(data)).eq('id', id).select('*').single();
    if (error) throw friendlyCustomerError(error);
    return mapCustomer(row);
  },
  async remove(id) {
    check(await sb.from('customers').delete().eq('id', id));
  },
  async history(id) {
    return check(await sb.from('sales').select(SALE_SELECT).eq('customer_id', id).order('created_at', { ascending: false })).map(mapSale);
  },
};

const store = {
  async getSettings() {
    const data = check(await sb.from('store_settings').select('*').eq('id', 1).maybeSingle());
    return mapStore(data);
  },
  // Requer perfil gerente/admin (RLS)
  async updateSettings(s) {
    const { data, error } = await sb.from('store_settings').upsert({
      id: 1, name: s.name, legal_name: s.legalName || null, document: s.document || null, address: s.address || null,
      phone: s.phone || null, instagram: s.instagram || null, receipt_footer: s.receiptFooter || null,
      receipt_width_mm: s.receiptWidthMm,
    }).select('*');
    if (error) throw new Error(error.message);
    if (!data?.length) throw new Error('Sem permissão: apenas gerente ou administradora altera os dados da loja');
    return mapStore(data[0]);
  },
};

// Cria as combinações tamanho × cor que ainda não existem e lança o estoque inicial
async function insertVariants(productId, prefix, sizes, colors, { initialStock = 0, minStock = 2, costPrice = null } = {}) {
  const [allColors, existing] = await Promise.all([
    sb.from('colors').select('id, name').in('name', colors).then(check),
    sb.from('product_variants').select('size_code, color_id').eq('product_id', productId).then(check),
  ]);
  const has = new Set(existing.map((v) => `${v.size_code}|${v.color_id}`));
  const rows = sizes.flatMap((size) => allColors
    .filter((c) => !has.has(`${size}|${c.id}`))
    .map((c) => ({ product_id: productId, size_code: size, color_id: c.id, min_stock: minStock, sku: `${prefix}-${size}-${colorCode(c.name)}` })));
  if (!rows.length) return 0;
  const variants = check(await sb.from('product_variants').insert(rows).select('id'));
  if (initialStock > 0) {
    await Promise.all(variants.map((v) => sb.rpc('register_stock_entry', {
      p_variant_id: v.id, p_quantity: initialStock, p_unit_cost: costPrice ? fromCents(costPrice) : null, p_reason: 'Estoque inicial (cadastro)',
    }).then(check)));
  }
  return variants.length;
}

async function categoryIdFor(name) {
  if (!name) return null;
  const found = check(await sb.from('categories').select('id').eq('name', name).maybeSingle());
  if (found) return found.id;
  return check(await sb.from('categories').insert({ name }).select('id').single()).id;
}

const catalog = {
  async meta() {
    const [sizes, colors, categories] = await Promise.all([
      sb.from('sizes').select('code, sort_order').order('sort_order'),
      sb.from('colors').select('id, name, hex').order('name'),
      sb.from('categories').select('id, name').order('name'),
    ]);
    return {
      sizes: check(sizes).map((s) => ({ code: s.code, order: s.sort_order })),
      colors: check(colors),
      categories: check(categories),
    };
  },

  async listProducts() {
    const rows = check(await sb.from('products').select(`
      id, name, brand, reference, cost_price, sale_price, active,
      category:categories(name),
      variants:product_variants(id, size_code, sku, barcode, stock, min_stock, sale_price, cost_price, active,
                                color:colors(name, hex), size:sizes(sort_order))`).order('name'));
    return rows.map((p) => {
      const variants = p.variants.map((v) => ({
        id: v.id, size: v.size_code, sizeOrder: v.size?.sort_order ?? 0, color: v.color?.name ?? '', colorHex: v.color?.hex,
        sku: v.sku, barcode: v.barcode, price: toCents(v.sale_price ?? p.sale_price), cost: toCents(v.cost_price ?? p.cost_price),
        stock: v.stock, minStock: v.min_stock, active: v.active,
      })).sort((a, b) => a.sizeOrder - b.sizeOrder || a.color.localeCompare(b.color));
      return {
        id: p.id, name: p.name, brand: p.brand, category: p.category?.name ?? '', reference: p.reference,
        costPrice: toCents(p.cost_price), salePrice: toCents(p.sale_price), active: p.active, variants,
        minPrice: variants.length ? Math.min(...variants.map((v) => v.price)) : toCents(p.sale_price),
        totalStock: variants.reduce((s, v) => s + v.stock, 0),
      };
    });
  },

  async search(term = '') {
    let q = sb.from('v_pdv_catalog').select('*').order('product_name').limit(400);
    const t = sanitize(term);
    if (t) q = q.or(`product_name.ilike.%${t}%,sku.ilike.%${t}%,barcode.eq.${t},reference.ilike.%${t}%,brand.ilike.%${t}%,category.ilike.%${t}%`);
    return groupCatalogRows(check(await q));
  },

  // Leitor de código de barras / SKU exato
  async findByCode(code) {
    const c = sanitize(code);
    if (!c) return null;
    const row = check(await sb.from('v_pdv_catalog').select('*').or(`barcode.eq.${c},sku.eq.${c}`).limit(1).maybeSingle());
    if (!row) return null;
    const rows = check(await sb.from('v_pdv_catalog').select('*').eq('product_id', row.product_id));
    const [product] = groupCatalogRows(rows);
    const variant = product?.variants.find((v) => v.id === row.variant_id);
    return variant ? { product, variant } : null;
  },

  // Cria o produto e gera a grade (tamanhos × cores). Requer perfil gerente/admin.
  async createProduct({ name, brand, category, reference, costPrice, salePrice, sizes, colors, initialStock = 0, minStock = 2 }) {
    if (!name?.trim()) throw new Error('Informe o nome do produto');
    if (!sizes?.length || !colors?.length) throw new Error('Escolha ao menos um tamanho e uma cor');
    const ref = reference?.trim().toUpperCase() || null;
    const product = check(await sb.from('products').insert({
      name: name.trim(), brand: brand || null, reference: ref, category_id: await categoryIdFor(category),
      cost_price: fromCents(costPrice || 0), sale_price: fromCents(salePrice),
    }).select('id, reference').single());

    await insertVariants(product.id, product.reference || product.id.slice(0, 6).toUpperCase(), sizes, colors, { initialStock, minStock, costPrice });
    return product.id;
  },

  // Só exclui produto nunca vendido (regra na função delete_product do banco)
  async deleteProduct(id) {
    check(await sb.rpc('delete_product', { p_product_id: id }));
  },

  async addVariants(productId, { sizes, colors, initialStock = 0, minStock = 2 }) {
    const p = check(await sb.from('products').select('id, reference, cost_price').eq('id', productId).single());
    return insertVariants(p.id, p.reference || p.id.slice(0, 6).toUpperCase(), sizes, colors,
      { initialStock, minStock, costPrice: toCents(p.cost_price) });
  },

  async createColor({ name, hex }) {
    const { data, error } = await sb.from('colors').insert({ name: name.trim(), hex: hex || null }).select('id, name, hex').single();
    if (error) throw new Error(/duplicate/.test(error.message) ? `A cor ${name.trim()} já existe` : friendly(error.message));
    return data;
  },

  async createSize({ code, order }) {
    const c = code.trim().toUpperCase();
    const { error } = await sb.from('sizes').insert({ code: c, sort_order: order });
    if (error) throw new Error(/duplicate/.test(error.message) ? `O tamanho ${c} já existe` : friendly(error.message));
    return { code: c, order };
  },

  async updateProduct(id, { name, brand, category, reference, costPrice, salePrice, active }) {
    const patch = {};
    if (name !== undefined) patch.name = name.trim();
    if (brand !== undefined) patch.brand = brand || null;
    if (reference !== undefined) patch.reference = reference?.trim().toUpperCase() || null;
    if (costPrice !== undefined) patch.cost_price = fromCents(costPrice);
    if (salePrice !== undefined) patch.sale_price = fromCents(salePrice);
    if (active !== undefined) patch.active = active;
    if (category !== undefined) patch.category_id = await categoryIdFor(category);
    check(await sb.from('products').update(patch).eq('id', id));
  },
};

const stock = {
  async entry({ variantId, quantity, unitCost = null, reason = 'Entrada de mercadoria' }) {
    check(await sb.rpc('register_stock_entry', {
      p_variant_id: variantId, p_quantity: quantity, p_unit_cost: unitCost ? fromCents(unitCost) : null, p_reason: reason,
    }));
  },
  async adjust({ variantId, newStock, reason = 'Ajuste de inventário' }) {
    check(await sb.rpc('adjust_stock', { p_variant_id: variantId, p_new_stock: newStock, p_reason: reason }));
  },
  async setMinStock(variantId, minStock) {
    check(await sb.from('product_variants').update({ min_stock: minStock }).eq('id', variantId));
  },
  async movements({ limit = 100 } = {}) {
    const rows = check(await sb.from('stock_movements').select(`
      id, type, quantity, unit_cost, reason, sale_id, created_at,
      variant:product_variants(sku, size_code, color:colors(name), product:products(name))`)
      .order('created_at', { ascending: false }).limit(limit));
    return rows.map((m) => ({
      id: m.id, type: m.type, quantity: m.quantity, unitCost: m.unit_cost == null ? null : toCents(m.unit_cost),
      reason: m.reason, saleId: m.sale_id, at: m.created_at,
      productName: m.variant?.product?.name ?? '?', size: m.variant?.size_code, color: m.variant?.color?.name, sku: m.variant?.sku,
    }));
  },
};

const cash = {
  async getOpenSession() {
    const s = check(await sb.from('cash_sessions').select('id, opened_at, opening_amount').eq('status', 'aberto').maybeSingle());
    return s && { id: s.id, openedAt: s.opened_at, openingAmount: toCents(s.opening_amount) };
  },
  async openSession(openingCents) {
    check(await sb.rpc('open_cash_session', { p_opening_amount: fromCents(openingCents) }));
    return cash.getOpenSession();
  },
  async summary() {
    const session = await cash.getOpenSession();
    if (!session) return null;
    const [movs, expected] = await Promise.all([
      sb.from('cash_movements').select('*').eq('cash_session_id', session.id).order('created_at', { ascending: false }),
      sb.rpc('cash_session_expected', { p_session_id: session.id }),
    ]);
    return { session, expected: toCents(check(expected)), movements: check(movs).map(mapMovement) };
  },
  async register({ type, amount, description, method = 'dinheiro' }) {
    check(await sb.rpc('register_cash_movement', { p_type: type, p_amount: fromCents(amount), p_description: description, p_method: method }));
  },
  async close({ counted, notes = null }) {
    const r = check(await sb.rpc('close_cash_session', { p_counted_amount: fromCents(counted), p_notes: notes }));
    return { expected: toCents(r.expected), counted: toCents(r.counted), difference: toCents(r.difference) };
  },
  async flow({ from, to }) {
    const rows = check(await sb.from('cash_movements').select('*')
      .gte('created_at', from.toISOString()).lte('created_at', to.toISOString()).order('created_at'));
    return rows.map(mapMovement);
  },
};

const sales = {
  async finalize({ items, payments, discount = 0, customerId = null, notes = null }) {
    return check(await sb.rpc('finalize_sale', {
      p_items: items.map((i) => ({ variant_id: i.variantId, quantity: i.quantity })),
      p_payments: payments.map((p) => ({ method: p.method, amount: fromCents(p.amount) })),
      p_discount: fromCents(discount),
      p_customer_id: customerId,
      p_notes: notes,
    }));
  },
  async getReceipt(saleId) {
    return mapSale(check(await sb.from('sales').select(SALE_SELECT).eq('id', saleId).single()));
  },
  async list({ from, to } = {}) {
    let q = sb.from('sales').select(SALE_SELECT).order('created_at', { ascending: false }).limit(5000);
    if (from) q = q.gte('created_at', from.toISOString());
    if (to) q = q.lte('created_at', to.toISOString());
    return check(await q).map(mapSale);
  },
  async cancel(saleId, reason) {
    check(await sb.rpc('cancel_sale', { p_sale_id: saleId, p_reason: reason }));
  },
};

export default { store, catalog, stock, cash, sales, customers };
