// Gráficos leves em HTML/CSS (sem biblioteca): colunas por período e barras horizontais.
// Uma série por gráfico, cor única validada para os temas claro/escuro (--chart-bar),
// tooltip ao passar o mouse e eixos discretos.
import { escapeHtml as e } from '../core/dom.js';

// Arredonda o topo do eixo para um valor "bonito" (1, 2, 2.5, 5 × 10^n)
export function niceMax(v) {
  if (!(v > 0)) return 1;
  const pow = 10 ** Math.floor(Math.log10(v));
  const n = v / pow;
  const step = [1, 2, 2.5, 5, 10].find((s) => n <= s);
  return step * pow;
}

/**
 * Gráfico de colunas.
 * data: [{ label, value, tooltip? }], format: (valor) => texto do eixo/tooltip
 */
export function columnChart(container, { data, format = String, height = 220, ariaLabel = '' }) {
  if (!data.length || data.every((d) => !d.value)) {
    container.innerHTML = '<div class="empty">Sem dados no período.</div>';
    return;
  }
  const max = niceMax(Math.max(...data.map((d) => d.value)));
  const ticks = [max, max / 2, 0];
  const every = Math.ceil(data.length / 8); // no máximo ~8 rótulos no eixo X
  const pct = (v) => (1 - v / max) * 100;

  container.innerHTML = `
    <div class="flex gap-2" role="img" aria-label="${e(ariaLabel)}">
      <div class="relative shrink-0 text-right text-[11px] text-muted" style="height:${height}px;width:4.25rem">
        ${ticks.map((t) => `<span class="absolute right-0 -translate-y-1/2 whitespace-nowrap" style="top:${pct(t)}%">${e(format(t))}</span>`).join('')}
      </div>
      <div class="min-w-0 flex-1">
        <div class="relative" style="height:${height}px">
          ${ticks.map((t) => `<div class="chart-grid-line" style="top:${pct(t)}%${t === 0 ? ';border-top-style:solid' : ''}"></div>`).join('')}
          <div class="chart-bars relative">
            ${data.map((d, i) => `
              <div class="chart-col" data-i="${i}">
                <div class="chart-bar" style="height:${d.value ? Math.max(1.5, (d.value / max) * 100) : 0}%"></div>
              </div>`).join('')}
          </div>
          <div class="chart-tooltip hidden"></div>
        </div>
        <div class="mt-1.5 flex gap-[2px] text-[10px] text-muted">
          ${data.map((d, i) => `<span class="flex min-w-0 flex-1 justify-center whitespace-nowrap">${i % every === 0 ? e(d.label) : ''}</span>`).join('')}
        </div>
      </div>
    </div>`;

  const tip = container.querySelector('.chart-tooltip');
  const bars = container.querySelector('.chart-bars');
  bars.addEventListener('mousemove', (ev) => {
    const col = ev.target.closest('.chart-col');
    if (!col) return;
    const d = data[Number(col.dataset.i)];
    const bar = col.firstElementChild;
    tip.innerHTML = `<div class="font-semibold">${e(format(d.value))}</div><div class="opacity-80">${e(d.tooltip ?? d.label)}</div>`;
    tip.style.left = `${col.offsetLeft + col.offsetWidth / 2}px`;
    tip.style.top = `${Math.max(0, bar.offsetTop - 6)}px`;
    tip.classList.remove('hidden');
  });
  bars.addEventListener('mouseleave', () => tip.classList.add('hidden'));
}

/**
 * Lista de barras horizontais (ranking). Cada linha tem rótulo e valor em texto,
 * então a informação nunca depende só da cor.
 * data: [{ label, value, sub? }]
 */
export function barList(data, { format = String, emptyText = 'Sem dados no período.' } = {}) {
  if (!data.length) return `<div class="empty">${e(emptyText)}</div>`;
  const max = Math.max(...data.map((d) => d.value)) || 1;
  return `<ul class="space-y-3">
    ${data.map((d) => `
      <li title="${e(d.label)}: ${e(format(d.value))}">
        <div class="flex items-baseline justify-between gap-3 text-sm">
          <span class="truncate">${e(d.label)}</span>
          <span class="shrink-0 font-semibold tabular-nums">${e(format(d.value))}</span>
        </div>
        <div class="hbar-track mt-1.5"><div class="hbar-fill" style="width:${(d.value / max) * 100}%"></div></div>
        ${d.sub ? `<div class="mt-1 text-xs text-muted">${e(d.sub)}</div>` : ''}
      </li>`).join('')}
  </ul>`;
}
