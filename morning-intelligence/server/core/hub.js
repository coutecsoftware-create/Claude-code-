// ModuleHub: registra provedores de dados, agenda as atualizações, guarda o último estado
// de cada módulo e avisa os assinantes (SSE) quando algo muda.
//
// Contrato de um provedor:
// {
//   id, title,
//   intervalMs,        // frequência padrão de atualização
//   minIntervalMs,     // menor intervalo permitido (respeita limites das APIs)
//   staleAfterMs,      // a partir de quanto tempo sem atualizar o dado é considerado desatualizado
//   dependsOn?: [ids], // provedores derivados (ex.: briefing) rodam quando estes mudam
//   async fetch(ctx) -> { data, sources: [{name,url}], dataTime?: ISO }  // dataTime = horário informado pela fonte
// }
import { log } from './log.js';

export class ModuleHub {
  constructor({ ctx, now = Date.now, setTimer = setTimeout, clearTimer = clearTimeout } = {}) {
    this.ctx = ctx;
    this.now = now;
    this.setTimer = setTimer;
    this.clearTimer = clearTimer;
    this.providers = new Map();
    this.snapshots = new Map();
    this.timers = new Map();
    this.running = new Map();
    this.failures = new Map();
    this.listeners = new Set();
    this.intervals = new Map(); // overrides vindos das configurações
    this.started = false;
  }

  register(provider) {
    if (this.providers.has(provider.id)) throw new Error(`Provedor duplicado: ${provider.id}`);
    this.providers.set(provider.id, provider);
    this.snapshots.set(provider.id, {
      id: provider.id,
      title: provider.title,
      status: 'idle',
      refreshing: false,
      data: null,
      sources: [],
      updatedAt: null,
      dataTime: null,
      lastAttemptAt: null,
      nextRunAt: null,
      error: null,
      intervalMs: provider.intervalMs,
      staleAfterMs: provider.staleAfterMs,
    });
    return this;
  }

  intervalFor(id) {
    const p = this.providers.get(id);
    const wanted = this.intervals.get(id) ?? p.intervalMs;
    return Math.max(wanted, p.minIntervalMs ?? 0);
  }

  setInterval(id, ms) {
    if (!this.providers.has(id) || !Number.isFinite(ms)) return;
    this.intervals.set(id, ms);
    const snap = this.snapshots.get(id);
    snap.intervalMs = this.intervalFor(id);
    if (this.started && !this.running.has(id)) this.schedule(id, snap.intervalMs);
  }

  subscribe(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  emit(id) {
    const snap = this.view(id);
    for (const fn of this.listeners) {
      try { fn(snap); } catch (e) { log.error('hub', `listener falhou: ${e.message}`); }
    }
  }

  // Visão pública com o cálculo de "desatualizado" feito na hora.
  view(id) {
    const s = this.snapshots.get(id);
    const ref = s.updatedAt ? Date.parse(s.updatedAt) : null;
    const stale = ref == null ? false : this.now() - ref > (s.staleAfterMs ?? Infinity);
    return { ...s, stale, serverTime: new Date(this.now()).toISOString() };
  }

  all() {
    return [...this.providers.keys()].map((id) => this.view(id));
  }

  start() {
    this.started = true;
    let delay = 0;
    for (const [id, p] of this.providers) {
      if (p.dependsOn?.length) continue; // derivados rodam quando suas dependências mudam
      this.schedule(id, delay);
      delay += 150; // espalha as primeiras requisições
    }
    for (const [id, p] of this.providers) {
      if (p.dependsOn?.length && p.intervalMs) this.schedule(id, 2000);
    }
  }

  stop() {
    this.started = false;
    for (const t of this.timers.values()) this.clearTimer(t);
    this.timers.clear();
  }

  schedule(id, ms) {
    const old = this.timers.get(id);
    if (old) this.clearTimer(old);
    const snap = this.snapshots.get(id);
    snap.nextRunAt = new Date(this.now() + ms).toISOString();
    const t = this.setTimer(() => this.refresh(id, { reason: 'agenda' }), ms);
    t?.unref?.();
    this.timers.set(id, t);
  }

  // Atualização manual: respeita um intervalo mínimo para não sobrecarregar as fontes.
  async requestRefresh(id) {
    const p = this.providers.get(id);
    if (!p) return { ok: false, reason: 'módulo inexistente' };
    const snap = this.snapshots.get(id);
    const cooldown = p.manualCooldownMs ?? 15000;
    const last = snap.lastAttemptAt ? Date.parse(snap.lastAttemptAt) : 0;
    if (this.now() - last < cooldown) {
      return { ok: false, reason: 'cooldown', retryInMs: cooldown - (this.now() - last) };
    }
    this.refresh(id, { reason: 'manual', force: true });
    return { ok: true };
  }

  async refresh(id, { reason = 'agenda', force = false } = {}) {
    if (this.running.has(id)) return this.running.get(id);
    const p = this.providers.get(id);
    const snap = this.snapshots.get(id);
    snap.refreshing = true;
    if (snap.status === 'idle') snap.status = 'loading';
    snap.lastAttemptAt = new Date(this.now()).toISOString();
    this.emit(id);

    const task = (async () => {
      try {
        const result = await p.fetch({ ...this.ctx, force, hub: this, reason });
        if (!result || result.data === undefined) throw new Error('provedor não retornou dados');
        const same = JSON.stringify(result.data) === JSON.stringify(snap.data);
        snap.data = result.data;
        snap.sources = result.sources ?? [];
        snap.dataTime = result.dataTime ?? null;
        snap.status = result.partialError ? 'partial' : 'ok';
        snap.error = result.partialError ? { message: result.partialError, at: snap.lastAttemptAt } : null;
        snap.updatedAt = new Date(this.now()).toISOString();
        this.failures.set(id, 0);
        if (!same) this.notifyDependents(id);
      } catch (e) {
        const n = (this.failures.get(id) ?? 0) + 1;
        this.failures.set(id, n);
        snap.status = 'error';
        snap.error = { message: e.message, at: snap.lastAttemptAt, attempts: n };
        log.error(`modulo:${id}`, e.message);
      } finally {
        snap.refreshing = false;
        this.running.delete(id);
        if (this.started && (p.intervalMs || !p.dependsOn?.length)) this.schedule(id, this.nextDelay(id, p));
        this.emit(id);
      }
    })();
    this.running.set(id, task);
    return task;
  }

  // Após falhas, tenta de novo mais cedo (recuperação automática), com backoff exponencial limitado.
  nextDelay(id, p) {
    const base = this.intervalFor(id);
    const n = this.failures.get(id) ?? 0;
    if (n === 0) return base;
    const retry = Math.min(30000 * 2 ** (n - 1), base, 10 * 60 * 1000);
    return Math.max(retry, p.minIntervalMs ?? 0, 5000);
  }

  notifyDependents(changedId) {
    for (const [id, p] of this.providers) {
      if (!p.dependsOn?.includes(changedId)) continue;
      const old = this.timers.get(`dep:${id}`);
      if (old) this.clearTimer(old);
      const t = this.setTimer(() => { this.timers.delete(`dep:${id}`); this.refresh(id, { reason: `mudança em ${changedId}` }); }, 1500);
      t?.unref?.();
      this.timers.set(`dep:${id}`, t);
    }
  }
}
