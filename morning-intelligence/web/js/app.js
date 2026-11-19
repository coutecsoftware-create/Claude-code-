// Núcleo do painel: conexão em tempo real (SSE), estado dos módulos e moldura dos cards.
import { h, api, ago, fmtTime, fmtDateTime, clock, toast, skeleton } from './util.js';
import { icons } from './icons.js';
import { registry } from './modules/index.js';
import { openSettings } from './settings.js';

const state = {
  meta: null,
  settings: null,
  snaps: new Map(),
  cards: new Map(), // id -> { root, body, chip, foot, alert, btn, lastKey }
};

const ctx = {
  get settings() { return state.settings; },
  get meta() { return state.meta; },
  snap: (id) => state.snaps.get(id),
  refresh: (id) => manualRefresh(id),
};

// ---------- moldura do card ----------
function statusOf(id, snap) {
  if (registry[id]?.local) return { tone: 'live', label: 'Ao vivo', state: 'ok' };
  if (!snap) return { tone: 'busy', label: 'Carregando', state: 'loading' };
  const staleAfter = snap.staleAfterMs ?? Infinity;
  const stale = snap.updatedAt ? clock.now() - Date.parse(snap.updatedAt) > staleAfter : false;
  if (snap.refreshing) return { tone: 'busy', label: 'Atualizando', state: 'loading', stale };
  if (!snap.data && (snap.status === 'idle' || snap.status === 'loading')) return { tone: 'busy', label: 'Carregando', state: 'loading' };
  if (snap.status === 'error' && !snap.data) return { tone: 'err', label: 'Fonte indisponível', state: 'error' };
  if (snap.status === 'error') return { tone: 'err', label: 'Falha na atualização', state: 'error', stale };
  if (stale) return { tone: 'warn', label: 'Desatualizado', state: 'stale', stale };
  if (snap.status === 'partial') return { tone: 'warn', label: 'Parcial', state: 'ok' };
  return { tone: 'live', label: 'Atualizado', state: 'ok' };
}

function buildCard(id) {
  const mod = registry[id];
  const btn = mod.local ? null : h('button', { class: 'card-refresh', type: 'button', title: `Atualizar ${mod.title}`, 'aria-label': `Atualizar ${mod.title}`, onclick: () => manualRefresh(id) }, icons.refresh());
  const chip = h('span', { class: 'chip', 'data-tone': 'busy' }, 'Carregando');
  const body = h('div', { class: 'card-body' }, skeleton());
  const alert = h('div', { class: 'card-alert', hidden: true, role: 'alert' });
  const foot = h('div', { class: 'card-foot' });
  const root = h('section', {
    class: 'card', 'data-module': id, 'aria-labelledby': `t-${id}`,
    style: { '--span': mod.span ?? 4, '--span-md': mod.spanMd ?? (mod.span >= 8 ? 12 : 6) },
  },
  h('div', { class: 'card-progress', 'aria-hidden': 'true' }),
  h('header', { class: 'card-head' },
    h('span', { class: 'card-icon' }, icons[mod.icon ?? id]()),
    h('h2', { class: 'card-title', id: `t-${id}` }, mod.title),
    h('div', { class: 'card-head-right' }, chip, btn)),
  alert, body, mod.local && !mod.footer ? null : foot);
  const card = { root, body, chip, foot, alert, btn, lastKey: null };
  state.cards.set(id, card);
  return card;
}

function updateFrame(id) {
  const card = state.cards.get(id);
  if (!card) return;
  const mod = registry[id];
  const snap = state.snaps.get(id);
  const st = statusOf(id, snap);
  card.chip.dataset.tone = st.tone;
  card.chip.textContent = st.label;
  card.root.dataset.state = st.state;
  card.root.classList.toggle('is-refreshing', !!snap?.refreshing);
  if (card.btn) card.btn.disabled = !!snap?.refreshing;

  // aviso de erro / dado antigo
  let msg = null; let tone = 'warn';
  if (snap?.status === 'error') {
    tone = 'err';
    msg = snap.data
      ? `Não foi possível atualizar: ${snap.error?.message}. Exibindo a última versão obtida (${fmtDateTime(snap.updatedAt, state.settings?.timezone)}). Nova tentativa automática em breve.`
      : `Fonte indisponível: ${snap.error?.message}. O sistema tentará novamente automaticamente.`;
  } else if (st.stale) {
    msg = `Dados com mais de ${Math.round(snap.staleAfterMs / 60000)} min sem atualização — podem não refletir a situação atual.`;
  } else if (snap?.status === 'partial' && snap.error) {
    msg = `Parte das fontes não respondeu: ${snap.error.message}.`;
  }
  card.alert.hidden = !msg;
  card.alert.dataset.tone = tone;
  card.alert.textContent = msg ?? '';

  if (mod.local) { mod.footer?.(card.foot, ctx); return; }
  const tz = state.settings?.timezone;
  const parts = [];
  if (snap?.updatedAt) parts.push(h('span', { title: new Date(snap.updatedAt).toLocaleString('pt-BR') }, `Atualizado ${fmtTime(snap.updatedAt, tz)} · ${ago(snap.updatedAt)}`));
  else parts.push(h('span', null, 'Aguardando primeira atualização'));
  if (snap?.dataTime && mod.showDataTime !== false) parts.push(h('span', null, `${mod.dataTimeLabel ?? 'Dado da fonte'}: ${fmtDateTime(snap.dataTime, tz)}`));
  if (snap?.nextRunAt && !snap.refreshing) parts.push(h('span', null, `Próxima ${fmtTime(snap.nextRunAt, tz)}`));
  if (snap?.sources?.length) {
    parts.push(h('span', null, 'Fonte: ', snap.sources.flatMap((s, i) => [i ? ', ' : null, s.url ? h('a', { href: s.url, target: '_blank', rel: 'noopener noreferrer' }, s.name) : s.name])));
  }
  card.foot.replaceChildren(...parts.flatMap((p, i) => (i ? [h('span', { class: 'sep' }, '/'), p] : [p])));
}

function renderBody(id, force = false) {
  const card = state.cards.get(id);
  const mod = registry[id];
  if (!card || mod.local) return;
  const snap = state.snaps.get(id);
  const key = `${snap?.updatedAt ?? ''}|${snap?.data ? '' : snap?.status}`;
  if (!force && key === card.lastKey) return;
  card.lastKey = key;
  if (!snap?.data) {
    card.body.replaceChildren(snap?.status === 'error' ? h('div', { class: 'empty' }, 'Sem dados disponíveis no momento.') : skeleton());
    return;
  }
  try {
    mod.render(card.body, snap, ctx);
  } catch (e) {
    console.error(id, e);
    card.body.replaceChildren(h('div', { class: 'empty' }, 'Erro ao exibir este módulo.'));
  }
}

function layout() {
  const grid = document.getElementById('grid');
  const { order, hidden } = state.settings.layout;
  const ids = order.filter((id) => registry[id] && !hidden.includes(id));
  const nodes = ids.map((id) => (state.cards.get(id) ?? buildCard(id)).root);
  grid.replaceChildren(...nodes);
  for (const id of ids) {
    const mod = registry[id];
    if (mod.local) mod.mount?.(state.cards.get(id).body, ctx);
    updateFrame(id);
    renderBody(id, true);
  }
}

// ---------- tempo real ----------
const conn = document.getElementById('conn');
function setConn(s, label) {
  conn.dataset.state = s;
  conn.querySelector('.conn-label').textContent = label;
}

let es;
let lastMsg = 0;
let retry = 0;
function connect() {
  es?.close();
  setConn(retry ? 'reconnecting' : 'connecting', retry ? 'Reconectando…' : 'Conectando…');
  es = new EventSource('/api/stream');
  const touch = () => { lastMsg = Date.now(); retry = 0; setConn('live', 'Ao vivo'); };
  es.addEventListener('hello', (ev) => {
    touch();
    const d = JSON.parse(ev.data);
    clock.sync(d.serverTime);
    for (const m of d.modules) applySnap(m);
  });
  es.addEventListener('module', (ev) => { touch(); applySnap(JSON.parse(ev.data)); });
  es.addEventListener('ping', (ev) => { touch(); clock.sync(JSON.parse(ev.data).serverTime); });
  es.onerror = () => {
    setConn('reconnecting', 'Reconectando…');
    if (es.readyState === EventSource.CLOSED) scheduleReconnect();
  };
}
function scheduleReconnect() {
  retry++;
  const wait = Math.min(30000, 1000 * 2 ** Math.min(retry, 5));
  setConn('offline', `Sem conexão · nova tentativa em ${Math.round(wait / 1000)}s`);
  setTimeout(connect, wait);
}
// Vigia: se nada chegar por 60 s (heartbeat a cada 20 s), refaz a conexão.
setInterval(() => {
  if (lastMsg && Date.now() - lastMsg > 60000) { retry++; connect(); lastMsg = Date.now(); }
}, 10000);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && (!es || es.readyState !== EventSource.OPEN)) connect();
});

function applySnap(snap) {
  if (snap.serverTime) clock.sync(snap.serverTime);
  state.snaps.set(snap.id, snap);
  updateFrame(snap.id);
  renderBody(snap.id);
  // módulos que dependem de outros (ex.: relógio usa nascer/pôr do sol do clima)
  for (const [id, mod] of Object.entries(registry)) if (mod.uses?.includes(snap.id)) mod.onDependency?.(state.cards.get(id)?.body, ctx);
}

async function manualRefresh(id) {
  try {
    const { body } = await api(id ? `/api/refresh/${id}` : '/api/refresh', { method: 'POST' });
    const res = Object.entries(body.results ?? {});
    const cooling = res.filter(([, r]) => r.reason === 'cooldown');
    if (id && cooling.length) toast(`Aguarde ${Math.ceil(cooling[0][1].retryInMs / 1000)} s para atualizar ${registry[id].title} novamente.`);
    else if (!id) toast(cooling.length === res.length ? 'Os módulos acabaram de ser atualizados. Aguarde alguns segundos.' : 'Atualizando todos os módulos…');
  } catch (e) {
    toast(`Não foi possível solicitar a atualização: ${e.message}`);
  }
}

// ---------- inicialização ----------
async function boot() {
  const [{ body: meta }, { body: settings }] = await Promise.all([api('/api/meta'), api('/api/settings')]);
  state.meta = meta;
  state.settings = settings;
  clock.sync(meta.serverTime);
  document.getElementById('fixture-banner').hidden = !meta.fixtures;
  document.getElementById('foot-info').textContent = `${meta.name} v${meta.version}`;
  layout();
  connect();

  const btnAll = document.getElementById('refresh-all');
  btnAll.addEventListener('click', async () => {
    btnAll.classList.add('is-spinning'); btnAll.disabled = true;
    await manualRefresh(null);
    setTimeout(() => { btnAll.classList.remove('is-spinning'); btnAll.disabled = false; }, 1500);
  });
  document.getElementById('open-settings').addEventListener('click', () => openSettings({
    settings: state.settings, meta: state.meta, registry,
    onSave: (s) => { const oldTz = state.settings.timezone; state.settings = s; layout(); if (oldTz !== s.timezone) for (const id of state.cards.keys()) renderBody(id, true); },
  }));

  // relógio e marcações relativas
  setInterval(() => { for (const [id, mod] of Object.entries(registry)) if (mod.tick && state.cards.has(id)) mod.tick(state.cards.get(id).body, ctx); }, 1000);
  setInterval(() => { for (const id of state.cards.keys()) updateFrame(id); for (const [id, mod] of Object.entries(registry)) mod.relativeTick?.(state.cards.get(id)?.body, ctx); }, 15000);
}

boot().catch((e) => {
  setConn('offline', 'Servidor indisponível');
  document.getElementById('grid').replaceChildren(h('div', { class: 'card', style: { '--span': 12 } }, h('div', { class: 'card-body' }, h('div', { class: 'empty' }, `Não foi possível iniciar o painel: ${e.message}. Verifique se o servidor está em execução.`))));
});
