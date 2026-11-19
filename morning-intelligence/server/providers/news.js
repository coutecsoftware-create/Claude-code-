// Central de notícias: vários feeds RSS por categoria, deduplicados e filtrados por recência.
import { NEWS_FEEDS, NEWS_CATEGORIES, AI_FEEDS, AI_TAGS } from '../config/sources.js';
import { fetchFeeds, dedupe, filterFresh } from '../core/feeds.js';

const PER_CATEGORY = 12;

function sourceList(feeds) {
  const seen = new Map();
  for (const f of feeds) if (!seen.has(f.name)) seen.set(f.name, { name: f.name, url: new URL(f.url).origin });
  return [...seen.values()];
}

export function buildNews({ results, errors }, { categories, maxAgeMs, now }) {
  const byCat = {};
  let dropped = 0;
  for (const cat of categories) {
    const items = results.filter((r) => r.feed.category === cat).flatMap((r) => r.items.map((i) => ({ ...i, category: cat })));
    const { fresh, dropped: d } = filterFresh(dedupe(items), { maxAgeMs, now });
    dropped += d;
    byCat[cat] = fresh.slice(0, PER_CATEGORY);
  }
  // Destaques: assuntos cobertos por mais fontes nas últimas horas
  const all = Object.values(byCat).flat();
  const highlights = dedupe(all)
    .filter((i) => i.coveredBy.length > 1 || now - Date.parse(i.publishedAt) < 6 * 3600e3)
    .sort((a, b) => b.coveredBy.length - a.coveredBy.length || Date.parse(b.publishedAt) - Date.parse(a.publishedAt))
    .slice(0, 5);
  const newest = all.reduce((m, i) => (i.publishedAt > m ? i.publishedAt : m), '');
  return {
    categories: NEWS_CATEGORIES.filter((c) => categories.includes(c.id)),
    items: byCat,
    highlights,
    feedErrors: errors,
    feedsOk: results.length,
    feedsTotal: results.length + errors.length,
    droppedOld: dropped,
    newestAt: newest || null,
  };
}

export const newsProvider = {
  id: 'news',
  title: 'Notícias',
  intervalMs: 10 * 60e3,
  minIntervalMs: 5 * 60e3,
  staleAfterMs: 40 * 60e3,
  manualCooldownMs: 60e3,
  async fetch({ http, settings, force }) {
    const s = settings.get();
    const feeds = NEWS_FEEDS.filter((f) => s.newsCategories.includes(f.category));
    if (!feeds.length) return { data: buildNews({ results: [], errors: [] }, { categories: [], maxAgeMs: 0, now: Date.now() }), sources: [] };
    const fetched = await fetchFeeds(http, feeds, { ttlMs: force ? 0 : 4 * 60e3 });
    if (!fetched.results.length) throw new Error(`Nenhum feed de notícias respondeu (${fetched.errors.length} falhas). Ex.: ${fetched.errors[0]?.message}`);
    const data = buildNews(fetched, { categories: s.newsCategories, maxAgeMs: s.newsMaxAgeHours * 3600e3, now: Date.now() });
    return {
      data,
      dataTime: data.newestAt,
      sources: sourceList(feeds),
      partialError: fetched.errors.length ? `${fetched.errors.length} de ${feeds.length} feeds indisponíveis` : null,
    };
  },
};

export function tagAi(item) {
  const hay = `${item.title} ${item.summary}`;
  return AI_TAGS.filter((t) => t.match.test(hay)).map((t) => t.id);
}

export function buildAi({ results, errors }, { maxAgeMs, now }) {
  const items = results.flatMap((r) => r.items.map((i) => ({ ...i, official: !!r.feed.official })));
  const { fresh, dropped } = filterFresh(dedupe(items, { threshold: 0.75 }), { maxAgeMs, now });
  const tagged = fresh.map((i) => ({ ...i, tags: tagAi(i) }));
  const counts = Object.fromEntries(AI_TAGS.map((t) => [t.id, 0]));
  for (const i of tagged) for (const t of i.tags) counts[t]++;
  return {
    tags: AI_TAGS.map(({ id, label }) => ({ id, label, count: counts[id] })),
    items: tagged.slice(0, 30),
    official: tagged.filter((i) => i.official).slice(0, 5),
    feedErrors: errors,
    feedsOk: results.length,
    feedsTotal: results.length + errors.length,
    droppedOld: dropped,
    newestAt: tagged[0]?.publishedAt ?? null,
  };
}

export const aiProvider = {
  id: 'ai',
  title: 'IA & Tecnologia',
  intervalMs: 15 * 60e3,
  minIntervalMs: 10 * 60e3,
  staleAfterMs: 60 * 60e3,
  manualCooldownMs: 60e3,
  async fetch({ http, force }) {
    const fetched = await fetchFeeds(http, AI_FEEDS, { ttlMs: force ? 0 : 8 * 60e3 });
    if (!fetched.results.length) throw new Error(`Nenhum feed de IA respondeu (${fetched.errors.length} falhas). Ex.: ${fetched.errors[0]?.message}`);
    // blogs oficiais publicam com menos frequência: janela de 7 dias
    const data = buildAi(fetched, { maxAgeMs: 7 * 24 * 3600e3, now: Date.now() });
    return {
      data,
      dataTime: data.newestAt,
      sources: sourceList(AI_FEEDS),
      partialError: fetched.errors.length ? `${fetched.errors.length} de ${AI_FEEDS.length} feeds indisponíveis` : null,
    };
  },
};
