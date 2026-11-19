// Cliente HTTP do servidor: timeout, poucas tentativas com backoff, respeito a 429/Retry-After,
// cache em memória por URL (TTL) e coalescência de requisições simultâneas para a mesma URL.
import { log } from './log.js';

export class HttpError extends Error {
  constructor(message, { status, url, retryAfterMs } = {}) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.url = url;
    this.retryAfterMs = retryAfterMs;
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function createHttp({ fetchImpl = globalThis.fetch, userAgent = 'MorningIntelligence/0.1 (+painel pessoal)', timeoutMs = 12000, retries = 2, now = Date.now } = {}) {
  const cache = new Map(); // url -> { at, ttl, value }
  const inflight = new Map(); // url -> Promise
  const blockedUntil = new Map(); // host -> timestamp (após 429)

  async function rawFetch(url, accept) {
    const host = new URL(url).host;
    const until = blockedUntil.get(host);
    if (until && until > now()) {
      throw new HttpError(`Limite de requisições atingido em ${host}; nova tentativa após ${new Date(until).toLocaleTimeString('pt-BR')}`, { status: 429, url, retryAfterMs: until - now() });
    }
    let lastErr;
    for (let attempt = 0; attempt <= retries; attempt++) {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), timeoutMs);
      try {
        const res = await fetchImpl(url, { headers: { 'user-agent': userAgent, accept }, signal: ctrl.signal, redirect: 'follow' });
        if (res.status === 429) {
          const ra = Number(res.headers.get('retry-after'));
          const wait = Number.isFinite(ra) && ra > 0 ? ra * 1000 : 5 * 60 * 1000;
          blockedUntil.set(host, now() + wait);
          throw new HttpError(`HTTP 429 (limite) em ${host}`, { status: 429, url, retryAfterMs: wait });
        }
        if (!res.ok) {
          const err = new HttpError(`HTTP ${res.status} em ${host}`, { status: res.status, url });
          if (res.status < 500) throw err; // erro do cliente: não adianta repetir
          lastErr = err;
        } else {
          return await res.text();
        }
      } catch (e) {
        if (e instanceof HttpError && e.status && e.status < 500) throw e;
        lastErr = e.name === 'AbortError' ? new HttpError(`Tempo esgotado ao acessar ${host}`, { url }) : (e instanceof HttpError ? e : new HttpError(`Falha de conexão com ${host}: ${e.cause?.code || e.message}`, { url }));
      } finally {
        clearTimeout(t);
      }
      if (attempt < retries) await sleep(400 * 2 ** attempt);
    }
    throw lastErr;
  }

  async function get(url, { ttlMs = 0, accept = '*/*' } = {}) {
    const hit = cache.get(url);
    if (hit && now() - hit.at < hit.ttl) return { body: hit.value, fetchedAt: hit.at, cached: true };
    if (inflight.has(url)) return inflight.get(url);
    const p = rawFetch(url, accept)
      .then((body) => {
        const at = now();
        if (ttlMs > 0) cache.set(url, { at, ttl: ttlMs, value: body });
        return { body, fetchedAt: at, cached: false };
      })
      .catch((e) => {
        log.warn('http', e.message, { url });
        throw e;
      })
      .finally(() => inflight.delete(url));
    inflight.set(url, p);
    return p;
  }

  return {
    get,
    async getJSON(url, opts = {}) {
      const r = await get(url, { ...opts, accept: 'application/json' });
      try {
        return { ...r, json: JSON.parse(r.body) };
      } catch {
        throw new HttpError(`Resposta inválida (não é JSON) de ${new URL(url).host}`, { url });
      }
    },
    async getText(url, opts = {}) {
      return get(url, { ...opts, accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.5' });
    },
    clear: () => cache.clear(),
  };
}
