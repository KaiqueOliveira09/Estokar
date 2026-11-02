import { DEMO_MODE } from '../../config.js';
import { signIn } from '../../core/auth.js';
import { $ } from '../../core/dom.js';

const next = new URLSearchParams(location.search).get('next') || 'index.html';
// Só aceita destinos relativos ao próprio site
const safeNext = /^\/?[\w\-/]+\.html$/.test(next) ? next : 'index.html';

if (DEMO_MODE) location.replace(safeNext);

$('#login-form').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const btn = ev.submitter;
  const err = $('#login-error');
  btn.disabled = true;
  err.classList.add('hidden');
  try {
    await signIn($('#email').value.trim(), $('#password').value);
    location.replace(safeNext);
  } catch (e) {
    err.textContent = e.message;
    err.classList.remove('hidden');
  } finally {
    btn.disabled = false;
  }
});
