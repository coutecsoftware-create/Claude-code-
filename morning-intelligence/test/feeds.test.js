import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseFeed, dedupe, filterFresh, stripHtml, safeUrl } from '../server/core/feeds.js';

const rss = `<?xml version="1.0"?><rss version="2.0"><channel><title>X</title>
<item><title>Governo anuncia medida - Folha</title><link>https://news.google.com/a?utm_source=x</link><pubDate>Thu, 19 Nov 2026 09:00:00 GMT</pubDate><source url="https://folha.uol.com.br">Folha</source><description>&lt;a href="x"&gt;lixo&lt;/a&gt;</description></item>
<item><title><![CDATA[Título <b>com</b> &amp; HTML]]></title><link>javascript:alert(1)</link><pubDate>Thu, 19 Nov 2026 09:00:00 GMT</pubDate></item>
</channel></rss>`;

const atom = `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom"><title>A</title>
<entry><title>Novo modelo lançado</title><link rel="alternate" href="https://ex.com/post"/><published>2026-11-19T08:00:00Z</published><summary>Resumo &lt;i&gt;curto&lt;/i&gt;</summary></entry></feed>`;

test('lê RSS de agregador: fonte original, título limpo, descrição descartada', () => {
  const items = parseFeed(rss, { id: 'g', name: 'Google Notícias', aggregator: true });
  assert.equal(items.length, 1, 'item com link javascript: deve ser descartado');
  assert.equal(items[0].title, 'Governo anuncia medida');
  assert.equal(items[0].source, 'Folha');
  assert.equal(items[0].via, 'Google Notícias');
  assert.equal(items[0].summary, '');
  assert.equal(items[0].publishedAt, '2026-11-19T09:00:00.000Z');
});

test('lê Atom', () => {
  const [it] = parseFeed(atom, { id: 'a', name: 'Blog' });
  assert.equal(it.link, 'https://ex.com/post');
  assert.equal(it.summary, 'Resumo curto');
});

test('rejeita XML que não é feed', () => {
  assert.throws(() => parseFeed('<html><body>oi</body></html>', { name: 'X' }), /Formato não reconhecido/);
});

test('stripHtml e safeUrl', () => {
  assert.equal(stripHtml('<p>a &amp; b&#39;s <script>x()</script>c</p>'), "a & b's c");
  assert.equal(safeUrl('javascript:alert(1)'), null);
  assert.equal(safeUrl('https://ok.com/x'), 'https://ok.com/x');
});

test('dedupe junta mesmo link, mesmo título e títulos parecidos', () => {
  const base = { summary: '', publishedAt: '2026-11-19T09:00:00Z' };
  const out = dedupe([
    { ...base, title: 'Câmara aprova reforma tributária em segundo turno', link: 'https://a.com/1', source: 'A' },
    { ...base, title: 'Camara aprova reforma tributaria em segundo turno!', link: 'https://b.com/2', source: 'B', publishedAt: '2026-11-19T08:00:00Z' },
    { ...base, title: 'Câmara aprova reforma tributária em segundo turno nesta quinta', link: 'https://c.com/3', source: 'C' },
    { ...base, title: 'Outra coisa', link: 'https://a.com/1?utm_source=feed', source: 'D' },
    { ...base, title: 'Assunto totalmente diferente sobre clima', link: 'https://e.com/9', source: 'E' },
  ]);
  assert.equal(out.length, 2);
  const main = out.find((o) => o.coveredBy.length > 1);
  assert.equal(main.source, 'B', 'mantém quem publicou primeiro');
  assert.deepEqual(main.coveredBy.sort(), ['A', 'B', 'C', 'D']);
});

test('filterFresh remove antigos, sem data e datas no futuro', () => {
  const now = Date.parse('2026-11-19T10:00:00Z');
  const { fresh, dropped } = filterFresh([
    { title: 'novo', publishedAt: '2026-11-19T09:30:00Z' },
    { title: 'velho', publishedAt: '2026-11-10T09:30:00Z' },
    { title: 'sem data', publishedAt: null },
    { title: 'futuro', publishedAt: '2026-11-20T09:30:00Z' },
    { title: 'médio', publishedAt: '2026-11-19T01:00:00Z' },
  ], { maxAgeMs: 24 * 3600e3, now });
  assert.deepEqual(fresh.map((f) => f.title), ['novo', 'médio']);
  assert.equal(dropped, 3);
});
