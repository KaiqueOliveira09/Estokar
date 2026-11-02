export const PAYMENT_METHODS = {
  dinheiro: 'Dinheiro',
  pix: 'Pix',
  credito: 'Cartão de crédito',
  debito: 'Cartão de débito',
};

export const CASH_TYPES = {
  venda: { label: 'Venda', sign: 1 },
  entrada: { label: 'Entrada avulsa', sign: 1 },
  suprimento: { label: 'Suprimento', sign: 1 },
  saida: { label: 'Despesa', sign: -1 },
  sangria: { label: 'Sangria', sign: -1 },
  estorno: { label: 'Estorno', sign: -1 },
};

export const STOCK_TYPES = {
  entrada: 'Entrada',
  saida_venda: 'Venda',
  estorno_venda: 'Estorno de venda',
  ajuste: 'Ajuste de inventário',
};

// Ordem de exibição dos tamanhos (igual à tabela sizes do banco)
export const SIZE_ORDER = { PP: 10, P: 20, M: 30, G: 40, GG: 50, XG: 60, 34: 90, 36: 100, 38: 110, 40: 120, 42: 130, 44: 140, 46: 150, 48: 160, U: 999 };
