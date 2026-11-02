// Ponto único de acesso a dados. As telas importam `api` e não sabem
// se estão falando com o Supabase ou com o adaptador de demonstração.
//
// Contrato (valores monetários sempre em CENTAVOS; datas em ISO):
//   store.getSettings() · updateSettings(settings)
//   catalog.meta() · listProducts() · search(term) · findByCode(code)
//   catalog.createProduct(input) · updateProduct(id, patch) · deleteProduct(id) · addVariants(id, { sizes, colors, initialStock })
//   catalog.createColor({ name, hex }) · createSize({ code, order })
//   stock.entry({ variantId, quantity, unitCost, reason }) · adjust({ variantId, newStock, reason })
//   stock.setMinStock(variantId, n) · movements({ limit })
//   cash.getOpenSession() · openSession(cents) · summary() · register({ type, amount, description, method })
//   cash.close({ counted, notes }) · flow({ from, to })
//   sales.finalize({ items, payments, discount, customerId }) · getReceipt(id) · list({ from, to }) · cancel(id, reason)
//   customers.list() · search(term) · create(data) · update(id, data) · remove(id) · history(id)
import { DEMO_MODE } from '../config.js';

const adapter = DEMO_MODE
  ? await import('./adapters/demo.adapter.js')
  : await import('./adapters/supabase.adapter.js');

export const api = adapter.default;
export { DEMO_MODE };
