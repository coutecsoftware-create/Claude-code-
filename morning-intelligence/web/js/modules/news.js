import { h, extLink, ago, fmtTime, clock } from '../util.js';

let active = 'destaques';

function item(it, tz) {
  const fresh = clock.now() - Date.parse(it.publishedAt) < 60 * 60e3;
  return h('li', { class: 'news-item' },
    h('div', { class: 'news-time', title: new Date(it.publishedAt).toLocaleString('pt-BR') }, h('b', null, fmtTime(it.publishedAt, tz)), h('span', { class: 'rel', 'data-iso': it.publishedAt }, ago(it.publishedAt))),
    h('div', null,
      extLink(it.link, it.title, 'news-title'),
      it.summary ? h('p', { class: 'news-sum' }, it.summary) : null,
      h('div', { class: 'news-meta' },
        h('span', { class: 'src' }, it.source),
        it.via ? h('span', null, `via ${it.via}`) : null,
        fresh ? h('span', { class: 'badge new' }, 'NOVO') : null,
        it.coveredBy?.length > 1 ? h('span', { class: 'badge', title: it.coveredBy.join(', ') }, `+${it.coveredBy.length - 1} fonte${it.coveredBy.length > 2 ? 's' : ''}`) : null)));
}

export default {
  id: 'news',
  title: 'Notícias',
  icon: 'news',
  span: 8,
  dataTimeLabel: 'Publicação mais recente',
  render(body, snap, ctx) {
    const d = snap.data;
    const tz = ctx.settings.timezone;
    const tabsDef = [{ id: 'destaques', label: 'Destaques', count: d.highlights.length }, ...d.categories.map((c) => ({ id: c.id, label: c.label, count: d.items[c.id]?.length ?? 0 }))];
    if (!tabsDef.some((t) => t.id === active)) active = 'destaques';
    const list = h('ul', { class: 'news-list' });
    const draw = () => {
      const items = active === 'destaques' ? d.highlights : d.items[active] ?? [];
      list.replaceChildren(...(items.length ? items.map((i) => item(i, tz)) : [h('li', { class: 'empty' }, 'Nenhuma notícia recente nesta categoria.')]));
    };
    const tabs = h('div', { class: 'tabs', role: 'tablist' }, tabsDef.map((t) => h('button', {
      class: 'tab', role: 'tab', type: 'button', 'aria-selected': String(t.id === active),
      onclick: (ev) => {
        active = t.id;
        for (const b of tabs.children) b.setAttribute('aria-selected', String(b === ev.currentTarget));
        draw();
      },
    }, t.label, h('span', { class: 'count' }, t.count))));
    draw();
    const notes = [];
    if (d.feedErrors.length) notes.push(`${d.feedsOk}/${d.feedsTotal} feeds responderam (indisponíveis: ${[...new Set(d.feedErrors.map((e) => e.name))].join(', ')}).`);
    if (d.droppedOld) notes.push(`${d.droppedOld} itens antigos ou sem data foram ocultados.`);
    body.replaceChildren(tabs, h('div', { class: 'news-scroll' }, list), notes.length ? h('p', { class: 'hint', style: { margin: '10px 0 0' } }, notes.join(' ')) : null);
  },
  relativeTick(body) {
    // atualiza "há X min" sem redesenhar o módulo
    for (const el of body?.querySelectorAll('.rel[data-iso]') ?? []) el.textContent = ago(el.dataset.iso);
  },
};
export { item as newsItem };
