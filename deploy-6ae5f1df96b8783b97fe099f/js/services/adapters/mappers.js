import { toCents } from '../../core/money.js';

// Agrupa linhas da view v_pdv_catalog (uma por variação) em produtos
export function groupCatalogRows(rows) {
  const byProduct = new Map();
  for (const r of rows) {
    if (!byProduct.has(r.product_id)) {
      byProduct.set(r.product_id, {
        id: r.product_id,
        name: r.product_name,
        brand: r.brand,
        category: r.category,
        reference: r.reference,
        variants: [],
      });
    }
    byProduct.get(r.product_id).variants.push(mapVariant(r));
  }
  for (const p of byProduct.values()) {
    p.variants.sort((a, b) => a.sizeOrder - b.sizeOrder || (a.color ?? '').localeCompare(b.color ?? ''));
    p.minPrice = Math.min(...p.variants.map((v) => v.price));
    p.totalStock = p.variants.reduce((s, v) => s + v.stock, 0);
  }
  return [...byProduct.values()];
}

export function mapVariant(r) {
  return {
    id: r.variant_id,
    size: r.size_code,
    sizeOrder: r.size_order ?? 0,
    color: r.color_name,
    colorHex: r.color_hex,
    sku: r.sku,
    barcode: r.barcode,
    price: toCents(r.price),
    stock: r.stock,
    minStock: r.min_stock ?? 0,
  };
}

export function mapStore(s) {
  return {
    name: s?.name ?? 'Ciboff',
    legalName: s?.legal_name ?? '',
    document: s?.document ?? '',
    address: s?.address ?? '',
    phone: s?.phone ?? '',
    instagram: s?.instagram ?? '',
    receiptFooter: s?.receipt_footer ?? '',
    receiptWidthMm: s?.receipt_width_mm ?? 80,
  };
}

// "Rosa Bebê" → ROSBEB, "Preto" → PRE (cores parecidas não geram SKU repetido)
export function colorCode(color) {
  return color.normalize('NFD').replace(/[\u0300-\u036f]/g, '').split(/\s+/).filter(Boolean)
    .map((w) => w.replace(/[^A-Za-z0-9]/g, '').slice(0, 3)).join('').toUpperCase();
}
