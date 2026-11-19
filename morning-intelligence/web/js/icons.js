// Ícones de linha minimalistas (SVG inline, herdam currentColor).
import { h } from './util.js';

const P = (d, extra = {}) => h('path', { d, fill: 'none', stroke: 'currentColor', 'stroke-width': 1.5, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', ...extra });
const C = (cx, cy, r, extra = {}) => h('circle', { cx, cy, r, fill: 'none', stroke: 'currentColor', 'stroke-width': 1.5, ...extra });
const svg = (...kids) => h('svg', { viewBox: '0 0 24 24', 'aria-hidden': 'true' }, kids);

const cloud = 'M7 18h10a4 4 0 0 0 .4-8A6 6 0 0 0 6 11a3.5 3.5 0 0 0 1 7z';
export const icons = {
  briefing: () => svg(P('M4 5h16M4 10h16M4 15h10M4 20h7'), C(19, 18, 2.5)),
  clock: () => svg(C(12, 12, 8.5), P('M12 7.5V12l3 2')),
  weather: () => svg(C(9, 9, 3.2), P('M9 2.5v1.3M2.5 9h1.3M4.4 4.4l.9.9M13.6 4.4l-.9.9'), P('M9 20h8.5a3.5 3.5 0 0 0 .3-7A5 5 0 0 0 9 14.2 3 3 0 0 0 9 20z')),
  markets: () => svg(P('M4 19h16'), P('M5 15l4-4 3 3 6-7'), P('M15 7h3v3')),
  news: () => svg(P('M5 5h11v14H6a1 1 0 0 1-1-1z'), P('M16 9h3v9a1 1 0 0 1-1 1h-2'), P('M8 9h5M8 12h5M8 15h3')),
  ai: () => svg(P('M12 3v3M12 18v3M3 12h3M18 12h3'), h('rect', { x: 7, y: 7, width: 10, height: 10, rx: 2, fill: 'none', stroke: 'currentColor', 'stroke-width': 1.5 }), P('M10 12h4M12 10v4')),
  refresh: () => svg(P('M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7')),
  up: () => svg(P('M6 14l6-6 6 6')),
  down: () => svg(P('M6 10l6 6 6-6')),
  close: () => svg(P('M6 6l12 12M18 6 6 18')),
  // condições do tempo
  clear: (day = true) => (day ? svg(C(12, 12, 4), P('M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4')) : svg(P('M19 14.5A7.5 7.5 0 0 1 9.5 5a7.5 7.5 0 1 0 9.5 9.5z'))),
  partly: () => svg(C(8, 8, 3), P('M8 2.5v1M2.5 8h1M4.1 4.1l.7.7M11.9 4.1l-.7.7'), P('M9 20h8.5a3.5 3.5 0 0 0 .3-7A5 5 0 0 0 9 14.2 3 3 0 0 0 9 20z')),
  cloudy: () => svg(P(cloud)),
  fog: () => svg(P(cloud.replace('h10', 'h10')), P('M4 21h16M6 15h12', { opacity: 0.6 })),
  drizzle: () => svg(P('M7 15h10a4 4 0 0 0 .4-8A6 6 0 0 0 6 8a3.5 3.5 0 0 0 1 7z'), P('M9 18v1M13 18v1M17 18v1')),
  rain: () => svg(P('M7 15h10a4 4 0 0 0 .4-8A6 6 0 0 0 6 8a3.5 3.5 0 0 0 1 7z'), P('M8.5 18l-1 2.5M12.5 18l-1 2.5M16.5 18l-1 2.5')),
  showers: () => svg(C(17, 6, 2.2), P('M6 15h9a3.5 3.5 0 0 0 .3-7A5 5 0 0 0 5.5 9 3 3 0 0 0 6 15z'), P('M8 18l-1 2.5M12 18l-1 2.5')),
  snow: () => svg(P('M7 15h10a4 4 0 0 0 .4-8A6 6 0 0 0 6 8a3.5 3.5 0 0 0 1 7z'), P('M9 18.5h.01M13 19.5h.01M17 18.5h.01', { 'stroke-width': 2.4 })),
  storm: () => svg(P('M7 15h10a4 4 0 0 0 .4-8A6 6 0 0 0 6 8a3.5 3.5 0 0 0 1 7z'), P('M12.5 14l-2 3.5h3l-2 3.5')),
};

export const wxIcon = (name, isDay = true) => (icons[name] ?? icons.cloudy)(isDay);
