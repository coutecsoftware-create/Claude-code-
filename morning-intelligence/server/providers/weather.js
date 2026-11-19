// Clima via Open-Meteo (gratuito, sem chave). Os modelos são atualizados em ciclos de ~15 min.
import { WEATHER } from '../config/sources.js';

// Códigos WMO -> descrição e ícone
export const WMO = {
  0: ['Céu limpo', 'clear'], 1: ['Predomínio de sol', 'clear'], 2: ['Parcialmente nublado', 'partly'], 3: ['Nublado', 'cloudy'],
  45: ['Nevoeiro', 'fog'], 48: ['Nevoeiro com geada', 'fog'],
  51: ['Garoa fraca', 'drizzle'], 53: ['Garoa', 'drizzle'], 55: ['Garoa forte', 'drizzle'], 56: ['Garoa congelante', 'drizzle'], 57: ['Garoa congelante forte', 'drizzle'],
  61: ['Chuva fraca', 'rain'], 63: ['Chuva moderada', 'rain'], 65: ['Chuva forte', 'rain'], 66: ['Chuva congelante', 'rain'], 67: ['Chuva congelante forte', 'rain'],
  71: ['Neve fraca', 'snow'], 73: ['Neve', 'snow'], 75: ['Neve forte', 'snow'], 77: ['Grãos de neve', 'snow'],
  80: ['Pancadas de chuva fracas', 'showers'], 81: ['Pancadas de chuva', 'showers'], 82: ['Pancadas de chuva fortes', 'showers'],
  85: ['Pancadas de neve', 'snow'], 86: ['Pancadas de neve fortes', 'snow'],
  95: ['Trovoadas', 'storm'], 96: ['Trovoadas com granizo', 'storm'], 99: ['Trovoadas com granizo forte', 'storm'],
};
export const describe = (code) => {
  const [label, icon] = WMO[code] ?? ['Condição desconhecida', 'cloudy'];
  return { code, label, icon };
};

export function buildForecastUrl({ latitude, longitude }) {
  const p = new URLSearchParams({
    latitude: String(latitude),
    longitude: String(longitude),
    current: 'temperature_2m,apparent_temperature,relative_humidity_2m,precipitation,weather_code,wind_speed_10m,wind_direction_10m,is_day',
    hourly: 'precipitation_probability,temperature_2m',
    daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum,sunrise,sunset,uv_index_max',
    timezone: 'auto',
    forecast_days: '7',
    wind_speed_unit: 'kmh',
  });
  return `${WEATHER.forecast}?${p}`;
}

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

// Open-Meteo devolve horários locais sem offset; utc_offset_seconds permite convertê-los.
function localToIso(local, offsetSec) {
  if (!local) return null;
  const ms = Date.parse(local.length === 16 ? `${local}:00Z` : `${local}Z`);
  return Number.isFinite(ms) ? new Date(ms - offsetSec * 1000).toISOString() : null;
}

export function mapForecast(json, nowMs = Date.now()) {
  if (!json?.current || !json?.daily?.time) throw new Error('Resposta do Open-Meteo sem dados atuais');
  const off = json.utc_offset_seconds ?? 0;
  const c = json.current;
  const d = json.daily;
  // probabilidade de chuva nas próximas 12 horas (a partir da hora atual)
  let rainNext12 = null;
  let rainPeakAt = null;
  if (json.hourly?.time) {
    let max = -1;
    json.hourly.time.forEach((t, i) => {
      const at = Date.parse(localToIso(t, off));
      if (at >= nowMs - 3600e3 && at <= nowMs + 12 * 3600e3) {
        const p = json.hourly.precipitation_probability?.[i];
        if (typeof p === 'number' && p > max) { max = p; rainPeakAt = localToIso(t, off); }
      }
    });
    rainNext12 = max >= 0 ? max : null;
  }
  const days = d.time.map((date, i) => ({
    date,
    max: num(d.temperature_2m_max?.[i]),
    min: num(d.temperature_2m_min?.[i]),
    rainProb: num(d.precipitation_probability_max?.[i]),
    rainMm: num(d.precipitation_sum?.[i]),
    uv: num(d.uv_index_max?.[i]),
    sunrise: localToIso(d.sunrise?.[i], off),
    sunset: localToIso(d.sunset?.[i], off),
    condition: describe(d.weather_code?.[i]),
  }));
  return {
    timezone: json.timezone,
    current: {
      observedAt: localToIso(c.time, off),
      temperature: num(c.temperature_2m),
      feelsLike: num(c.apparent_temperature),
      humidity: num(c.relative_humidity_2m),
      precipitation: num(c.precipitation),
      windSpeed: num(c.wind_speed_10m),
      windDirection: num(c.wind_direction_10m),
      isDay: c.is_day === 1,
      condition: describe(c.weather_code),
    },
    today: days[0],
    rainNext12,
    rainPeakAt,
    days,
  };
}

export const weatherProvider = {
  id: 'weather',
  title: 'Clima',
  intervalMs: 15 * 60e3,
  minIntervalMs: 10 * 60e3,
  staleAfterMs: 45 * 60e3,
  manualCooldownMs: 60e3,
  async fetch({ http, settings }) {
    const loc = settings.get().location;
    const url = buildForecastUrl(loc);
    const { json, fetchedAt } = await http.getJSON(url, { ttlMs: 5 * 60e3 });
    const data = mapForecast(json, fetchedAt);
    data.location = loc;
    return {
      data,
      dataTime: data.current.observedAt,
      sources: [{ name: WEATHER.name, url: WEATHER.site }],
    };
  },
};

export async function searchCity(http, query) {
  const q = String(query ?? '').trim().slice(0, 80);
  if (q.length < 2) return [];
  const url = `${WEATHER.geocoding}?${new URLSearchParams({ name: q, count: '6', language: 'pt', format: 'json' })}`;
  const { json } = await http.getJSON(url, { ttlMs: 24 * 3600e3 });
  return (json.results ?? []).map((r) => ({
    name: r.name, admin: r.admin1 ?? '', country: r.country ?? '',
    latitude: r.latitude, longitude: r.longitude, timezone: r.timezone,
  }));
}
