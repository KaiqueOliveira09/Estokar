// Casca do sistema: menu hambúrguer, roteamento por hash (#/vendas) e contexto compartilhado.
// Cada tela é um módulo em js/modules/<nome>/ que exporta mount(container, ctx) e
// pode devolver uma função de limpeza, chamada ao sair da tela.
import { api, DEMO_MODE } from './services/api.js';
import { requireSession, signOut, getProfile } from './core/auth.js';
import { initTheme } from './core/theme.js';
import { toast } from './core/toast.js';
import { $, escapeHtml as e } from './core/dom.js';
import { fmtTime } from './core/format.js';

const ICONS = {
  home: 'M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z',
  tag: 'M3 12V4a1 1 0 0 1 1-1h8l9 9-9 9zM7.5 7.5h.01',
  bag: 'M5 8h14l-1 12H6zM9 8V6a3 3 0 0 1 6 0v2',
  box: 'M21 8 12 3 3 8v8l9 5 9-5zM3 8l9 5 9-5M12 13v8',
  receipt: 'M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6M9 16h4',
  users: 'M16 19v-1a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v1M9 10a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM22 19v-1a4 4 0 0 0-3-3.87M16 4.13a3 3 0 0 1 0 5.74',
  wallet: 'M3 7a2 2 0 0 1 2-2h13v4M3 7v11a2 2 0 0 0 2 2h15V9H5a2 2 0 0 1-2-2zM16 14h.01',
  chart: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
  gear: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z',
};

export const ROUTES = {
  inicio: { label: 'Início', icon: 'home', load: () => import('./modules/inicio/inicio.js') },
  catalogo: { label: 'Catálogo', icon: 'tag', load: () => import('./modules/catalogo/catalogo.js') },
  vendas: { label: 'Vendas', icon: 'bag', load: () => import('./modules/vendas/pdv.js') },
  clientes: { label: 'Clientes', icon: 'users', load: () => import('./modules/clientes/clientes.js') },
  estoque: { label: 'Estoque', icon: 'box', load: () => import('./modules/estoque/estoque.js') },
  notas: { label: 'Nota Fiscal', hint: 'Cupons internos', icon: 'receipt', load: () => import('./modules/notas/notas.js') },
  financeiro: { label: 'Financeiro', icon: 'wallet', load: () => import('./modules/financeiro/financeiro.js') },
  relatorio: { label: 'Relatório', hint: 'Gerar dashboard', icon: 'chart', load: () => import('./modules/relatorio/relatorio.js') },
  configuracoes: { label: 'Configurações', hint: 'Dados da loja e cupom', icon: 'gear', load: () => import('./modules/configuracoes/configuracoes.js') },
};
const DEFAULT_ROUTE = 'inicio';

const view = $('#view');
const sidebar = $('#sidebar');
const backdrop = $('#drawer-backdrop');
const menuBtn = $('#menu-toggle');
const desktop = matchMedia('(min-width: 1024px)');

// Contexto entregue a todos os módulos
const ctx = {
  api,
  demo: DEMO_MODE,
  store: null,
  session: null,
  navigate: (route) => { location.hash = `#/${route}`; },
  setSession(session) {
    ctx.session = session;
    renderCashStatus();
  },
};

let cleanup = null;
let navSeq = 0;

// ---------------------------------------------------------------------------
// Menu
// ---------------------------------------------------------------------------
function renderNav() {
  $('#nav').innerHTML = Object.entries(ROUTES).map(([key, r]) => `
    <a href="#/${key}" data-route="${key}" class="nav-link">
      <svg fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><path d="${ICONS[r.icon]}"/></svg>
      <span class="flex min-w-0 flex-col leading-tight">
        <span>${e(r.label)}</span>
        ${r.hint ? `<span class="text-[11px] font-normal opacity-75">${e(r.hint)}</span>` : ''}
      </span>
    </a>`).join('');
}

function readCollapsed() {
  try { return localStorage.getItem('sidebar-collapsed') === '1'; } catch { return false; }
}
function saveCollapsed(v) {
  try { localStorage.setItem('sidebar-collapsed', v ? '1' : '0'); } catch { /* ignora */ }
}

function setDrawer(open) {
  sidebar.classList.toggle('is-open', open);
  backdrop.classList.toggle('hidden', !open);
  menuBtn.setAttribute('aria-expanded', String(open));
}

function toggleMenu() {
  if (desktop.matches) {
    const collapsed = !sidebar.classList.contains('is-collapsed');
    sidebar.classList.toggle('is-collapsed', collapsed);
    menuBtn.setAttribute('aria-expanded', String(!collapsed));
    saveCollapsed(collapsed);
  } else {
    setDrawer(!sidebar.classList.contains('is-open'));
  }
}

function renderCashStatus() {
  const el = $('#cash-status');
  const s = ctx.session;
  el.classList.remove('hidden');
  el.className = `badge ${s ? 'badge-ok' : 'badge-danger'}`;
  el.innerHTML = s ? `<span>Caixa aberto<span class="hidden sm:inline"> · ${fmtTime(s.openedAt)}</span></span>` : 'Caixa fechado';
}

// ---------------------------------------------------------------------------
// Roteamento
// ---------------------------------------------------------------------------
function currentRoute() {
  const key = location.hash.replace(/^#\/?/, '').split('?')[0];
  return ROUTES[key] ? key : DEFAULT_ROUTE;
}

async function navigate() {
  const key = currentRoute();
  const route = ROUTES[key];
  const seq = ++navSeq;

  if (typeof cleanup === 'function') {
    try { cleanup(); } catch (err) { console.error(err); }
  }
  cleanup = null;
  // Fecha janelas abertas pela tela anterior (ex.: link dentro de um modal)
  document.querySelectorAll('[id^="modal-"]').forEach((m) => m.querySelector('[data-close]')?.click());

  document.querySelectorAll('[data-route]').forEach((a) => {
    const active = a.dataset.route === key;
    a.classList.toggle('is-active', active);
    if (active) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
  $('#page-title').textContent = route.label;
  document.title = `${route.label} · Ciboff`;
  if (!desktop.matches) setDrawer(false);

  view.scrollTop = 0;
  view.innerHTML = '<div class="empty">Carregando…</div>';
  try {
    const mod = await route.load();
    if (seq !== navSeq) return; // o usuário já trocou de tela
    // Cada tela recebe um container novo: eventos registrados por uma visita
    // anterior não se acumulam (evita janelas abrindo em dobro)
    const container = document.createElement('div');
    container.className = 'h-full';
    view.replaceChildren(container);
    cleanup = await mod.mount(container, ctx);
  } catch (err) {
    console.error(err);
    view.innerHTML = `<div class="empty">Não foi possível abrir esta tela.<br><span class="text-xs"></span></div>`;
    view.querySelector('.text-xs').textContent = err.message;
  }
}

// ---------------------------------------------------------------------------
// Inicialização
// ---------------------------------------------------------------------------
async function init() {
  initTheme($('#theme-toggle'));
  renderNav();
  if (readCollapsed()) sidebar.classList.add('is-collapsed');
  menuBtn.addEventListener('click', toggleMenu);
  backdrop.addEventListener('click', () => setDrawer(false));
  desktop.addEventListener('change', () => setDrawer(false));
  document.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape' && sidebar.classList.contains('is-open')) setDrawer(false);
  });

  const session = await requireSession();
  if (!DEMO_MODE) {
    ctx.profile = await getProfile(session.user.id).catch(() => null);
    $('#user-email').textContent = session.user.email;
    $('#user-role').textContent = { admin: 'Administradora', gerente: 'Gerente', vendedor: 'Vendedora' }[ctx.profile?.role] ?? '';
    $('#user-box').classList.replace('hidden', 'flex');
    $('#sign-out').addEventListener('click', signOut);
  }
  if (DEMO_MODE) $('#demo-badge').classList.remove('hidden');

  try {
    [ctx.store, ctx.session] = await Promise.all([api.store.getSettings(), api.cash.getOpenSession()]);
  } catch (err) {
    toast(`Erro ao carregar dados: ${err.message}`, 'error', 8000);
    ctx.store = { name: 'Ciboff', receiptWidthMm: 80 };
  }
  renderCashStatus();

  window.addEventListener('hashchange', navigate);
  navigate();
}

init();
