// Monta o servidor HTTP: arquivos estáticos do painel, API JSON e canal SSE em tempo real.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, normalize, extname, sep } from 'node:path';
import { ModuleHub } from './core/hub.js';
import { createHttp } from './core/http.js';
import { log } from './core/log.js';
import { SettingsStore, INTERVAL_LIMITS } from './core/settings.js';
import { NEWS_CATEGORIES } from './config/sources.js';
import { weatherProvider, searchCity } from './providers/weather.js';
import { newsProvider, aiProvider } from './providers/news.js';
import { marketsProvider } from './providers/markets.js';
import { createBriefingProvider } from './providers/briefing.js';

const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json; charset=utf-8', '.woff2': 'font/woff2',
};

const SECURITY_HEADERS = {
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
  'x-frame-options': 'DENY',
  'content-security-policy': "default-src 'self'; style-src 'self' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; script-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
};

export function createApp({ webRoot, settingsPath, fetchImpl, fixtures = false, env = process.env } = {}) {
  const http = createHttp({ fetchImpl });
  const settings = new SettingsStore(settingsPath, env);
  const hub = new ModuleHub({ ctx: { http, settings, log } });
  hub.register(createBriefingProvider())
    .register(weatherProvider)
    .register(newsProvider)
    .register(aiProvider)
    .register(marketsProvider);
  for (const [id, ms] of Object.entries(settings.get().intervals)) hub.setInterval(id, ms);

  settings.onChange((next, prev) => {
    if (JSON.stringify(next.location) !== JSON.stringify(prev.location)) hub.refresh('weather', { force: true, reason: 'nova localização' });
    if (JSON.stringify(next.newsCategories) !== JSON.stringify(prev.newsCategories) || next.newsMaxAgeHours !== prev.newsMaxAgeHours) hub.refresh('news', { force: true, reason: 'novas categorias' });
    for (const id of Object.keys(INTERVAL_LIMITS)) {
      if (next.intervals[id] !== prev.intervals[id]) hub.setInterval(id, next.intervals[id] ?? hub.providers.get(id).intervalMs);
    }
    if (next.name !== prev.name || next.timezone !== prev.timezone || JSON.stringify(next.location) !== JSON.stringify(prev.location)) {
      hub.refresh('briefing', { reason: 'configuração' });
    }
  });

  const clients = new Set();
  hub.subscribe((snap) => {
    const msg = `event: module\ndata: ${JSON.stringify(snap)}\n\n`;
    for (const res of clients) res.write(msg);
  });
  const heartbeat = setInterval(() => {
    for (const res of clients) res.write(`event: ping\ndata: {"serverTime":"${new Date().toISOString()}"}\n\n`);
  }, 20000);
  heartbeat.unref();

  const json = (res, status, body) => {
    res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...SECURITY_HEADERS });
    res.end(JSON.stringify(body));
  };

  async function readBody(req, limit = 16 * 1024) {
    let size = 0;
    const chunks = [];
    for await (const c of req) {
      size += c.length;
      if (size > limit) throw Object.assign(new Error('corpo muito grande'), { status: 413 });
      chunks.push(c);
    }
    try { return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); } catch { throw Object.assign(new Error('JSON inválido'), { status: 400 }); }
  }

  // Bloqueia requisições de escrita vindas de outros sites (CSRF) — o painel não tem login.
  const sameOrigin = (req) => {
    const origin = req.headers.origin;
    if (!origin) return true;
    try { return new URL(origin).host === req.headers.host; } catch { return false; }
  };

  const meta = () => ({
    name: 'Morning Intelligence',
    version: '0.1.0',
    fixtures,
    serverTime: new Date().toISOString(),
    categories: NEWS_CATEGORIES,
    intervalLimits: INTERVAL_LIMITS,
    modules: [...hub.providers.values()].map((p) => ({ id: p.id, title: p.title, intervalMs: hub.intervalFor(p.id), defaultIntervalMs: p.intervalMs, staleAfterMs: p.staleAfterMs })),
    summarizers: [{ id: 'regras', label: 'Resumo por regras (sem IA)', active: true }],
  });

  async function api(req, res, url) {
    const { pathname } = url;
    if (req.method === 'GET' && pathname === '/api/meta') return json(res, 200, meta());
    if (req.method === 'GET' && pathname === '/api/modules') return json(res, 200, { serverTime: new Date().toISOString(), modules: hub.all() });
    if (req.method === 'GET' && pathname === '/api/health') {
      return json(res, 200, { ok: true, uptimeSec: Math.round(process.uptime()), clients: clients.size, modules: hub.all().map(({ id, status, stale, updatedAt, error }) => ({ id, status, stale, updatedAt, error })), recentErrors: log.recent() });
    }
    if (req.method === 'GET' && pathname === '/api/stream') {
      res.writeHead(200, { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-store', connection: 'keep-alive', 'x-accel-buffering': 'no' });
      res.write('retry: 3000\n\n');
      res.write(`event: hello\ndata: ${JSON.stringify({ serverTime: new Date().toISOString(), modules: hub.all() })}\n\n`);
      clients.add(res);
      req.on('close', () => clients.delete(res));
      return;
    }
    if (req.method === 'GET' && pathname === '/api/settings') return json(res, 200, settings.get());
    if (req.method === 'PUT' && pathname === '/api/settings') {
      if (!sameOrigin(req)) return json(res, 403, { error: 'origem não permitida' });
      const body = await readBody(req);
      const { settings: s, errors } = settings.update(body);
      return json(res, errors.length ? 422 : 200, { settings: s, errors });
    }
    if (req.method === 'POST' && pathname.startsWith('/api/refresh')) {
      if (!sameOrigin(req)) return json(res, 403, { error: 'origem não permitida' });
      const id = pathname.split('/')[3];
      const ids = id ? [id] : [...hub.providers.keys()].filter((i) => i !== 'briefing');
      const results = {};
      for (const i of ids) results[i] = await hub.requestRefresh(i);
      return json(res, id && !results[id].ok && results[id].reason === 'módulo inexistente' ? 404 : 202, { results });
    }
    if (req.method === 'GET' && pathname === '/api/geocode') {
      try {
        return json(res, 200, { results: await searchCity(http, url.searchParams.get('q')) });
      } catch (e) {
        return json(res, 502, { error: `Busca de cidades indisponível: ${e.message}` });
      }
    }
    return json(res, 404, { error: 'rota não encontrada' });
  }

  async function serveStatic(req, res, url) {
    let rel = decodeURIComponent(url.pathname);
    if (rel === '/') rel = '/index.html';
    const file = normalize(join(webRoot, rel));
    if (!file.startsWith(webRoot + sep)) { res.writeHead(403); return res.end(); }
    try {
      const st = await stat(file);
      if (!st.isFile()) throw new Error('not file');
      const body = await readFile(file);
      res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-cache', ...SECURITY_HEADERS });
      res.end(body);
    } catch {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('Não encontrado');
    }
  }

  const server = createServer(async (req, res) => {
    const url = new URL(req.url, 'http://local');
    try {
      if (url.pathname.startsWith('/api/')) return await api(req, res, url);
      if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); return res.end(); }
      return await serveStatic(req, res, url);
    } catch (e) {
      log.error('http-server', e.message);
      if (!res.headersSent) json(res, e.status ?? 500, { error: e.status ? e.message : 'erro interno' });
      else res.end();
    }
  });
  server.on('close', () => { hub.stop(); clearInterval(heartbeat); for (const c of clients) c.end(); });

  return { server, hub, settings, http };
}
