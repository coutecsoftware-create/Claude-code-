// Registro de módulos do painel. Para criar um módulo novo:
// 1) crie o provedor no servidor (server/providers) e registre em server/app.js;
// 2) crie o arquivo aqui com { id, title, icon, span, render(body, snap, ctx) } e adicione abaixo;
// 3) inclua o id em MODULE_IDS (server/core/settings.js).
import briefing from './briefing.js';
import clockMod from './clock.js';
import weather from './weather.js';
import markets from './markets.js';
import news from './news.js';
import ai from './ai.js';

export const registry = Object.fromEntries([briefing, clockMod, weather, markets, news, ai].map((m) => [m.id, m]));
