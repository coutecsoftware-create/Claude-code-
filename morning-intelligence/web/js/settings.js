// Gaveta de configurações: módulos (ativar/ordenar), local, fuso, notícias e frequências.
import { h, api, toast } from './util.js';
import { icons } from './icons.js';

const TZ_COMMON = ['America/Sao_Paulo', 'America/Manaus', 'America/Belem', 'America/Fortaleza', 'America/Recife', 'America/Cuiaba', 'America/Porto_Velho', 'America/Rio_Branco', 'America/Noronha', 'America/New_York', 'Europe/Lisbon', 'Europe/London', 'UTC'];

const INTERVAL_CHOICES = {
  weather: [10, 15, 30, 60],
  news: [5, 10, 15, 30, 60],
  ai: [10, 15, 30, 60],
  markets: [1, 2, 5, 15],
};

let draft;

export function openSettings({ settings, meta, registry, onSave }) {
  draft = structuredClone(settings);
  const drawer = document.getElementById('drawer');
  const scrim = document.getElementById('drawer-scrim');
  const lastFocus = document.activeElement;

  const close = () => {
    drawer.classList.remove('open');
    drawer.setAttribute('aria-hidden', 'true');
    scrim.hidden = true;
    document.removeEventListener('keydown', onKey);
    lastFocus?.focus?.();
  };
  const onKey = (e) => { if (e.key === 'Escape') close(); };

  // --- módulos ---
  const modList = h('div');
  const drawModules = () => {
    modList.replaceChildren(...draft.layout.order.filter((id) => registry[id]).map((id, i, arr) => {
      const visible = !draft.layout.hidden.includes(id);
      return h('div', { class: 'mod-row' },
        h('label', { class: 'switch', title: visible ? 'Ocultar' : 'Exibir' },
          h('input', { type: 'checkbox', checked: visible, 'aria-label': `Exibir ${registry[id].title}`, onchange: (e) => {
            draft.layout.hidden = e.target.checked ? draft.layout.hidden.filter((x) => x !== id) : [...draft.layout.hidden, id];
          } }), h('span')),
        h('span', { class: 'name' }, registry[id].title),
        h('button', { class: 'btn btn-icon', type: 'button', disabled: i === 0, 'aria-label': `Mover ${registry[id].title} para cima`, onclick: () => move(id, -1) }, icons.up()),
        h('button', { class: 'btn btn-icon', type: 'button', disabled: i === arr.length - 1, 'aria-label': `Mover ${registry[id].title} para baixo`, onclick: () => move(id, 1) }, icons.down()));
    }));
  };
  const move = (id, dir) => {
    const o = draft.layout.order;
    const i = o.indexOf(id); const j = i + dir;
    if (j < 0 || j >= o.length) return;
    [o[i], o[j]] = [o[j], o[i]];
    drawModules();
    modList.querySelectorAll('.mod-row')[j]?.querySelectorAll('button')[dir < 0 ? 0 : 1]?.focus();
  };
  drawModules();

  // --- local ---
  const locLabel = h('div', { class: 'hint' });
  const showLoc = () => { locLabel.textContent = `Atual: ${[draft.location.name, draft.location.admin, draft.location.country].filter(Boolean).join(', ')} (${draft.location.latitude.toFixed(2)}, ${draft.location.longitude.toFixed(2)})`; };
  showLoc();
  const results = h('ul', { class: 'city-results', hidden: true });
  let searchTimer;
  const cityInput = h('input', { class: 'input', type: 'search', placeholder: 'Buscar cidade…', autocomplete: 'off', 'aria-label': 'Buscar cidade', oninput: (e) => {
    clearTimeout(searchTimer);
    const q = e.target.value.trim();
    if (q.length < 2) { results.hidden = true; return; }
    searchTimer = setTimeout(async () => {
      try {
        const { body } = await api(`/api/geocode?q=${encodeURIComponent(q)}`);
        const list = body.results ?? [];
        results.replaceChildren(...(list.length ? list.map((c) => h('li', null, h('button', { type: 'button', onclick: () => {
          draft.location = { name: c.name, admin: c.admin, country: c.country, latitude: c.latitude, longitude: c.longitude };
          if (c.timezone && tzSelect.querySelector(`option[value="${CSS.escape(c.timezone)}"]`)) { draft.timezone = c.timezone; tzSelect.value = c.timezone; }
          results.hidden = true; cityInput.value = ''; showLoc();
        } }, c.name, ' ', h('small', null, [c.admin, c.country].filter(Boolean).join(', '))))) : [h('li', null, h('button', { type: 'button', disabled: true }, body.error ?? 'Nenhuma cidade encontrada'))]));
        results.hidden = false;
      } catch (err) {
        results.replaceChildren(h('li', null, h('button', { type: 'button', disabled: true }, `Busca indisponível: ${err.message}`)));
        results.hidden = false;
      }
    }, 350);
  } });

  // --- fuso ---
  let allTz = TZ_COMMON;
  try { allTz = [...new Set([...TZ_COMMON, ...Intl.supportedValuesOf('timeZone')])]; } catch { /* navegadores antigos */ }
  const tzSelect = h('select', { class: 'select', 'aria-label': 'Fuso horário', onchange: (e) => { draft.timezone = e.target.value; } },
    allTz.map((tz) => h('option', { value: tz, selected: tz === draft.timezone }, tz.replace(/_/g, ' '))));

  // --- notícias ---
  const cats = h('div', { class: 'checks' }, meta.categories.map((c) => h('label', { class: 'check' },
    h('input', { type: 'checkbox', checked: draft.newsCategories.includes(c.id), onchange: (e) => {
      draft.newsCategories = e.target.checked ? [...draft.newsCategories, c.id] : draft.newsCategories.filter((x) => x !== c.id);
    } }), c.label)));
  const maxAge = h('select', { class: 'select', onchange: (e) => { draft.newsMaxAgeHours = Number(e.target.value); } },
    [12, 24, 36, 48, 72].map((v) => h('option', { value: v, selected: v === draft.newsMaxAgeHours }, `${v} horas`)));

  // --- frequências ---
  const ints = Object.entries(INTERVAL_CHOICES).map(([id, mins]) => {
    const m = meta.modules.find((x) => x.id === id);
    return h('div', { class: 'int-row' }, h('span', null, m.title),
      h('select', { class: 'select', 'aria-label': `Frequência de ${m.title}`, onchange: (e) => { draft.intervals[id] = e.target.value === 'default' ? null : Number(e.target.value) * 60e3; } },
        h('option', { value: 'default', selected: draft.intervals[id] == null }, `Padrão (${Math.round(m.defaultIntervalMs / 60e3)} min)`),
        mins.map((v) => h('option', { value: v, selected: draft.intervals[id] === v * 60e3 && draft.intervals[id] != null }, `A cada ${v} min`))));
  });

  const nameInput = h('input', { class: 'input', value: draft.name, maxlength: 40, placeholder: 'Opcional', oninput: (e) => { draft.name = e.target.value; } });

  const save = async () => {
    try {
      const { status, body } = await api('/api/settings', { method: 'PUT', body: JSON.stringify(draft) });
      if (status === 422) toast(`Algumas opções foram recusadas: ${body.errors.join('; ')}`);
      else toast('Configurações salvas.');
      onSave(body.settings);
      close();
    } catch (e) {
      toast(`Erro ao salvar: ${e.message}`);
    }
  };

  drawer.replaceChildren(
    h('div', { class: 'drawer-head' }, h('h2', { id: 'drawer-title' }, 'Configurações'), h('button', { class: 'btn btn-icon', type: 'button', 'aria-label': 'Fechar', onclick: close }, icons.close())),
    h('div', { class: 'drawer-body' },
      h('section', { class: 'set-section' }, h('h3', null, 'Perfil'),
        h('label', { class: 'field' }, h('span', null, 'Seu nome (para a saudação)'), nameInput)),
      h('section', { class: 'set-section' }, h('h3', null, 'Módulos'), h('p', { class: 'hint', style: { marginTop: 0 } }, 'Ative, oculte e reordene os cards do painel.'), modList),
      h('section', { class: 'set-section' }, h('h3', null, 'Localização e horário'),
        h('div', { class: 'field' }, h('span', null, 'Cidade para o clima'), cityInput, results, locLabel),
        h('label', { class: 'field' }, h('span', null, 'Fuso horário'), tzSelect)),
      h('section', { class: 'set-section' }, h('h3', null, 'Notícias'),
        h('div', { class: 'field' }, h('span', null, 'Categorias exibidas'), cats),
        h('label', { class: 'field' }, h('span', null, 'Ocultar notícias com mais de'), maxAge)),
      h('section', { class: 'set-section' }, h('h3', null, 'Frequência de atualização'),
        h('p', { class: 'hint', style: { marginTop: 0 } }, 'Limites mínimos protegem as fontes gratuitas contra excesso de requisições.'), ints),
      h('section', { class: 'set-section' }, h('h3', null, 'Resumo do dia'),
        h('p', { class: 'hint', style: { margin: 0 } }, meta.summarizers.map((s) => `${s.label}${s.active ? ' — ativo' : ''}`).join(' · '), '. A arquitetura permite plugar um modelo de IA no futuro (ver README).'))),
    h('div', { class: 'drawer-foot' },
      h('button', { class: 'btn', type: 'button', onclick: close }, 'Cancelar'),
      h('button', { class: 'btn btn-primary', type: 'button', onclick: save }, 'Salvar')));

  scrim.hidden = false;
  scrim.onclick = close;
  drawer.setAttribute('aria-hidden', 'false');
  requestAnimationFrame(() => drawer.classList.add('open'));
  document.addEventListener('keydown', onKey);
  setTimeout(() => nameInput.focus(), 50);
}
