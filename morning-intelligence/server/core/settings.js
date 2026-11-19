// Configurações do usuário guardadas no servidor (data/settings.json).
// Tudo que chega do navegador é validado aqui antes de ser salvo.
import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync } from 'node:fs';
import { dirname } from 'node:path';
import { NEWS_CATEGORIES } from '../config/sources.js';

export const MODULE_IDS = ['briefing', 'clock', 'weather', 'markets', 'news', 'ai'];

export const INTERVAL_LIMITS = {
  weather: { min: 10 * 60e3, max: 3 * 3600e3 },
  news: { min: 5 * 60e3, max: 3 * 3600e3 },
  ai: { min: 10 * 60e3, max: 6 * 3600e3 },
  markets: { min: 60e3, max: 3600e3 },
};

export function defaultSettings(env = process.env) {
  return {
    name: '',
    timezone: env.MI_TIMEZONE || 'America/Sao_Paulo',
    location: {
      name: env.MI_CITY || 'São Paulo',
      admin: 'São Paulo',
      country: 'Brasil',
      latitude: Number(env.MI_LAT ?? -23.5475),
      longitude: Number(env.MI_LON ?? -46.63611),
    },
    newsCategories: NEWS_CATEGORIES.map((c) => c.id),
    newsMaxAgeHours: 36,
    intervals: {}, // { weather: ms, ... } — vazio = padrão de cada módulo
    layout: {
      order: [...MODULE_IDS],
      hidden: [],
    },
  };
}

const isTz = (tz) => {
  try { new Intl.DateTimeFormat('pt-BR', { timeZone: tz }); return true; } catch { return false; }
};
const cleanStr = (s, max = 80) => String(s ?? '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, max);

export function validateSettings(input, base) {
  const out = structuredClone(base);
  const errors = [];
  if (input == null || typeof input !== 'object') return { settings: out, errors: ['corpo inválido'] };

  if ('name' in input) out.name = cleanStr(input.name, 40);
  if ('timezone' in input) {
    if (isTz(input.timezone)) out.timezone = input.timezone; else errors.push('fuso horário inválido');
  }
  if (input.location) {
    const { latitude, longitude } = input.location;
    if (Number.isFinite(latitude) && Number.isFinite(longitude) && Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180) {
      out.location = {
        name: cleanStr(input.location.name) || 'Local',
        admin: cleanStr(input.location.admin),
        country: cleanStr(input.location.country),
        latitude, longitude,
      };
    } else errors.push('localização inválida');
  }
  if (Array.isArray(input.newsCategories)) {
    const valid = new Set(NEWS_CATEGORIES.map((c) => c.id));
    out.newsCategories = [...new Set(input.newsCategories.filter((c) => valid.has(c)))];
  }
  if ('newsMaxAgeHours' in input) {
    const h = Number(input.newsMaxAgeHours);
    if (h >= 6 && h <= 168) out.newsMaxAgeHours = Math.round(h); else errors.push('idade máxima de notícias fora do intervalo (6–168 h)');
  }
  if (input.intervals && typeof input.intervals === 'object') {
    for (const [id, ms] of Object.entries(input.intervals)) {
      const lim = INTERVAL_LIMITS[id];
      if (!lim) continue;
      if (ms == null) { delete out.intervals[id]; continue; }
      const v = Number(ms);
      if (Number.isFinite(v)) out.intervals[id] = Math.min(Math.max(v, lim.min), lim.max);
    }
  }
  if (input.layout) {
    const ids = new Set(MODULE_IDS);
    if (Array.isArray(input.layout.order)) {
      const order = [...new Set(input.layout.order.filter((i) => ids.has(i)))];
      for (const id of MODULE_IDS) if (!order.includes(id)) order.push(id);
      out.layout.order = order;
    }
    if (Array.isArray(input.layout.hidden)) out.layout.hidden = [...new Set(input.layout.hidden.filter((i) => ids.has(i)))];
  }
  return { settings: out, errors };
}

export class SettingsStore {
  constructor(path, env = process.env) {
    this.path = path;
    this.listeners = new Set();
    const defaults = defaultSettings(env);
    let saved = {};
    if (path && existsSync(path)) {
      try { saved = JSON.parse(readFileSync(path, 'utf8')); } catch { saved = {}; }
    }
    this.value = validateSettings(saved, defaults).settings;
  }
  get() { return structuredClone(this.value); }
  update(patch) {
    const { settings, errors } = validateSettings(patch, this.value);
    const prev = this.value;
    this.value = settings;
    if (this.path) {
      mkdirSync(dirname(this.path), { recursive: true });
      const tmp = `${this.path}.tmp`;
      writeFileSync(tmp, JSON.stringify(settings, null, 2));
      renameSync(tmp, this.path);
    }
    for (const fn of this.listeners) fn(settings, prev);
    return { settings: this.get(), errors };
  }
  onChange(fn) { this.listeners.add(fn); }
}
