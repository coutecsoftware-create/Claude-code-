import { h, fmtNum, fmtPct, trend, fmtTime } from '../util.js';

// Histórico da sessão: guarda só cotações reais recebidas desde que a página foi aberta.
const history = new Map(); // id -> [{t, v}]
const lastVal = new Map();

function record(q) {
  const list = history.get(q.id) ?? [];
  const t = Date.parse(q.quotedAt ?? '') || Date.now();
  if (!list.length || list[list.length - 1].t !== t) list.push({ t, v: q.value });
  if (list.length > 120) list.shift();
  history.set(q.id, list);
  return list;
}

function spark(points) {
  if (points.length < 3) return null;
  const vs = points.map((p) => p.v);
  const min = Math.min(...vs); const max = Math.max(...vs);
  const rng = max - min || 1;
  const xs = (i) => (i / (points.length - 1)) * 100;
  const ys = (v) => 24 - ((v - min) / rng) * 22;
  const line = points.map((p, i) => `${i ? 'L' : 'M'}${xs(i).toFixed(2)} ${ys(p.v).toFixed(2)}`).join(' ');
  return h('svg', { class: 'mk-spark', viewBox: '0 0 100 26', preserveAspectRatio: 'none', 'aria-label': `Variação na sessão: ${points.length} leituras` },
    h('path', { class: 'a', d: `${line} L100 26 L0 26 Z` }),
    h('path', { class: 'l', d: line }));
}

const money = (q) => {
  if (q.currency === 'USD') return `US$ ${fmtNum(q.value, q.value > 1000 ? 0 : 2)}`;
  return `R$ ${fmtNum(q.value, q.value > 1000 ? 0 : 4)}`;
};

export default {
  id: 'markets',
  title: 'Indicadores',
  icon: 'markets',
  span: 6,
  dataTimeLabel: 'Cotação mais recente',
  render(body, snap, ctx) {
    const { quotes, indicators } = snap.data;
    const tz = ctx.settings.timezone;
    const defs = h('svg', { width: 0, height: 0, style: { position: 'absolute' }, 'aria-hidden': 'true' },
      h('defs', null, h('linearGradient', { id: 'sparkfill', x1: 0, x2: 0, y1: 0, y2: 1 },
        h('stop', { offset: '0%', 'stop-color': '#3fd0ff', 'stop-opacity': 0.35 }), h('stop', { offset: '100%', 'stop-color': '#3fd0ff', 'stop-opacity': 0 }))));
    const tiles = quotes.map((q) => {
      const pts = record(q);
      const prev = lastVal.get(q.id);
      lastVal.set(q.id, q.value);
      const flash = prev != null && prev !== q.value ? (q.value > prev ? 'flash-up' : 'flash-down') : '';
      const tr = trend(q.changePct);
      return h('div', { class: 'mk-tile' },
        h('div', { class: 'mk-head' }, h('span', { class: 'mk-name' }, q.label), h('span', { class: 'mk-sym' }, `${q.symbol}/${q.currency === 'USD' ? 'USD' : 'BRL'}`)),
        h('div', { class: `mk-val ${flash}` }, money(q)),
        h('div', { class: 'mk-row' },
          h('span', { class: `mk-chg ${tr}` }, `${tr === 'up' ? '▲' : tr === 'down' ? '▼' : '•'} ${fmtPct(q.changePct)}`),
          h('span', { title: q.quotedAt ? new Date(q.quotedAt).toLocaleString('pt-BR') : '' }, q.quotedAt ? fmtTime(q.quotedAt, tz) : '—')),
        q.low != null && q.high != null ? h('div', { class: 'mk-row' }, h('span', null, `Mín ${fmtNum(q.low, q.currency === 'BRL' && q.value > 1000 ? 0 : 3)}`), h('span', null, `Máx ${fmtNum(q.high, q.currency === 'BRL' && q.value > 1000 ? 0 : 3)}`)) : null,
        spark(pts));
    });
    const ind = indicators.length ? h('div', { class: 'mk-ind' }, indicators.map((i) => h('div', null,
      h('span', { class: 'label' }, i.label),
      h('b', null, `${fmtNum(i.value, 2)}${i.unit.startsWith('%') ? '%' : ''}`, h('small', null, i.unit.includes('a.a.') ? ' a.a.' : '')),
      h('small', null, `Ref. ${i.referenceDate ? new Date(`${i.referenceDate}T12:00:00Z`).toLocaleDateString('pt-BR', { timeZone: 'UTC' }) : '—'} · BCB`)))) : null;
    body.replaceChildren(defs,
      quotes.length ? h('div', { class: 'mk-grid' }, tiles) : h('div', { class: 'empty' }, 'Cotações indisponíveis no momento.'),
      ind,
      h('p', { class: 'hint', style: { margin: '10px 0 0' } }, 'Variação % das moedas: dia (AwesomeAPI); cripto em US$: 24 h (CoinGecko). Gráficos mostram só as leituras desta sessão.'));
  },
};
