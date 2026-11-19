import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ModuleHub } from '../server/core/hub.js';
import { SettingsStore, validateSettings, defaultSettings } from '../server/core/settings.js';
import { collectFacts, ruleBasedSummarizer, greetingFor } from '../server/providers/briefing.js';

const fakeTimers = () => {
  const timers = [];
  return { timers, setTimer: (fn, ms) => { const t = { fn, ms }; timers.push(t); return t; }, clearTimer: (t) => { const i = timers.indexOf(t); if (i >= 0) timers.splice(i, 1); } };
};

test('hub: sucesso, erro mantém último dado, backoff e recuperação', async () => {
  let now = 1_000_000;
  let fail = false;
  const ft = fakeTimers();
  const hub = new ModuleHub({ ctx: {}, now: () => now, ...ft });
  const events = [];
  hub.subscribe((s) => events.push(s.status));
  hub.register({ id: 'x', title: 'X', intervalMs: 600e3, minIntervalMs: 60e3, staleAfterMs: 1200e3,
    async fetch() { if (fail) throw new Error('fonte fora do ar'); return { data: { v: now }, sources: [{ name: 'S' }] }; } });
  hub.started = true;
  await hub.refresh('x');
  let v = hub.view('x');
  assert.equal(v.status, 'ok');
  assert.equal(v.stale, false);
  assert.equal(ft.timers.at(-1).ms, 600e3);

  fail = true; now += 1000;
  await hub.refresh('x');
  v = hub.view('x');
  assert.equal(v.status, 'error');
  assert.equal(v.error.message, 'fonte fora do ar');
  assert.ok(v.data, 'mantém o último dado válido');
  assert.equal(ft.timers.at(-1).ms, 60e3, 'tenta de novo antes do intervalo normal');

  now += 1300e3;
  assert.equal(hub.view('x').stale, true, 'marca como desatualizado após staleAfterMs');

  fail = false;
  await hub.refresh('x');
  assert.equal(hub.view('x').status, 'ok');
  assert.equal(hub.view('x').stale, false);
  assert.ok(events.includes('error') && events.at(-1) === 'ok');
});

test('hub: atualização manual respeita cooldown e coalesce chamadas simultâneas', async () => {
  let now = 0; let calls = 0;
  const hub = new ModuleHub({ ctx: {}, now: () => now, ...fakeTimers() });
  hub.register({ id: 'y', title: 'Y', intervalMs: 600e3, staleAfterMs: 1, manualCooldownMs: 30e3, async fetch() { calls++; await new Promise((r) => setTimeout(r, 10)); return { data: 1 }; } });
  await Promise.all([hub.refresh('y'), hub.refresh('y')]);
  assert.equal(calls, 1);
  now += 5e3;
  const r = await hub.requestRefresh('y');
  assert.equal(r.reason, 'cooldown');
  now += 30e3;
  assert.equal((await hub.requestRefresh('y')).ok, true);
});

test('settings: valida e limita entradas', () => {
  const base = defaultSettings({});
  const { settings, errors } = validateSettings({
    name: '<script>Ana</script>', timezone: 'Mars/Base', location: { latitude: 999, longitude: 0 },
    newsCategories: ['brasil', 'hackers', 'brasil'], intervals: { markets: 1000, news: 1e12, bogus: 5 },
    layout: { order: ['news', 'x', 'news'], hidden: ['clock', 'nope'] },
  }, base);
  assert.equal(settings.name, 'scriptAna/script');
  assert.equal(settings.timezone, base.timezone);
  assert.deepEqual(settings.newsCategories, ['brasil']);
  assert.equal(settings.intervals.markets, 60e3);
  assert.equal(settings.intervals.news, 3 * 3600e3);
  assert.equal(settings.layout.order[0], 'news');
  assert.equal(settings.layout.order.length, 6);
  assert.deepEqual(settings.layout.hidden, ['clock']);
  assert.equal(errors.length, 2);
});

test('briefing: usa só módulos com dados atuais e avisa os indisponíveis', () => {
  const hub = new ModuleHub({ ctx: {}, ...fakeTimers() });
  const now = Date.now();
  for (const id of ['weather', 'markets', 'news', 'ai']) hub.register({ id, title: id, intervalMs: 1, staleAfterMs: 60e3, fetch: async () => ({}) });
  const set = (id, data, updatedAt = new Date(now).toISOString()) => Object.assign(hub.snapshots.get(id), { data, updatedAt, status: 'ok' });
  set('weather', { current: { temperature: 30.4, condition: { label: 'Céu limpo' } }, today: { max: 33, min: 21, uv: 11 }, rainNext12: 75, rainPeakAt: new Date(now + 3600e3).toISOString() });
  set('markets', { quotes: [{ id: 'usdbrl', label: 'Dólar', symbol: 'USD', currency: 'BRL', value: 5.4, changePct: 1.5 }] });
  set('news', { highlights: [] }, new Date(now - 3600e3).toISOString()); // desatualizado
  const settings = new SettingsStore(null, {});
  const facts = collectFacts(hub, settings, new Date(now));
  assert.equal(facts.news, null);
  assert.deepEqual(facts.unavailable.sort(), ['ai', 'news']);
  const { paragraphs } = ruleBasedSummarizer.generate(facts);
  const text = paragraphs.map((p) => p.text).join(' ');
  assert.match(text, /30°C/);
  assert.match(text, /Chuva provável/);
  assert.match(text, /UV muito alto/);
  assert.match(text, /dólar a R\$\s?5,400/);
  assert.match(text, /variação forte em Dólar/);
  assert.match(text, /Sem dados atualizados de notícias, IA|Sem dados atualizados de IA, notícias/);
  assert.doesNotMatch(text, /Entre as notícias/);
});

test('saudação por horário no fuso configurado', () => {
  assert.equal(greetingFor(new Date('2026-11-19T10:00:00Z'), 'America/Sao_Paulo'), 'Bom dia');
  assert.equal(greetingFor(new Date('2026-11-19T17:00:00Z'), 'America/Sao_Paulo'), 'Boa tarde');
  assert.equal(greetingFor(new Date('2026-11-19T02:00:00Z'), 'America/Sao_Paulo'), 'Boa noite');
});
