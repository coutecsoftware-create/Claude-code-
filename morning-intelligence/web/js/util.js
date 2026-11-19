// Utilitários do frontend. Todo texto vindo das fontes entra no DOM via textContent (nunca innerHTML).

const SVG_NS = 'http://www.w3.org/2000/svg';
const SVG_TAGS = new Set(['svg', 'path', 'circle', 'line', 'polyline', 'rect', 'g', 'defs', 'linearGradient', 'stop']);

export function h(tag, attrs, ...children) {
  const el = SVG_TAGS.has(tag) ? document.createElementNS(SVG_NS, tag) : document.createElement(tag);
  for (const [k, v] of Object.entries(attrs ?? {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.setAttribute('class', v);
    else if (k === 'style' && typeof v === 'object') for (const [sk, sv] of Object.entries(v)) { if (sk.startsWith('--')) el.style.setProperty(sk, String(sv)); else el.style[sk] = sv; }
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  append(el, children);
  return el;
}

function append(el, children) {
  for (const c of children) {
    if (c == null || c === false) continue;
    if (Array.isArray(c)) append(el, c);
    else el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}

export function safeHref(u) {
  try {
    const url = new URL(u);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null;
  } catch { return null; }
}

export function extLink(href, children, cls) {
  const safe = safeHref(href);
  if (!safe) return h('span', { class: cls }, children);
  return h('a', { href: safe, target: '_blank', rel: 'noopener noreferrer', class: cls }, children);
}

// Relógio do servidor: corrige diferença entre o horário do navegador e o do servidor.
let skew = 0;
export const clock = {
  sync(serverIso) { const t = Date.parse(serverIso); if (Number.isFinite(t)) skew = t - Date.now(); },
  now() { return Date.now() + skew; },
};

const rtf = new Intl.RelativeTimeFormat('pt-BR', { numeric: 'auto', style: 'short' });
export function ago(iso, now = clock.now()) {
  const t = Date.parse(iso ?? '');
  if (!Number.isFinite(t)) return '—';
  const s = Math.round((t - now) / 1000);
  const a = Math.abs(s);
  if (a < 45) return 'agora';
  if (a < 3600) return rtf.format(Math.round(s / 60), 'minute');
  if (a < 86400) return rtf.format(Math.round(s / 3600), 'hour');
  return rtf.format(Math.round(s / 86400), 'day');
}

export function fmtTime(iso, tz, opts = {}) {
  const t = Date.parse(iso ?? '');
  if (!Number.isFinite(t)) return '—';
  return new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: tz, ...opts }).format(t);
}

export function fmtDateTime(iso, tz) {
  const t = Date.parse(iso ?? '');
  if (!Number.isFinite(t)) return '—';
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: tz }).format(t);
}

export const fmtNum = (v, d = 2) => (v == null ? '—' : v.toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d }));
export const fmtPct = (v) => (v == null ? '—' : `${v > 0 ? '+' : ''}${fmtNum(v, 2)}%`);
export const trend = (v) => (v == null || Math.abs(v) < 0.005 ? 'flat' : v > 0 ? 'up' : 'down');

export function isSameLocalDay(iso, tz, now = clock.now()) {
  const f = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' });
  return f.format(Date.parse(iso)) === f.format(now);
}

let toastTimer;
export function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 3200);
}

export async function api(path, opts = {}) {
  const res = await fetch(path, { ...opts, headers: { 'content-type': 'application/json', ...(opts.headers ?? {}) } });
  const body = await res.json().catch(() => ({}));
  if (!res.ok && res.status !== 202 && res.status !== 422) throw new Error(body.error || `HTTP ${res.status}`);
  return { status: res.status, body };
}

export const skeleton = (n = 3) => h('div', { class: 'skeleton', 'aria-hidden': 'true' }, Array.from({ length: n }, () => h('i')));
