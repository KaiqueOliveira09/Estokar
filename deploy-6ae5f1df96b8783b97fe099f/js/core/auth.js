import { DEMO_MODE } from '../config.js';
import { getSupabase } from './supabase.js';

export async function requireSession() {
  if (DEMO_MODE) return { user: { id: 'demo', email: 'demo@loja.local' } };
  const sb = await getSupabase();
  const { data } = await sb.auth.getSession();
  if (!data.session) {
    location.href = `login.html?next=${encodeURIComponent(location.pathname.split('/').pop() || 'index.html')}`;
    return new Promise(() => {}); // interrompe a inicialização da página
  }
  return data.session;
}

export async function signIn(email, password) {
  const sb = await getSupabase();
  const { error } = await sb.auth.signInWithPassword({ email, password });
  if (error) throw new Error(error.message === 'Invalid login credentials' ? 'E-mail ou senha inválidos' : error.message);
}

// Perfil (nome e papel: admin, gerente ou vendedor) do usuário logado
export async function getProfile(userId) {
  const sb = await getSupabase();
  const { data, error } = await sb.from('profiles').select('full_name, role').eq('id', userId).maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

export async function signOut() {
  if (DEMO_MODE) return;
  const sb = await getSupabase();
  await sb.auth.signOut();
  location.href = 'login.html';
}
