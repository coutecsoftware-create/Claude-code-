// Relógio local (não depende do servidor). Usa nascer/pôr do sol do módulo de clima quando disponível.
import { h, clock, fmtTime } from '../util.js';

const parts = (tz) => {
  const d = new Date(clock.now());
  const f = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23', timeZone: tz }).formatToParts(d);
  const get = (t) => f.find((p) => p.type === t)?.value ?? '00';
  return { h: get('hour'), m: get('minute'), s: get('second'), d };
};

function greeting(hour) {
  if (hour >= 5 && hour < 12) return 'Bom dia';
  if (hour >= 12 && hour < 18) return 'Boa tarde';
  return 'Boa noite';
}

function tzLabel(tz, d) {
  const off = new Intl.DateTimeFormat('pt-BR', { timeZone: tz, timeZoneName: 'shortOffset' }).formatToParts(d).find((p) => p.type === 'timeZoneName')?.value;
  return `${tz.replace(/_/g, ' ')} · ${off ?? ''}`;
}

const els = {};
export default {
  id: 'clock',
  title: 'Horário',
  icon: 'clock',
  span: 4,
  local: true,
  uses: ['weather'],
  mount(body, ctx) {
    els.time = h('div', { class: 'clock-time mono', 'aria-live': 'off' });
    els.date = h('div', { class: 'clock-date' });
    els.meta = h('div', { class: 'clock-meta' });
    els.sun = h('div', { class: 'dayline-sun' });
    els.now = h('div', { class: 'dayline-now' });
    els.labels = h('div', { class: 'dayline-labels' });
    els.facts = h('div', { class: 'clock-facts' });
    body.replaceChildren(h('div', { class: 'clock' },
      h('div', { class: 'label', id: 'clock-greet' }),
      els.time, els.date, els.meta, els.facts,
      h('div', { class: 'dayline' }, h('div', { class: 'dayline-track' }, els.sun, els.now), els.labels)));
    this.onDependency(body, ctx);
    this.tick(body, ctx);
  },
  onDependency(body, ctx) {
    if (!els.sun) return;
    const tz = ctx.settings.timezone;
    const today = ctx.snap('weather')?.data?.today;
    if (today?.sunrise && today?.sunset) {
      const pos = (iso) => {
        const [hh, mm] = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: tz }).format(new Date(iso)).split(':');
        return ((+hh) * 60 + (+mm)) / 1440 * 100;
      };
      const a = pos(today.sunrise); const b = pos(today.sunset);
      els.sun.style.left = `${a}%`; els.sun.style.width = `${Math.max(0, b - a)}%`;
      els.labels.replaceChildren(h('span', null, '00h'), h('span', null, `☀ ${fmtTime(today.sunrise, tz)}`), h('span', null, `☾ ${fmtTime(today.sunset, tz)}`), h('span', null, '24h'));
    } else {
      els.sun.style.width = '0';
      els.labels.replaceChildren(h('span', null, '00h'), h('span', null, '12h'), h('span', null, '24h'));
    }
  },
  facts(ctx, p) {
    const tz = ctx.settings.timezone;
    const ymd = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(p.d);
    const [Y, M, D] = ymd.split('-').map(Number);
    const doy = Math.round((Date.UTC(Y, M - 1, D) - Date.UTC(Y, 0, 0)) / 864e5);
    const days = (Y % 4 === 0 && Y % 100 !== 0) || Y % 400 === 0 ? 366 : 365;
    const wdIdx = new Date(Date.UTC(Y, M - 1, D)).getUTCDay();
    const toWeekend = wdIdx === 0 || wdIdx === 6 ? 'É fim de semana' : `${6 - wdIdx} dia${6 - wdIdx > 1 ? 's' : ''}`;
    const today = ctx.snap('weather')?.data?.today;
    let sunLabel = 'Sol'; let sunVal = '—';
    if (today?.sunrise && today?.sunset) {
      const now = p.d.getTime(); const rise = Date.parse(today.sunrise); const set = Date.parse(today.sunset);
      const dur = (ms) => { const m = Math.max(0, Math.round(ms / 60000)); return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}min`; };
      if (now < rise) { sunLabel = 'Nascer do sol em'; sunVal = dur(rise - now); }
      else if (now < set) { sunLabel = 'Pôr do sol em'; sunVal = dur(set - now); }
      else { sunLabel = 'Duração do dia'; sunVal = dur(set - rise); }
    }
    const items = [['Dia do ano', `${doy} / ${days}`], ['Ano decorrido', `${Math.round((doy / days) * 100)}%`], ['Até o sábado', toWeekend], [sunLabel, sunVal]];
    const key = JSON.stringify(items);
    if (els.facts.dataset.v === key) return;
    els.facts.dataset.v = key;
    els.facts.replaceChildren(...items.map(([l, v]) => h('div', null, h('span', { class: 'label' }, l), h('b', null, v))));
  },
  tick(body, ctx) {
    if (!els.time) return;
    const tz = ctx.settings.timezone;
    const p = parts(tz);
    els.time.replaceChildren(`${p.h}:${p.m}`, h('span', { class: 'sec' }, p.s));
    const raw = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: tz }).format(p.d);
    const dateStr = raw.charAt(0).toUpperCase() + raw.slice(1);
    if (els.date.textContent !== dateStr) els.date.textContent = dateStr;
    const greet = `${greeting(+p.h)}${ctx.settings.name ? `, ${ctx.settings.name}` : ''}`;
    const g = body.querySelector('#clock-greet');
    if (g && g.textContent !== greet) g.textContent = greet;
    const week = (() => { const d = new Date(Date.UTC(p.d.getUTCFullYear(), p.d.getUTCMonth(), p.d.getUTCDate())); const day = d.getUTCDay() || 7; d.setUTCDate(d.getUTCDate() + 4 - day); return Math.ceil(((d - Date.UTC(d.getUTCFullYear(), 0, 1)) / 864e5 + 1) / 7); })();
    const metaStr = `${tzLabel(tz, p.d)}|Semana ${week}`;
    if (els.meta.dataset.v !== metaStr) {
      els.meta.dataset.v = metaStr;
      els.meta.replaceChildren(...metaStr.split('|').map((s) => h('span', null, s)));
    }
    this.facts(ctx, p);
    els.now.style.left = `${((+p.h) * 60 + (+p.m)) / 1440 * 100}%`;
  },
};
