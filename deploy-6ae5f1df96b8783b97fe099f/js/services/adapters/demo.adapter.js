// Adaptador de DEMONSTRAÇÃO: simula o backend no navegador (localStorage).
// Replica as regras das funções do Supabase (finalize_sale, cancel_sale, caixa, estoque)
// e gera 30 dias de histórico para que dashboard e relatórios tenham dados.
import { SIZE_ORDER } from '../../shared/constants.js';
import { addDays, startOfDay } from '../../core/format.js';
import { colorCode } from './mappers.js';

const STORAGE_KEY = 'ciboff-demo-v2';

const COLORS = {
  Branco: '#f8fafc', Preto: '#0f172a', Off: '#f3eadb', Nude: '#e6c3b0', Rosa: '#f4a6bd', 'Rosa Bebê': '#f9d3df',
  Dourado: '#c9a24a', Vinho: '#7f1d3a', Azul: '#3b6fd9', 'Jeans Claro': '#93c5fd', Verde: '#4d8b5e', Estampado: '#a86bc9',
};

// [nome, marca, categoria, referência, custo, preço, tamanhos, cores]
const PRODUCTS = [
  ['Blusa Cropped Canelada', 'Ciboff', 'Blusas', 'BLU-001', 19.9, 59.9, ['P', 'M', 'G'], ['Branco', 'Rosa', 'Preto']],
  ['Camisa de Cetim', 'Ciboff', 'Camisas', 'CMS-002', 48, 139.9, ['P', 'M', 'G', 'GG'], ['Off', 'Rosa Bebê', 'Dourado']],
  ['Vestido Midi Floral', 'Flor de Lis', 'Vestidos', 'VES-010', 62, 179.9, ['P', 'M', 'G'], ['Estampado', 'Rosa']],
  ['Vestido Slip Dress', 'Ciboff', 'Vestidos', 'VES-011', 55, 159.9, ['P', 'M', 'G'], ['Preto', 'Vinho', 'Nude']],
  ['Calça Wide Leg Alfaiataria', 'Ciboff', 'Calças', 'CAL-020', 68, 189.9, ['36', '38', '40', '42', '44'], ['Off', 'Preto']],
  ['Calça Jeans Mom', 'Denim Co', 'Calças', 'CAL-021', 64, 169.9, ['36', '38', '40', '42'], ['Azul', 'Jeans Claro']],
  ['Saia Midi Plissada', 'Ciboff', 'Saias', 'SAI-030', 42, 129.9, ['P', 'M', 'G'], ['Dourado', 'Rosa Bebê', 'Preto']],
  ['Short Linho', 'Ciboff', 'Shorts', 'SHO-040', 33, 99.9, ['36', '38', '40', '42'], ['Off', 'Verde']],
  ['Blazer Alongado', 'Alfaiataria', 'Blazers', 'BLZ-050', 110, 289.9, ['P', 'M', 'G'], ['Nude', 'Preto']],
  ['Conjunto Tricot', 'Ciboff', 'Conjuntos', 'CON-060', 85, 229.9, ['P', 'M', 'G'], ['Rosa', 'Off']],
  ['Body Decote V', 'Ciboff', 'Blusas', 'BOD-070', 22, 69.9, ['P', 'M', 'G'], ['Preto', 'Nude', 'Branco']],
  ['Bolsa Mini Matelassê', 'Ciboff', 'Acessórios', 'ACE-080', 45, 149.9, ['U'], ['Rosa Bebê', 'Dourado', 'Preto']],
];

const cents = (v) => Math.round(v * 100);
const uid = () => crypto.randomUUID();

// PRNG determinístico: a demonstração gera sempre o mesmo histórico
function mulberry32(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------
// Regras de negócio (compartilhadas entre o histórico gerado e o PDV)
// ---------------------------------------------------------------------------
function variantView(v) {
  const p = db.products.find((x) => x.id === v.productId);
  return { v, p };
}

function createSale({ items, payments, discount = 0, notes = null, customerId = null, at = new Date(), session, operator = 'Operador Demo' }) {
  if (!session) throw new Error('Nenhum caixa aberto. Abra o caixa antes de vender.');
  if (!items?.length) throw new Error('A venda não possui itens');
  if (!payments?.length) throw new Error('Informe ao menos uma forma de pagamento');
  const customer = customerId ? db.customers.find((c) => c.id === customerId) : null;
  if (customerId && !customer) throw new Error('Cliente não encontrado');

  const qtyByVariant = new Map();
  items.forEach((i) => qtyByVariant.set(i.variantId, (qtyByVariant.get(i.variantId) ?? 0) + i.quantity));

  // Valida tudo antes de alterar qualquer coisa (atomicidade)
  const lines = [...qtyByVariant].map(([variantId, qty]) => {
    const v = db.variants.find((x) => x.id === variantId);
    if (!v) throw new Error('Um ou mais produtos da venda não foram encontrados');
    const { p } = variantView(v);
    if (!v.active || !p.active) throw new Error(`O SKU ${v.sku} está inativo`);
    if (qty <= 0) throw new Error(`Quantidade inválida para o SKU ${v.sku}`);
    if (v.stock < qty) throw new Error(`Estoque insuficiente: ${p.name} (${v.size} / ${v.color}). Disponível: ${v.stock}`);
    return { v, p, qty, unitPrice: v.salePrice ?? p.salePrice, unitCost: v.costPrice ?? p.costPrice };
  });

  const subtotal = lines.reduce((s, l) => s + l.unitPrice * l.qty, 0);
  if (discount < 0 || discount > subtotal) throw new Error('Desconto inválido');
  const total = subtotal - discount;
  const paid = payments.reduce((s, p) => s + p.amount, 0);
  const cashPaid = payments.filter((p) => p.method === 'dinheiro').reduce((s, p) => s + p.amount, 0);
  if (paid < total) throw new Error('Pagamento insuficiente');
  const change = paid - total;
  if (change > cashPaid) throw new Error('Troco só é permitido sobre pagamento em dinheiro');

  const createdAt = new Date(at).toISOString();
  const sale = {
    id: uid(),
    number: db.nextSaleNumber++,
    sessionId: session.id,
    createdAt,
    status: 'concluida',
    operator,
    customerId: customer?.id ?? null,
    customer: customer ? { id: customer.id, name: customer.name, cpf: customer.cpf } : null,
    notes,
    items: lines.map(({ v, p, qty, unitPrice, unitCost }) => ({
      variantId: v.id, name: p.name, size: v.size, color: v.color, sku: v.sku, category: p.category,
      qty, unitPrice, unitCost, total: unitPrice * qty,
    })),
    payments: payments.map((p) => ({ method: p.method, amount: p.amount })),
    subtotal, discount, total, paid, change,
  };

  lines.forEach(({ v, qty, unitCost }) => addStockMovement({ variantId: v.id, type: 'saida_venda', quantity: -qty, unitCost, reason: `Venda #${sale.number}`, saleId: sale.id, at: createdAt }));

  const byMethod = {};
  payments.forEach((p) => { byMethod[p.method] = (byMethod[p.method] ?? 0) + p.amount; });
  Object.entries(byMethod).forEach(([method, amount]) => {
    const net = method === 'dinheiro' ? amount - change : amount;
    if (net > 0) db.cashMovements.push({ id: uid(), sessionId: session.id, type: 'venda', method, amount: net, description: `Venda #${sale.number}`, saleId: sale.id, at: createdAt });
  });

  db.sales.push(sale);
  return sale;
}

function addStockMovement({ variantId, type, quantity, unitCost = null, reason = '', saleId = null, at = new Date().toISOString() }) {
  const v = db.variants.find((x) => x.id === variantId);
  if (!v) throw new Error('Variação não encontrada');
  if (v.stock + quantity < 0) throw new Error('Estoque não pode ficar negativo');
  v.stock += quantity;
  db.stockMovements.push({ id: uid(), variantId, type, quantity, unitCost, reason, saleId, at });
}

function expectedCash(session) {
  const signed = { venda: 1, entrada: 1, suprimento: 1, saida: -1, sangria: -1, estorno: -1 };
  return session.openingAmount + db.cashMovements
    .filter((m) => m.sessionId === session.id && m.method === 'dinheiro')
    .reduce((s, m) => s + signed[m.type] * m.amount, 0);
}

// ---------------------------------------------------------------------------
// Dados iniciais + histórico de 30 dias
// ---------------------------------------------------------------------------
function seed() {
  db = {
    store: {
      name: 'Ciboff',
      legal_name: '',
      document: '',
      address: '',
      phone: '',
      instagram: '@ciboff',
      receipt_footer: 'Obrigada pela preferência! Trocas em até 30 dias com este comprovante e a etiqueta.',
      receipt_width_mm: 80,
    },
    categories: [...new Set(PRODUCTS.map((p) => p[2]))].sort(),
    products: [],
    variants: [],
    sessions: [],
    sales: [],
    stockMovements: [],
    cashMovements: [],
    nextSaleNumber: 1,
    customers: seedCustomers(),
  };

  let n = 0;
  PRODUCTS.forEach(([name, brand, category, reference, cost, price, sizes, colors]) => {
    const productId = uid();
    db.products.push({ id: productId, name, brand, category, reference, costPrice: cents(cost), salePrice: cents(price), active: true, createdAt: addDays(new Date(), -40).toISOString() });
    sizes.forEach((size) => colors.forEach((color) => {
      n += 1;
      const id = uid();
      db.variants.push({
        id, productId, size, color, sku: makeSku(reference, size, color), barcode: `789${String(n).padStart(10, '0')}`,
        costPrice: null, salePrice: null, stock: 0, minStock: 2, active: true,
      });
      addStockMovement({ variantId: id, type: 'entrada', quantity: 6 + ((n * 7) % 7), unitCost: cents(cost), reason: 'Estoque inicial', at: addDays(new Date(), -35).toISOString() });
    }));
  });

  const rnd = mulberry32(20261030);
  const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
  const methodPick = () => { const r = rnd(); return r < 0.38 ? 'pix' : r < 0.68 ? 'credito' : r < 0.83 ? 'debito' : 'dinheiro'; };
  const expenses = ['Embalagens e sacolas', 'Material de limpeza', 'Café e copa', 'Etiquetas', 'Motoboy'];
  const now = new Date();

  for (let back = 29; back >= 0; back -= 1) {
    const day = startOfDay(addDays(now, -back));
    if (day.getDay() === 0) continue; // domingo fechado
    const isToday = back === 0;
    const open = new Date(day); open.setHours(9, 0, 0, 0);
    if (isToday && now < open) break;

    const session = { id: uid(), openedAt: open.toISOString(), openingAmount: 15000, status: 'aberto' };
    db.sessions.push(session);

    const weekendBoost = day.getDay() === 6 ? 3 : day.getDay() === 5 ? 2 : 0;
    const salesToday = 2 + Math.floor(rnd() * 4) + weekendBoost;
    const lastHour = isToday ? Math.min(19, now.getHours() - 1) : 19;
    const times = Array.from({ length: salesToday }, () => {
      const t = new Date(day);
      t.setHours(10 + Math.floor(rnd() * Math.max(1, lastHour - 9)), Math.floor(rnd() * 60), 0, 0);
      return t;
    }).filter((t) => !isToday || t < now).sort((a, b) => a - b);

    for (const at of times) {
      const lines = [];
      const itemCount = 1 + Math.floor(rnd() * rnd() * 3.5);
      for (let k = 0; k < itemCount; k += 1) {
        const v = pick(db.variants.filter((x) => x.stock > 2));
        if (v && !lines.some((l) => l.variantId === v.id)) lines.push({ variantId: v.id, quantity: rnd() < 0.12 ? 2 : 1 });
      }
      if (!lines.length) continue;
      const subtotal = lines.reduce((s, l) => {
        const v = db.variants.find((x) => x.id === l.variantId);
        return s + db.products.find((p) => p.id === v.productId).salePrice * l.quantity;
      }, 0);
      const discount = rnd() < 0.15 ? Math.round(subtotal * (rnd() < 0.5 ? 0.05 : 0.1)) : 0;
      const total = subtotal - discount;
      const method = methodPick();
      let payments;
      if (method === 'dinheiro') {
        const paidUp = Math.ceil(total / 5000) * 5000; // cliente paga com notas de 50
        payments = [{ method, amount: rnd() < 0.5 ? total : paidUp }];
      } else if (rnd() < 0.1 && total > 10000) {
        payments = [{ method: 'pix', amount: 5000 }, { method, amount: total - 5000 }];
      } else {
        payments = [{ method, amount: total }];
      }
      const customerId = rnd() < 0.45 ? pick(db.customers).id : null;
      createSale({ items: lines, payments, discount, customerId, at, session, operator: pick(['Ana', 'Bianca', 'Carla']) });
    }

    if (rnd() < 0.3) {
      const at = new Date(day); at.setHours(15, 30);
      if (!isToday || at < now) db.cashMovements.push({ id: uid(), sessionId: session.id, type: 'saida', method: 'dinheiro', amount: cents(15 + Math.floor(rnd() * 60)), description: pick(expenses), saleId: null, at: at.toISOString() });
    }

    if (!isToday) {
      const close = new Date(day); close.setHours(19, 30);
      const exp = expectedCash(session);
      if (exp > 40000) {
        db.cashMovements.push({ id: uid(), sessionId: session.id, type: 'sangria', method: 'dinheiro', amount: exp - 15000, description: 'Depósito bancário', saleId: null, at: close.toISOString() });
      }
      Object.assign(session, { status: 'fechado', closedAt: close.toISOString(), expected: expectedCash(session), counted: expectedCash(session) });
    }
  }

  // Reposição de alguns itens no meio do mês (aparece no histórico de estoque)
  db.variants.filter((v) => v.stock <= 2).slice(0, 6).forEach((v) => {
    addStockMovement({ variantId: v.id, type: 'entrada', quantity: 4, reason: 'Reposição fornecedor', at: addDays(now, -12).toISOString() });
  });

  return db;
}

// Gera um CPF fictício com dígitos verificadores corretos (apenas para a demonstração)
function fakeCpf(rnd) {
  const d = Array.from({ length: 9 }, () => Math.floor(rnd() * 10));
  const dv = (arr) => { const r = (arr.reduce((s, n, i) => s + n * (arr.length + 1 - i), 0) * 10) % 11; return r === 10 ? 0 : r; };
  d.push(dv(d));
  d.push(dv(d));
  return d.join('');
}

function seedCustomers() {
  const rnd = mulberry32(7);
  const now = new Date();
  const names = ['Mariana Alves', 'Juliana Costa', 'Fernanda Lima', 'Patrícia Souza', 'Camila Rocha',
    'Beatriz Martins', 'Larissa Gomes', 'Renata Ferreira', 'Aline Barbosa', 'Gabriela Nunes'];
  return names.map((name, i) => {
    // Duas aniversariantes no mês atual, para a demonstração
    const month = i < 2 ? now.getMonth() + 1 : 1 + Math.floor(rnd() * 12);
    const day = i === 0 ? now.getDate() : 1 + Math.floor(rnd() * 28);
    const year = 1975 + Math.floor(rnd() * 30);
    const first = name.split(' ')[0].normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    return {
      id: uid(),
      name,
      cpf: i % 4 === 3 ? null : fakeCpf(rnd),
      phone: `119${String(Math.floor(10000000 + rnd() * 89999999))}`,
      email: i % 3 === 2 ? null : `${first}.exemplo${i + 1}@email.com`,
      birthDate: `${year}-${String(month).padStart(2, '0')}-${String(Math.min(day, 28)).padStart(2, '0')}`,
      notes: null,
      createdAt: addDays(now, -60 + i).toISOString(),
    };
  });
}

function makeSku(reference, size, color) {
  return `${reference}-${size}-${colorCode(color)}`;
}

let db;
function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const saved = JSON.parse(raw);
      saved.customers ??= seedCustomers(); // dados salvos antes da aba Clientes
      return saved;
    }
  } catch { /* storage indisponível: segue em memória */ }
  return seed();
}
db = load();
persist();

function persist() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(db)); } catch { /* ignora */ }
}

const delay = (ms = 100) => new Promise((r) => setTimeout(r, ms));
const norm = (s) => String(s ?? '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
const clone = (x) => structuredClone(x);
const openSession = () => db.sessions.find((s) => s.status === 'aberto') ?? null;

function toProduct(p) {
  const variants = db.variants.filter((v) => v.productId === p.id).map((v) => ({
    id: v.id, size: v.size, sizeOrder: sizeOrder(v.size), color: v.color, colorHex: colorHex(v.color),
    sku: v.sku, barcode: v.barcode, price: v.salePrice ?? p.salePrice, cost: v.costPrice ?? p.costPrice,
    stock: v.stock, minStock: v.minStock, active: v.active,
  })).sort((a, b) => a.sizeOrder - b.sizeOrder || a.color.localeCompare(b.color));
  return {
    id: p.id, name: p.name, brand: p.brand, category: p.category, reference: p.reference,
    costPrice: p.costPrice, salePrice: p.salePrice, active: p.active, variants,
    minPrice: variants.length ? Math.min(...variants.map((v) => v.price)) : p.salePrice,
    totalStock: variants.reduce((s, v) => s + v.stock, 0),
  };
}

// Tamanhos e cores criados pela loja ficam no db (além da lista padrão)
const sizeOrder = (code) => SIZE_ORDER[code] ?? db.extraSizes?.[code] ?? 500;
const colorHex = (name) => db.extraColors?.[name] ?? COLORS[name] ?? '#cccccc';

function insertVariants(p, sizes, colors, { initialStock = 0, minStock = 2 } = {}) {
  let created = 0;
  for (const size of sizes) {
    for (const color of colors) {
      if (db.variants.some((v) => v.productId === p.id && v.size === size && v.color === color)) continue;
      const id = uid();
      const sku = makeSku(p.reference, size, color);
      if (db.variants.some((v) => v.sku === sku)) throw new Error(`O SKU ${sku} já existe`);
      db.variants.push({ id, productId: p.id, size, color, sku, barcode: `200${String(Date.now()).slice(-7)}${String(db.variants.length).padStart(3, '0')}`, costPrice: null, salePrice: null, stock: 0, minStock, active: true });
      if (initialStock > 0) addStockMovement({ variantId: id, type: 'entrada', quantity: initialStock, unitCost: p.costPrice, reason: 'Estoque inicial (cadastro)' });
      created += 1;
    }
  }
  return created;
}

function sessionView(s) {
  return s && { id: s.id, openedAt: s.openedAt, openingAmount: s.openingAmount };
}

// ---------------------------------------------------------------------------
// API pública (mesmo contrato do supabase.adapter.js)
// ---------------------------------------------------------------------------
const store = {
  async getSettings() {
    const s = db.store;
    return {
      name: s.name, legalName: s.legal_name, document: s.document, address: s.address, phone: s.phone,
      instagram: s.instagram, receiptFooter: s.receipt_footer, receiptWidthMm: s.receipt_width_mm,
    };
  },
  async updateSettings(v) {
    Object.assign(db.store, {
      name: v.name, legal_name: v.legalName, document: v.document, address: v.address, phone: v.phone,
      instagram: v.instagram, receipt_footer: v.receiptFooter, receipt_width_mm: v.receiptWidthMm,
    });
    persist();
    return store.getSettings();
  },
};

const catalog = {
  async meta() {
    return {
      sizes: Object.entries({ ...SIZE_ORDER, ...db.extraSizes }).map(([code, order]) => ({ code, order })).sort((a, b) => a.order - b.order),
      colors: Object.entries({ ...COLORS, ...db.extraColors }).map(([name, hex]) => ({ id: name, name, hex })),
      categories: db.categories.map((name) => ({ id: name, name })),
    };
  },

  async listProducts() {
    await delay();
    return db.products.map(toProduct).sort((a, b) => a.name.localeCompare(b.name));
  },

  // Busca para o PDV (apenas produtos ativos)
  async search(term = '') {
    await delay();
    const t = norm(term.trim());
    return db.products.filter((p) => p.active).map(toProduct).filter((p) => !t
      || norm(p.name).includes(t) || norm(p.reference).includes(t) || norm(p.brand).includes(t) || norm(p.category).includes(t)
      || p.variants.some((v) => norm(v.sku).includes(t) || v.barcode === term.trim()))
      .map((p) => ({ ...p, variants: p.variants.filter((v) => v.active) }))
      .sort((a, b) => a.name.localeCompare(b.name));
  },

  async findByCode(code) {
    const c = code.trim().toUpperCase();
    const v = db.variants.find((x) => x.active && (x.barcode === c || x.sku.toUpperCase() === c));
    if (!v) return null;
    const product = toProduct(db.products.find((p) => p.id === v.productId));
    return { product, variant: product.variants.find((x) => x.id === v.id) };
  },

  async createProduct({ name, brand, category, reference, costPrice, salePrice, sizes, colors, initialStock = 0, minStock = 2 }) {
    await delay();
    if (!name?.trim()) throw new Error('Informe o nome do produto');
    if (!(salePrice > 0)) throw new Error('Informe o preço de venda');
    if (!sizes?.length || !colors?.length) throw new Error('Escolha ao menos um tamanho e uma cor');
    const ref = (reference?.trim() || `REF-${String(db.products.length + 1).padStart(3, '0')}`).toUpperCase();
    if (db.products.some((p) => p.reference === ref)) throw new Error(`Já existe um produto com a referência ${ref}`);
    if (category && !db.categories.includes(category)) db.categories.push(category);

    const productId = uid();
    db.products.push({ id: productId, name: name.trim(), brand: brand?.trim() || '', category: category || '', reference: ref, costPrice: costPrice || 0, salePrice, active: true, createdAt: new Date().toISOString() });
    insertVariants(db.products.at(-1), sizes, colors, { initialStock, minStock });
    persist();
    return productId;
  },

  // Só exclui produto nunca vendido (mesma regra da função delete_product do banco)
  async deleteProduct(id) {
    const variantIds = new Set(db.variants.filter((v) => v.productId === id).map((v) => v.id));
    if (db.sales.some((s) => s.items.some((i) => variantIds.has(i.variantId)))) {
      throw new Error('Este produto já tem vendas registradas e não pode ser excluído. Para tirá-lo do caixa, edite e desmarque "Produto ativo".');
    }
    db.stockMovements = db.stockMovements.filter((m) => !variantIds.has(m.variantId));
    db.variants = db.variants.filter((v) => v.productId !== id);
    db.products = db.products.filter((p) => p.id !== id);
    persist();
  },

  // Acrescenta tamanhos/cores a um produto existente (só cria as combinações que faltam)
  async addVariants(productId, { sizes, colors, initialStock = 0, minStock = 2 }) {
    const p = db.products.find((x) => x.id === productId);
    if (!p) throw new Error('Produto não encontrado');
    const created = insertVariants(p, sizes, colors, { initialStock, minStock });
    persist();
    return created;
  },

  async createColor({ name, hex }) {
    const n = name?.trim();
    if (!n) throw new Error('Informe o nome da cor');
    const all = { ...COLORS, ...db.extraColors };
    if (Object.keys(all).some((c) => norm(c) === norm(n))) throw new Error(`A cor ${n} já existe`);
    db.extraColors = { ...db.extraColors, [n]: hex || '#cccccc' };
    persist();
    return { id: n, name: n, hex: hex || '#cccccc' };
  },

  async createSize({ code, order }) {
    const c = code?.trim().toUpperCase();
    if (!c) throw new Error('Informe o tamanho');
    if (c in SIZE_ORDER || c in (db.extraSizes ?? {})) throw new Error(`O tamanho ${c} já existe`);
    db.extraSizes = { ...db.extraSizes, [c]: order };
    persist();
    return { code: c, order };
  },

  async updateProduct(id, { name, brand, category, reference, costPrice, salePrice, active }) {
    const p = db.products.find((x) => x.id === id);
    if (!p) throw new Error('Produto não encontrado');
    if (category && !db.categories.includes(category)) db.categories.push(category);
    Object.assign(p, {
      name: name?.trim() || p.name, brand: brand ?? p.brand, category: category ?? p.category,
      reference: reference?.trim().toUpperCase() || p.reference,
      costPrice: costPrice ?? p.costPrice, salePrice: salePrice ?? p.salePrice, active: active ?? p.active,
    });
    persist();
  },
};

const stock = {
  async entry({ variantId, quantity, unitCost = null, reason = 'Entrada de mercadoria' }) {
    if (!(quantity > 0)) throw new Error('Quantidade deve ser maior que zero');
    addStockMovement({ variantId, type: 'entrada', quantity, unitCost, reason });
    if (unitCost) db.variants.find((v) => v.id === variantId).costPrice = unitCost;
    persist();
  },
  async adjust({ variantId, newStock, reason = 'Ajuste de inventário' }) {
    const v = db.variants.find((x) => x.id === variantId);
    if (!v) throw new Error('Variação não encontrada');
    if (!(newStock >= 0)) throw new Error('Estoque não pode ser negativo');
    if (newStock !== v.stock) addStockMovement({ variantId, type: 'ajuste', quantity: newStock - v.stock, reason });
    persist();
  },
  async setMinStock(variantId, minStock) {
    const v = db.variants.find((x) => x.id === variantId);
    if (v) v.minStock = Math.max(0, minStock | 0);
    persist();
  },
  async movements({ limit = 100 } = {}) {
    await delay();
    return db.stockMovements.slice(-limit).reverse().map((m) => {
      const v = db.variants.find((x) => x.id === m.variantId);
      const p = v && db.products.find((x) => x.id === v.productId);
      return { ...m, productName: p?.name ?? '?', size: v?.size, color: v?.color, sku: v?.sku };
    });
  },
};

const cash = {
  async getOpenSession() {
    return sessionView(openSession());
  },
  async openSession(openingCents) {
    if (openSession()) throw new Error('Já existe um caixa aberto');
    const s = { id: uid(), openedAt: new Date().toISOString(), openingAmount: openingCents || 0, status: 'aberto' };
    db.sessions.push(s);
    persist();
    return sessionView(s);
  },
  async summary() {
    const s = openSession();
    if (!s) return null;
    const movements = db.cashMovements.filter((m) => m.sessionId === s.id).slice().reverse();
    return { session: sessionView(s), expected: expectedCash(s), movements: clone(movements) };
  },
  async register({ type, amount, description, method = 'dinheiro' }) {
    const s = openSession();
    if (!s) throw new Error('Nenhum caixa aberto');
    if (['venda', 'estorno'].includes(type)) throw new Error('Vendas e estornos são lançados automaticamente');
    if (!(amount > 0)) throw new Error('Informe um valor maior que zero');
    if (['sangria', 'saida'].includes(type) && method === 'dinheiro' && amount > expectedCash(s)) {
      throw new Error('Valor maior que o dinheiro disponível na gaveta');
    }
    db.cashMovements.push({ id: uid(), sessionId: s.id, type, method, amount, description, saleId: null, at: new Date().toISOString() });
    persist();
  },
  async close({ counted, notes = '' }) {
    const s = openSession();
    if (!s) throw new Error('Nenhum caixa aberto');
    const expected = expectedCash(s);
    Object.assign(s, { status: 'fechado', closedAt: new Date().toISOString(), expected, counted, notes });
    persist();
    return { expected, counted, difference: counted - expected };
  },
  // Todas as movimentações do período (fluxo de caixa)
  async flow({ from, to }) {
    await delay();
    return clone(db.cashMovements.filter((m) => { const t = new Date(m.at); return t >= from && t <= to; }));
  },
};

const sales = {
  async finalize({ items, payments, discount = 0, customerId = null, notes = null }) {
    await delay(250);
    const sale = createSale({ items, payments, discount, customerId, notes, session: openSession() });
    persist();
    return sale.id;
  },
  async getReceipt(saleId) {
    const sale = db.sales.find((s) => s.id === saleId);
    if (!sale) throw new Error('Venda não encontrada');
    return clone(sale);
  },
  async list({ from, to } = {}) {
    await delay();
    return clone(db.sales.filter((s) => {
      const t = new Date(s.createdAt);
      return (!from || t >= from) && (!to || t <= to);
    })).reverse();
  },
  async cancel(saleId, reason) {
    const sale = db.sales.find((s) => s.id === saleId);
    if (!sale) throw new Error('Venda não encontrada');
    if (sale.status === 'cancelada') throw new Error('Venda já cancelada');
    const s = openSession();
    if (!s) throw new Error('Abra o caixa para registrar o estorno');
    sale.items.forEach((i) => addStockMovement({ variantId: i.variantId, type: 'estorno_venda', quantity: i.qty, unitCost: i.unitCost, reason: `Cancelamento venda #${sale.number}`, saleId }));
    db.cashMovements.filter((m) => m.saleId === saleId && m.type === 'venda').forEach((m) => {
      db.cashMovements.push({ id: uid(), sessionId: s.id, type: 'estorno', method: m.method, amount: m.amount, description: `Estorno venda #${sale.number}`, saleId, at: new Date().toISOString() });
    });
    Object.assign(sale, { status: 'cancelada', canceledAt: new Date().toISOString(), cancelReason: reason });
    persist();
  },
};

function customerStats(c) {
  const bought = db.sales.filter((s) => s.customerId === c.id && s.status !== 'cancelada');
  return {
    ...c,
    purchases: bought.length,
    totalSpent: bought.reduce((sum, s) => sum + s.total, 0),
    lastPurchase: bought.length ? bought[bought.length - 1].createdAt : null,
  };
}

function validateCustomer(data, id = null) {
  if (!data.name?.trim()) throw new Error('Informe o nome do cliente');
  if (data.cpf && db.customers.some((c) => c.cpf === data.cpf && c.id !== id)) {
    throw new Error('Já existe um cliente cadastrado com este CPF');
  }
}

const customers = {
  async list() {
    await delay();
    return db.customers.map(customerStats).sort((a, b) => a.name.localeCompare(b.name));
  },
  async search(term = '') {
    const t = norm(term.trim());
    const digits = term.replace(/\D/g, '');
    return db.customers.filter((c) => !t || norm(c.name).includes(t) || norm(c.email).includes(t)
      || (digits.length >= 3 && ((c.cpf ?? '').includes(digits) || (c.phone ?? '').includes(digits))))
      .sort((a, b) => a.name.localeCompare(b.name)).slice(0, 20).map(clone);
  },
  async create(data) {
    validateCustomer(data);
    const c = { id: uid(), ...data, name: data.name.trim(), createdAt: new Date().toISOString() };
    db.customers.push(c);
    persist();
    return customerStats(c);
  },
  async update(id, data) {
    const c = db.customers.find((x) => x.id === id);
    if (!c) throw new Error('Cliente não encontrado');
    validateCustomer(data, id);
    Object.assign(c, data, { name: data.name.trim() });
    // O nome nos cupons já emitidos não muda (é o registro da época), só o vínculo continua
    persist();
    return customerStats(c);
  },
  async remove(id) {
    db.customers = db.customers.filter((c) => c.id !== id);
    db.sales.forEach((s) => { if (s.customerId === id) s.customerId = null; });
    persist();
  },
  async history(id) {
    await delay();
    return clone(db.sales.filter((s) => s.customerId === id)).reverse();
  },
};

// Recomeçar a demonstração: no console, rode `resetDemo()`
globalThis.resetDemo = () => {
  seed();
  persist();
  location.reload();
};

export default { store, catalog, stock, cash, sales, customers };
