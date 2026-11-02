const STYLES = {
  success: 'bg-emerald-700',
  error: 'bg-rose-700',
  warn: 'bg-amber-700',
  info: 'bg-slate-800 dark:bg-slate-700',
};

export function toast(message, type = 'info', ms = 3500) {
  let root = document.getElementById('toast-root');
  if (!root) {
    root = Object.assign(document.createElement('div'), { id: 'toast-root' });
    document.body.append(root);
  }
  root.className = 'fixed right-4 top-16 z-[100] w-[calc(100%-2rem)] sm:w-auto flex flex-col gap-2 print:hidden';
  const el = document.createElement('div');
  el.className = `${STYLES[type] ?? STYLES.info} max-w-sm rounded-lg px-4 py-3 text-sm text-white shadow-lg transition-opacity`;
  el.textContent = message;
  root.append(el);
  setTimeout(() => { el.style.opacity = '0'; setTimeout(() => el.remove(), 300); }, ms);
}
