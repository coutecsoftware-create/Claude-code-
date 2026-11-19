import { h, fmtTime } from '../util.js';
import { wxIcon } from '../icons.js';

const wd = (deg) => (deg == null ? '' : ['N', 'NE', 'L', 'SE', 'S', 'SO', 'O', 'NO'][Math.round(deg / 45) % 8]);
const r = (v) => (v == null ? '—' : Math.round(v));

export default {
  id: 'weather',
  title: 'Clima',
  icon: 'weather',
  span: 6,
  dataTimeLabel: 'Observação',
  render(body, snap, ctx) {
    const { current: c, today, days, location, rainNext12 } = snap.data;
    const tz = ctx.settings.timezone;
    const stat = (label, value) => h('div', { class: 'wx-stat' }, h('span', { class: 'label' }, label), h('b', null, value));
    const lo = Math.min(...days.map((d) => d.min ?? Infinity));
    const hi = Math.max(...days.map((d) => d.max ?? -Infinity));
    const span = Math.max(1, hi - lo);
    const dayName = (iso, i) => (i === 0 ? 'Hoje' : new Intl.DateTimeFormat('pt-BR', { weekday: 'short', timeZone: 'UTC' }).format(new Date(`${iso}T12:00:00Z`)).replace('.', ''));
    body.replaceChildren(
      h('div', { class: 'wx-now' },
        h('div', { class: 'wx-icon' }, wxIcon(c.condition.icon, c.isDay)),
        h('div', { class: 'wx-temp' }, r(c.temperature), h('sup', null, '°C')),
        h('div', null,
          h('div', { class: 'wx-cond' }, c.condition.label),
          h('div', { class: 'wx-place' }, [location.name, location.admin, location.country].filter(Boolean).join(', ')),
          h('div', { class: 'wx-place mono' }, `Máx ${r(today?.max)}° · Mín ${r(today?.min)}°`))),
      h('div', { class: 'wx-stats' },
        stat('Sensação', `${r(c.feelsLike)}°C`),
        stat('Umidade', `${r(c.humidity)}%`),
        stat('Vento', `${r(c.windSpeed)} km/h ${wd(c.windDirection)}`),
        stat('Chuva 12h', rainNext12 == null ? '—' : `${rainNext12}%`),
        stat('Chuva hoje', today?.rainProb == null ? '—' : `${today.rainProb}%`),
        stat('Sol', today?.sunrise ? `${fmtTime(today.sunrise, tz)}–${fmtTime(today.sunset, tz)}` : '—')),
      h('div', { class: 'wx-days', role: 'list', 'aria-label': 'Previsão para os próximos dias' }, days.map((d, i) => h('div', { class: 'wx-day', role: 'listitem', title: `${d.condition.label} · chuva ${d.rainProb ?? '—'}% (${d.rainMm ?? '—'} mm)` },
        h('div', { class: 'd' }, dayName(d.date, i)),
        wxIcon(d.condition.icon, true),
        h('div', { class: 't' }, `${r(d.max)}°`),
        h('div', { class: 'wx-range', 'aria-hidden': 'true' }, h('i', { style: { bottom: `${((d.min - lo) / span) * 100}%`, top: `${100 - ((d.max - lo) / span) * 100}%` } })),
        h('div', { class: 't' }, h('span', null, `${r(d.min)}°`)),
        h('div', { class: 'p' }, d.rainProb == null ? '' : `${d.rainProb}%`)))));
  },
};
