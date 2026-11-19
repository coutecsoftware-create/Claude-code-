import { h, extLink, ago, fmtTime } from '../util.js';

let filter = 'all';

export default {
  id: 'ai',
  title: 'IA & Tecnologia',
  icon: 'ai',
  span: 4,
  spanMd: 6,
  dataTimeLabel: 'Publicação mais recente',
  render(body, snap, ctx) {
    const d = snap.data;
    const tz = ctx.settings.timezone;
    const tagLabel = Object.fromEntries(d.tags.map((t) => [t.id, t.label]));
    const list = h('div', { class: 'news-scroll', style: { maxHeight: '560px' } });
    const draw = () => {
      const items = (filter === 'all' ? d.items : d.items.filter((i) => i.tags.includes(filter))).slice(0, 14);
      list.replaceChildren(...(items.length ? items.map((it) => h('article', { class: 'ai-item' },
        extLink(it.link, it.title, 'news-title'),
        h('div', { class: 'news-meta' },
          it.official ? h('span', { class: 'badge violet' }, 'OFICIAL') : null,
          h('span', { class: 'src' }, it.source),
          h('span', { class: 'rel', 'data-iso': it.publishedAt, title: `${fmtTime(it.publishedAt, tz)} · ${new Date(it.publishedAt).toLocaleDateString('pt-BR')}` }, ago(it.publishedAt)),
          it.tags.filter((t) => ['anthropic', 'openai', 'google', 'meta', 'launch'].includes(t)).slice(0, 2).map((t) => h('span', { class: 'badge' }, tagLabel[t]))))) : [h('div', { class: 'empty' }, 'Nada recente neste filtro.')]));
    };
    const visible = d.tags.filter((t) => t.count > 0);
    if (filter !== 'all' && !visible.some((t) => t.id === filter)) filter = 'all';
    const filters = h('div', { class: 'ai-filters', role: 'group', 'aria-label': 'Filtrar por assunto' },
      [{ id: 'all', label: 'Tudo', count: d.items.length }, ...visible].map((t) => h('button', {
        class: 'filter', type: 'button', 'aria-pressed': String(filter === t.id),
        onclick: (ev) => { filter = t.id; for (const b of filters.children) b.setAttribute('aria-pressed', String(b === ev.currentTarget)); draw(); },
      }, t.label, h('span', { class: 'count' }, t.count))));
    draw();
    const notes = [];
    if (d.feedErrors.length) notes.push(`${d.feedsOk}/${d.feedsTotal} feeds responderam.`);
    notes.push('Janela: últimos 7 dias.');
    body.replaceChildren(filters, list, h('p', { class: 'hint', style: { margin: '10px 0 0' } }, notes.join(' ')));
  },
  relativeTick(body) {
    for (const el of body?.querySelectorAll('.rel[data-iso]') ?? []) el.textContent = ago(el.dataset.iso);
  },
};
