import { CONFIG } from '../config.js';

let client = null;

// Import dinâmico: a biblioteca (js/vendor/supabase.js, embutida no projeto)
// só é carregada quando o Supabase está configurado
export async function getSupabase() {
  if (!client) {
    const { createClient } = await import('../vendor/supabase.js');
    client = createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true },
    });
  }
  return client;
}
