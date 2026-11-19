// Indicadores econômicos. Cada fonte é independente: se uma falhar, as outras continuam.
// - AwesomeAPI: dólar, euro e bitcoin em reais (cotação comercial, atualização ~30 s)
// - CoinGecko: bitcoin/ethereum em dólar com variação 24h
// - Banco Central (SGS): Selic meta e IPCA 12 meses (publicação diária/mensal)
import { MARKETS } from '../config/sources.js';

const n = (v) => {
  const x = typeof v === 'string' ? Number(v.replace(',', '.')) : v;
  return Number.isFinite(x) ? x : null;
};

export function mapAwesome(json) {
  const pick = (key, label, symbol) => {
    const q = json?.[key];
    if (!q) return null;
    const ts = Number(q.timestamp);
    return {
      id: key.toLowerCase(),
      label,
      symbol,
      currency: 'BRL',
      value: n(q.bid),
      ask: n(q.ask),
      high: n(q.high),
      low: n(q.low),
      changePct: n(q.pctChange),
      quotedAt: Number.isFinite(ts) ? new Date(ts * 1000).toISOString() : null,
    };
  };
  return [pick('USDBRL', 'Dólar', 'USD'), pick('EURBRL', 'Euro', 'EUR'), pick('BTCBRL', 'Bitcoin', 'BTC')].filter((x) => x && x.value != null);
}

export function mapCoingecko(json) {
  const out = [];
  const add = (id, label, symbol) => {
    const c = json?.[id];
    if (!c || n(c.usd) == null) return;
    out.push({
      id: `${symbol.toLowerCase()}usd`,
      label: `${label} (US$)`,
      symbol,
      currency: 'USD',
      value: n(c.usd),
      valueBrl: n(c.brl),
      changePct: n(c.usd_24h_change),
      quotedAt: c.last_updated_at ? new Date(c.last_updated_at * 1000).toISOString() : null,
    });
  };
  add('bitcoin', 'Bitcoin', 'BTC');
  add('ethereum', 'Ethereum', 'ETH');
  return out;
}

export function mapBcb(series, json) {
  const last = Array.isArray(json) ? json[json.length - 1] : null;
  if (!last) return null;
  const [d, m, y] = String(last.data).split('/');
  return { id: series.id, label: series.label, unit: series.unit, value: n(last.valor), referenceDate: y && m && d ? `${y}-${m}-${d}` : null };
}

export const marketsProvider = {
  id: 'markets',
  title: 'Indicadores',
  intervalMs: 2 * 60e3,
  minIntervalMs: 60e3,
  staleAfterMs: 10 * 60e3,
  manualCooldownMs: 30e3,
  async fetch({ http }) {
    const errors = [];
    const sources = [];
    const quotes = [];
    const indicators = [];

    const tasks = [
      http.getJSON(MARKETS.awesome.url, { ttlMs: 45e3 }).then(({ json }) => {
        quotes.push(...mapAwesome(json));
        sources.push({ name: MARKETS.awesome.name, url: MARKETS.awesome.site });
      }).catch((e) => errors.push(`${MARKETS.awesome.name}: ${e.message}`)),

      http.getJSON(MARKETS.coingecko.url, { ttlMs: 60e3 }).then(({ json }) => {
        quotes.push(...mapCoingecko(json));
        sources.push({ name: MARKETS.coingecko.name, url: MARKETS.coingecko.site });
      }).catch((e) => errors.push(`${MARKETS.coingecko.name}: ${e.message}`)),

      ...MARKETS.bcb.series.map((s) =>
        http.getJSON(MARKETS.bcb.url(s.code), { ttlMs: 6 * 3600e3 }).then(({ json }) => {
          const v = mapBcb(s, json);
          if (v) indicators.push(v);
        }).catch((e) => errors.push(`BCB ${s.label}: ${e.message}`))),
    ];
    await Promise.all(tasks);
    if (indicators.length) sources.push({ name: MARKETS.bcb.name, url: MARKETS.bcb.site });

    if (!quotes.length && !indicators.length) throw new Error(`Nenhuma fonte de mercado respondeu. ${errors.join(' · ')}`);
    const order = ['usdbrl', 'eurbrl', 'btcbrl', 'btcusd', 'ethusd'];
    quotes.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
    indicators.sort((a, b) => MARKETS.bcb.series.findIndex((s) => s.id === a.id) - MARKETS.bcb.series.findIndex((s) => s.id === b.id));
    const newest = quotes.map((q) => q.quotedAt).filter(Boolean).sort().pop() ?? null;
    return {
      data: { quotes, indicators, errors },
      dataTime: newest,
      sources,
      partialError: errors.length ? errors.join(' · ') : null,
    };
  },
};
