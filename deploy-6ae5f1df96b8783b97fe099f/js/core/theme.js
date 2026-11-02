const KEY = 'theme';

function read() {
  try { return localStorage.getItem(KEY); } catch { return null; }
}

export function applyTheme(theme) {
  document.documentElement.classList.toggle('dark', theme === 'dark');
  try { localStorage.setItem(KEY, theme); } catch { /* storage indisponível */ }
}

export function initTheme(toggleButton) {
  const preferred = read() ?? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  applyTheme(preferred);
  toggleButton?.addEventListener('click', () => {
    applyTheme(document.documentElement.classList.contains('dark') ? 'light' : 'dark');
  });
}
