import { h, extLink, ago } from '../util.js';

const REF = { weather: 'Clima', markets: 'Mercado', news: 'Notícias', ai: 'IA', clock: 'Hoje' };

export default {
  id: 'briefing',
  title: 'Morning Briefing',
  icon: 'briefing',
  span: 8,
  dataTimeLabel: 'Gerado',
  render(body, snap, ctx) {
    const { paragraphs, summarizer, basedOn } = snap.data;
    const [first, ...rest] = paragraphs;
    // destaca a saudação
    const greet = first ? (() => {
      const m = first.text.match(/^([^!]+!)\s*(.*)$/);
      return h('p', { class: 'briefing-greet' }, m ? [h('em', null, m[1]), ' ', m[2]] : first.text);
    })() : null;
    const list = h('ul', { class: 'briefing-list' }, rest.map((p) => h('li', { class: 'briefing-p', 'data-notice': p.notice || null },
      h('span', { class: 'briefing-tag' }, p.refs.map((r) => REF[r] ?? r).join(' · ')),
      p.text,
      p.items?.length ? h('ol', { class: 'briefing-items' }, p.items.map((it, i) => h('li', null,
        h('span', { class: 'n' }, String(i + 1).padStart(2, '0')),
        h('span', null, extLink(it.link, it.title), ' ',
          h('small', null, `${it.source} · ${ago(it.publishedAt)}${it.coveredBy > 1 ? ` · ${it.coveredBy} fontes` : ''}${it.official ? ' · canal oficial' : ''}`))))) : null)));
    body.replaceChildren(greet, list,
      h('p', { class: 'hint', style: { marginTop: '14px' } },
        `${summarizer.label}. Baseado em: ${basedOn.length ? basedOn.map((b) => REF[b.id]).join(', ') : 'nenhum módulo com dados atuais'}.`));
  },
};
