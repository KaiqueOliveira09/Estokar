// Dados do projeto Supabase da loja (Supabase > Project Settings > API).
// A chave "publishable"/"anon" foi feita para ficar no navegador: a segurança vem das
// regras (RLS) do banco. NUNCA coloque aqui a chave "service_role"/"secret".
// Com SUPABASE_URL vazio o sistema roda em MODO DEMONSTRAÇÃO (dados locais no navegador).
export const CONFIG = {
  SUPABASE_URL: 'https://rcspppndhsahrmdogaiz.supabase.co',
  SUPABASE_ANON_KEY: 'sb_publishable_QEn5KQ7RKvMceUXfXo_arg_hQFAQcvT',
};

export const DEMO_MODE = !CONFIG.SUPABASE_URL;
