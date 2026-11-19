import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import http from 'node:http';
import { createApp } from '../server/app.js';
import { createFixtureFetch } from '../server/fixtures.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

async function start(fetchImpl) {
  const dir = mkdtempSync(join(tmpdir(), 'mi-'));
  const app = createApp({ webRoot: join(root, 'web'), settingsPath: join(dir, 's.json'), fetchImpl, env: {} });
  await new Promise((r) => app.server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${app.server.address().port}`;
  return { ...app, base, close: () => new Promise((r) => { app.server.closeAllConnections(); app.server.close(r); }) };
}

function readSse(url, { until, timeoutMs = 8000 }) {
  return new Promise((resolve, reject) => {
    const events = [];
    const req = http.get(url, (res) => {
      let buf = '';
      res.on('data', (chunk) => {
        buf += chunk;
        let i;
        while ((i = buf.indexOf('\n\n')) >= 0) {
          const block = buf.slice(0, i); buf = buf.slice(i + 2);
          const ev = /^event: (.+)$/m.exec(block)?.[1];
          const data = /^data: (.+)$/m.exec(block)?.[1];
          if (ev) events.push({ ev, data: data ? JSON.parse(data) : null });
          if (until(events)) { req.destroy(); resolve(events); }
        }
      });
    });
    req.on('error', (e) => { if (e.code !== 'ECONNRESET') reject(e); });
    setTimeout(() => { req.destroy(); reject(new Error(`timeout; eventos: ${events.map((e) => e.ev + ':' + e.data?.id + ':' + e.data?.status).join(', ')}`)); }, timeoutMs);
  });
}

test('servidor entrega estado inicial e atualizações em tempo real via SSE', async () => {
  const app = await start(createFixtureFetch(join(root, 'test', 'fixtures')));
  try {
    const sse = readSse(`${app.base}/api/stream`, {
      until: (evs) => ['weather', 'markets', 'news', 'ai'].every((id) => evs.some((e) => e.ev === 'module' && e.data.id === id && e.data.status === 'ok'))
        && evs.some((e) => e.ev === 'module' && e.data.id === 'briefing' && e.data.status === 'ok'),
    });
    app.hub.start();
    const events = await sse;
    assert.equal(events[0].ev, 'hello');
    assert.equal(events[0].data.modules.length, 5);
    assert.ok(events.some((e) => e.ev === 'module' && e.data.refreshing === true), 'avisa quando está atualizando');
    const brief = events.filter((e) => e.data?.id === 'briefing').at(-1).data;
    assert.ok(brief.data.paragraphs.length >= 4);

    const mods = await (await fetch(`${app.base}/api/modules`)).json();
    const news = mods.modules.find((m) => m.id === 'news');
    assert.ok(news.updatedAt && news.sources.length);
    assert.ok(!JSON.stringify(news.data).includes('Notícia antiga que deve ser filtrada'));

    // atualização manual + cooldown
    const r1 = await (await fetch(`${app.base}/api/refresh/markets`, { method: 'POST' })).json();
    assert.equal(r1.results.markets.reason, 'cooldown');
    const r404 = await fetch(`${app.base}/api/refresh/nada`, { method: 'POST' });
    assert.equal(r404.status, 404);
  } finally {
    await app.close();
  }
});

test('fonte fora do ar vira erro visível, sem dados inventados', async () => {
  const app = await start(async () => { throw Object.assign(new Error('fetch failed'), { cause: { code: 'ECONNREFUSED' } }); });
  try {
    await app.hub.refresh('weather');
    await app.hub.refresh('markets');
    const mods = await (await fetch(`${app.base}/api/modules`)).json();
    for (const id of ['weather', 'markets']) {
      const m = mods.modules.find((x) => x.id === id);
      assert.equal(m.status, 'error');
      assert.equal(m.data, null);
      assert.match(m.error.message, /Falha de conexão|Nenhuma fonte/);
    }
    const health = await (await fetch(`${app.base}/api/health`)).json();
    assert.ok(health.recentErrors.length > 0, 'erros de integração ficam registrados');
  } finally {
    await app.close();
  }
});

test('segurança: CSRF, path traversal, cabeçalhos e validação de configurações', async () => {
  const app = await start(createFixtureFetch(join(root, 'test', 'fixtures')));
  try {
    const evil = await fetch(`${app.base}/api/settings`, { method: 'PUT', headers: { origin: 'https://evil.example', 'content-type': 'application/json' }, body: '{"name":"x"}' });
    assert.equal(evil.status, 403);

    const ok = await fetch(`${app.base}/api/settings`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Ana', newsCategories: ['ia'], timezone: 'Europe/Lisbon' }) });
    const body = await ok.json();
    assert.equal(ok.status, 200);
    assert.equal(body.settings.name, 'Ana');
    assert.deepEqual(body.settings.newsCategories, ['ia']);

    const bad = await fetch(`${app.base}/api/settings`, { method: 'PUT', body: '{nope' });
    assert.equal(bad.status, 400);

    const trav = await new Promise((r) => http.get(`${app.base}/..%2f..%2fpackage.json`, (res) => { res.resume(); r(res.statusCode); }));
    assert.ok([403, 404].includes(trav));

    const page = await fetch(`${app.base}/`);
    assert.equal(page.status, 200);
    assert.match(page.headers.get('content-security-policy'), /default-src 'self'/);
    assert.equal(page.headers.get('x-content-type-options'), 'nosniff');

    const geo = await (await fetch(`${app.base}/api/geocode?q=Rio`)).json();
    assert.equal(geo.results[0].name, 'Rio de Janeiro');
  } finally {
    await app.close();
  }
});

test('senha de acesso: bloqueia sem credencial e libera com a senha certa', async () => {
  const { mkdtempSync: mk } = await import('node:fs');
  const dir = mk(join(tmpdir(), 'mi-'));
  const app = createApp({ webRoot: join(root, 'web'), settingsPath: join(dir, 's.json'), fetchImpl: createFixtureFetch(join(root, 'test', 'fixtures')), env: { MI_PASSWORD: 'segredo123' } });
  await new Promise((r) => app.server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${app.server.address().port}`;
  const auth = (p) => ({ authorization: `Basic ${Buffer.from(`eu:${p}`).toString('base64')}` });
  try {
    assert.equal((await fetch(`${base}/`)).status, 401);
    assert.equal((await fetch(`${base}/api/modules`, { headers: auth('errada') })).status, 401);
    assert.equal((await fetch(`${base}/api/modules`, { headers: auth('segredo123') })).status, 200);
    assert.equal((await fetch(`${base}/healthz`)).status, 200);
  } finally {
    app.server.closeAllConnections(); await new Promise((r) => app.server.close(r));
  }
});
