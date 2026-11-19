// Leitura de RSS/Atom, limpeza, deduplicação e ordenação de notícias.
import { XMLParser } from 'fast-xml-parser';
import { createHash } from 'node:crypto';

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@',
  textNodeName: '#text',
  processEntities: true,
  htmlEntities: true,
  trimValues: true,
});

const arr = (v) => (v == null ? [] : Array.isArray(v) ? v : [v]);
const text = (v) => {
  if (v == null) return '';
  if (typeof v === 'string' || typeof v === 'number') return String(v);
  if (typeof v === 'object') return text(v['#text'] ?? v['@href'] ?? '');
  return '';
};

const ENTITY = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'" };
export function stripHtml(s) {
  return String(s ?? '')
    .replace(/<!\[CDATA\[|\]\]>/g, '')
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&(#\d+|#x[0-9a-f]+|[a-z]+);/gi, (m, e) => {
      if (e[0] === '#') {
        const code = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
        return Number.isFinite(code) ? String.fromCodePoint(code) : ' ';
      }
      return ENTITY[e.toLowerCase()] ?? m;
    })
    .replace(/\s+/g, ' ')
    .trim();
}

export function truncate(s, n = 220) {
  if (s.length <= n) return s;
  const cut = s.slice(0, n);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(' '), n - 20)).trim()}…`;
}

export function safeUrl(u) {
  try {
    const url = new URL(String(u).trim());
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : null;
  } catch {
    return null;
  }
}

function parseDate(...cands) {
  for (const c of cands) {
    const s = text(c);
    if (!s) continue;
    const t = Date.parse(s);
    if (Number.isFinite(t)) return new Date(t).toISOString();
  }
  return null;
}

function atomLink(links) {
  const list = arr(links);
  const alt = list.find((l) => typeof l === 'object' && (l['@rel'] == null || l['@rel'] === 'alternate')) ?? list[0];
  return typeof alt === 'string' ? alt : alt?.['@href'];
}

/** Converte XML de RSS 2.0 / RDF / Atom em itens normalizados. */
export function parseFeed(xml, feed) {
  let doc;
  try {
    doc = parser.parse(xml);
  } catch (e) {
    throw new Error(`XML inválido em ${feed.name}: ${e.message}`);
  }
  const rssItems = doc?.rss?.channel?.item ?? doc?.['rdf:RDF']?.item;
  const atomItems = doc?.feed?.entry;
  if (rssItems == null && atomItems == null) {
    if (doc?.rss || doc?.feed || doc?.['rdf:RDF']) return [];
    throw new Error(`Formato não reconhecido em ${feed.name}`);
  }
  const items = [];
  for (const it of arr(rssItems)) {
    let title = stripHtml(text(it.title));
    let source = feed.name;
    let sourceUrl = null;
    if (feed.aggregator) {
      const src = it.source;
      const srcName = stripHtml(text(src));
      if (srcName) {
        source = srcName;
        sourceUrl = safeUrl(src?.['@url']);
        // Google Notícias acrescenta " - Fonte" ao título
        const suffix = ` - ${srcName}`;
        if (title.endsWith(suffix)) title = title.slice(0, -suffix.length).trim();
      }
    }
    let summary = stripHtml(text(it.description ?? it['content:encoded']));
    if (feed.aggregator) summary = ''; // descrição do agregador só repete o título com links
    items.push({
      title,
      summary: truncate(summary),
      link: safeUrl(text(it.link) || text(it.guid)),
      source,
      sourceUrl,
      via: feed.aggregator ? feed.name : null,
      publishedAt: parseDate(it.pubDate, it['dc:date'], it.published, it.updated),
      feedId: feed.id,
    });
  }
  for (const it of arr(atomItems)) {
    items.push({
      title: stripHtml(text(it.title)),
      summary: truncate(stripHtml(text(it.summary ?? it.content))),
      link: safeUrl(atomLink(it.link)),
      source: feed.name,
      sourceUrl: null,
      via: null,
      publishedAt: parseDate(it.published, it.updated),
      feedId: feed.id,
    });
  }
  return items.filter((i) => i.title && i.link);
}

export function normalizeTitle(t) {
  return t
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const STOP = new Set('a o as os de da do das dos e em no na nos nas um uma para por com que se ao the of and to in on for is at by with from after sobre mais apos diz'.split(' '));
export function tokens(t) {
  return new Set(normalizeTitle(t).split(' ').filter((w) => w.length > 2 && !STOP.has(w)));
}

export function similarity(a, b) {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const w of a) if (b.has(w)) inter++;
  return inter / Math.min(a.size, b.size);
}

function canonicalLink(u) {
  try {
    const url = new URL(u);
    for (const k of [...url.searchParams.keys()]) if (/^utm_|^(ref|cmpid|fbclid|gclid)$/i.test(k)) url.searchParams.delete(k);
    url.hash = '';
    return `${url.host}${url.pathname}${url.search}`.replace(/\/$/, '');
  } catch {
    return u;
  }
}

/**
 * Remove duplicatas (mesmo link, mesmo título normalizado, ou títulos muito parecidos).
 * Mantém o item mais antigo publicado (quem deu primeiro) e conta quantas fontes cobriram o assunto.
 */
export function dedupe(items, { threshold = 0.8 } = {}) {
  const sorted = [...items].sort((a, b) => (Date.parse(a.publishedAt ?? 0) || 0) - (Date.parse(b.publishedAt ?? 0) || 0));
  const kept = [];
  const byLink = new Map();
  const byTitle = new Map();
  for (const it of sorted) {
    const lk = canonicalLink(it.link);
    const nt = normalizeTitle(it.title);
    let dup = byLink.get(lk) ?? byTitle.get(nt);
    if (!dup) {
      const tk = tokens(it.title);
      if (tk.size >= 4) dup = kept.find((k) => similarity(k._tokens, tk) >= threshold);
    }
    if (dup) {
      if (!dup.coveredBy.includes(it.source)) dup.coveredBy.push(it.source);
      if (!dup.summary && it.summary) dup.summary = it.summary;
      if (!byLink.has(lk)) byLink.set(lk, dup);
      if (!byTitle.has(nt)) byTitle.set(nt, dup);
      continue;
    }
    const entry = { ...it, coveredBy: [it.source], _tokens: tokens(it.title) };
    entry.id = createHash('sha1').update(lk).digest('hex').slice(0, 12);
    kept.push(entry);
    byLink.set(lk, entry);
    byTitle.set(nt, entry);
  }
  return kept.map(({ _tokens, ...rest }) => rest);
}

/** Separa itens recentes dos antigos/sem data. Nada é apresentado como novo sem data de publicação. */
export function filterFresh(items, { maxAgeMs, now = Date.now() }) {
  const fresh = [];
  let dropped = 0;
  for (const it of items) {
    const t = Date.parse(it.publishedAt ?? '');
    if (!Number.isFinite(t)) { dropped++; continue; }
    if (t > now + 10 * 60e3) { dropped++; continue; } // data no futuro = dado inconsistente
    if (now - t > maxAgeMs) { dropped++; continue; }
    fresh.push(it);
  }
  fresh.sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt));
  return { fresh, dropped };
}

/** Busca vários feeds em paralelo (com limite) e devolve itens + erros por feed. */
export async function fetchFeeds(http, feeds, { ttlMs, concurrency = 4 }) {
  const results = [];
  const errors = [];
  let i = 0;
  async function worker() {
    while (i < feeds.length) {
      const feed = feeds[i++];
      try {
        const { body, fetchedAt } = await http.getText(feed.url, { ttlMs });
        const items = parseFeed(body, feed);
        results.push({ feed, items, fetchedAt });
      } catch (e) {
        errors.push({ feedId: feed.id, name: feed.name, category: feed.category, message: e.message });
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, feeds.length) }, worker));
  return { results, errors };
}
