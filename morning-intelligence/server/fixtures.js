// SOMENTE PARA DESENVOLVIMENTO/TESTES (MI_FIXTURES=1).
// Substitui a rede por arquivos locais em test/fixtures. Os conteúdos são fictícios e marcados como [Teste];
// as datas são geradas em relação ao horário atual para exercitar o filtro de recência.
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const rfc = (d) => d.toUTCString();
export function fillTemplate(src, now = Date.now()) {
  return src
    .replace(/\{\{rfc:(-?\d+)m\}\}/g, (_, m) => rfc(new Date(now - Number(m) * 60e3)))
    .replace(/\{\{iso:(-?\d+)m\}\}/g, (_, m) => new Date(now - Number(m) * 60e3).toISOString())
    .replace(/\{\{unix:(-?\d+)s\}\}/g, (_, s) => String(Math.floor(now / 1000) - Number(s)))
    .replace(/\{\{br-date:(\d+)d\}\}/g, (_, d) => new Date(now - Number(d) * 864e5).toLocaleDateString('pt-BR', { timeZone: 'UTC' }));
}

function weatherFixture(now = Date.now()) {
  const off = -3 * 3600;
  const local = (ms) => new Date(ms + off * 1000).toISOString().slice(0, 16);
  const hourStart = Math.floor(now / 3600e3) * 3600e3;
  const dayStart = Math.floor((now + off * 1000) / 864e5) * 864e5 - off * 1000;
  const hours = Array.from({ length: 7 * 24 }, (_, i) => dayStart + i * 3600e3);
  const days = Array.from({ length: 7 }, (_, i) => dayStart + i * 864e5);
  return {
    latitude: -23.55, longitude: -46.63, timezone: 'America/Sao_Paulo', utc_offset_seconds: off,
    current: { time: local(Math.floor(now / 900e3) * 900e3), temperature_2m: 23.4, apparent_temperature: 24.1, relative_humidity_2m: 71, precipitation: 0, weather_code: 2, wind_speed_10m: 11.2, wind_direction_10m: 140, is_day: 1 },
    hourly: {
      time: hours.map(local),
      precipitation_probability: hours.map((h) => { const hr = new Date(h + off * 1000).getUTCHours(); return hr >= 15 && hr <= 19 ? 65 : 10; }),
      temperature_2m: hours.map(() => 22),
    },
    daily: {
      time: days.map((d) => local(d).slice(0, 10)),
      weather_code: [80, 3, 61, 1, 0, 2, 95],
      temperature_2m_max: [28.1, 26.4, 22.9, 25.0, 27.8, 29.3, 27.0],
      temperature_2m_min: [18.2, 17.9, 16.4, 15.8, 17.1, 18.6, 19.0],
      precipitation_probability_max: [65, 30, 85, 10, 5, 20, 75],
      precipitation_sum: [4.2, 0.4, 12.5, 0, 0, 0.2, 8.1],
      uv_index_max: [9.1, 7.2, 4.0, 8.4, 10.2, 9.8, 6.5],
      sunrise: days.map((d) => local(d + 5 * 3600e3 + 12 * 60e3)),
      sunset: days.map((d) => local(d + 18 * 3600e3 + 31 * 60e3)),
    },
    _hourStart: hourStart,
  };
}

const RULES = [
  [/open-meteo\.com\/v1\/forecast/, () => JSON.stringify(weatherFixture())],
  [/geocoding-api\.open-meteo/, 'geocoding.json'],
  [/awesomeapi/, 'awesome.json'],
  [/coingecko/, 'coingecko.json'],
  [/bcdata\.sgs\.432\//, 'bcb-selic.json'],
  [/bcdata\.sgs\.13522\//, 'bcb-ipca.json'],
  [/openai\.com|blog\.google|techcrunch|verge\.com\/rss\/ai|Anthropic|OpenAI|Gemini|intelig/, 'rss-ai.xml'],
  [/topic\/WORLD|bbci/, 'rss-world.xml'],
  [/BUSINESS|economia|infomoney|mercado/, 'rss-economy.xml'],
  [/TECHNOLOGY|theverge/, 'rss-tech.xml'],
  [/./, 'rss-brasil.xml'],
];

export function createFixtureFetch(dir) {
  return async (url) => {
    const decoded = decodeURIComponent(url);
    const rule = RULES.find(([re]) => re.test(decoded));
    let body;
    if (typeof rule[1] === 'function') body = rule[1]();
    else {
      const p = join(dir, rule[1]);
      if (!existsSync(p)) return new Response('not found', { status: 404 });
      body = fillTemplate(readFileSync(p, 'utf8'));
    }
    await new Promise((r) => setTimeout(r, 150 + Math.random() * 400));
    return new Response(body, { status: 200, headers: { 'content-type': rule[1].toString().endsWith('.xml') ? 'application/rss+xml' : 'application/json' } });
  };
}
