import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mapForecast, buildForecastUrl } from '../server/providers/weather.js';
import { mapAwesome, mapCoingecko, mapBcb } from '../server/providers/markets.js';
import { tagAi } from '../server/providers/news.js';

test('mapeia previsão do Open-Meteo convertendo horário local para UTC', () => {
  const now = Date.parse('2026-11-19T12:00:00Z'); // 09:00 em -03
  const json = {
    timezone: 'America/Sao_Paulo', utc_offset_seconds: -10800,
    current: { time: '2026-11-19T09:00', temperature_2m: 21.6, apparent_temperature: 22, relative_humidity_2m: 80, precipitation: 0, weather_code: 61, wind_speed_10m: 9, wind_direction_10m: 180, is_day: 1 },
    hourly: { time: ['2026-11-19T09:00', '2026-11-19T15:00', '2026-11-20T09:00'], precipitation_probability: [10, 70, 99] },
    daily: { time: ['2026-11-19'], weather_code: [61], temperature_2m_max: [25], temperature_2m_min: [17], precipitation_probability_max: [70], precipitation_sum: [3], sunrise: ['2026-11-19T05:12'], sunset: ['2026-11-19T18:31'], uv_index_max: [7] },
  };
  const d = mapForecast(json, now);
  assert.equal(d.current.observedAt, '2026-11-19T12:00:00.000Z');
  assert.equal(d.current.condition.label, 'Chuva fraca');
  assert.equal(d.rainNext12, 70, 'pega o pico das próximas 12h, ignorando o dia seguinte');
  assert.equal(d.rainPeakAt, '2026-11-19T18:00:00.000Z');
  assert.equal(d.today.sunrise, '2026-11-19T08:12:00.000Z');
  assert.throws(() => mapForecast({}), /sem dados/);
  assert.match(buildForecastUrl({ latitude: -23.5, longitude: -46.6 }), /latitude=-23.5&longitude=-46.6/);
});

test('mapeia AwesomeAPI, CoinGecko e BCB', () => {
  const q = mapAwesome({ USDBRL: { bid: '5.40', pctChange: '-0.39', high: '5.43', low: '5.38', timestamp: '1763546400' }, EURBRL: { bid: 'x' } });
  assert.equal(q.length, 1, 'valor inválido é descartado');
  assert.equal(q[0].value, 5.4);
  assert.equal(q[0].quotedAt, new Date(1763546400 * 1000).toISOString());
  const c = mapCoingecko({ bitcoin: { usd: 90000, usd_24h_change: 1.5, brl: 480000, last_updated_at: 1763546400 } });
  assert.equal(c[0].id, 'btcusd');
  const s = mapBcb({ id: 'selic', label: 'Selic', unit: '% a.a.' }, [{ data: '18/11/2026', valor: '10.75' }]);
  assert.deepEqual(s, { id: 'selic', label: 'Selic', unit: '% a.a.', value: 10.75, referenceDate: '2026-11-18' });
  assert.equal(mapBcb({}, []), null);
});

test('etiqueta notícias de IA por empresa e tema', () => {
  assert.deepEqual(tagAi({ title: 'Anthropic lança novo Claude', summary: '' }).sort(), ['anthropic', 'launch']);
  assert.ok(tagAi({ title: 'OpenAI apresenta agentes no ChatGPT', summary: '' }).includes('openai'));
});
