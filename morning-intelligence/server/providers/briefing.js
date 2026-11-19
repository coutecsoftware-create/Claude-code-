// Morning Briefing: resumo do dia montado SÓ com dados reais dos outros módulos.
// O texto é gerado por um "summarizer" plugável. Hoje: regras determinísticas (custo zero).
// Para usar um modelo de IA no futuro, implemente outro summarizer com a mesma assinatura
// generate(facts) -> { paragraphs: [{ text, refs }] } e troque em createBriefingProvider().

const fmtPct = (v) => `${v > 0 ? '+' : ''}${v.toFixed(2).replace('.', ',')}%`;
const fmtBrl = (v, digits = 2) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: digits, maximumFractionDigits: digits });

export function greetingFor(date, timeZone) {
  const h = Number(new Intl.DateTimeFormat('en-US', { hour: 'numeric', hourCycle: 'h23', timeZone }).format(date));
  if (h >= 5 && h < 12) return 'Bom dia';
  if (h >= 12 && h < 18) return 'Boa tarde';
  return 'Boa noite';
}

/** Coleta apenas fatos utilizáveis: módulos com dados e não desatualizados. */
export function collectFacts(hub, settings, now = new Date()) {
  const s = settings.get();
  const get = (id) => {
    if (!hub.providers.has(id)) return null;
    const v = hub.view(id);
    return v.data && !v.stale ? v : null;
  };
  return {
    now: now.toISOString(),
    timezone: s.timezone,
    name: s.name,
    location: s.location,
    weather: get('weather')?.data ?? null,
    markets: get('markets')?.data ?? null,
    news: get('news')?.data ?? null,
    ai: get('ai')?.data ?? null,
    unavailable: ['weather', 'markets', 'news', 'ai'].filter((id) => hub.providers.has(id) && !get(id)),
  };
}

export const ruleBasedSummarizer = {
  id: 'regras',
  label: 'Resumo por regras (sem IA)',
  generate(f) {
    const paragraphs = [];
    const date = new Date(f.now);
    const greet = greetingFor(date, f.timezone);
    const dayStr = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: f.timezone }).format(date);
    paragraphs.push({ text: `${greet}${f.name ? `, ${f.name}` : ''}! Hoje é ${dayStr}.`, refs: ['clock'] });

    const w = f.weather;
    if (w?.current?.temperature != null) {
      const parts = [`Em ${f.location.name} faz ${Math.round(w.current.temperature)}°C agora, ${w.current.condition.label.toLowerCase()}`];
      if (w.today?.max != null && w.today?.min != null) parts.push(`com máxima de ${Math.round(w.today.max)}°C e mínima de ${Math.round(w.today.min)}°C`);
      let s = `${parts.join(', ')}.`;
      if (w.rainNext12 != null) {
        if (w.rainNext12 >= 60) {
          const at = w.rainPeakAt ? new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: f.timezone }).format(new Date(w.rainPeakAt)) : null;
          s += ` Chuva provável nas próximas horas (${w.rainNext12}%${at ? `, pico por volta das ${at}` : ''}) — vale levar guarda-chuva.`;
        } else if (w.rainNext12 >= 30) s += ` Há possibilidade de chuva nas próximas 12 horas (${w.rainNext12}%).`;
        else s += ` Chance baixa de chuva nas próximas 12 horas (${w.rainNext12}%).`;
      }
      if (w.today?.uv != null && w.today.uv >= 8) s += ` Índice UV muito alto (${Math.round(w.today.uv)}).`;
      paragraphs.push({ text: s, refs: ['weather'] });
    }

    const m = f.markets;
    if (m?.quotes?.length) {
      const q = Object.fromEntries(m.quotes.map((x) => [x.id, x]));
      const bits = [];
      if (q.usdbrl) bits.push(`dólar a ${fmtBrl(q.usdbrl.value, 3)}${q.usdbrl.changePct != null ? ` (${fmtPct(q.usdbrl.changePct)})` : ''}`);
      if (q.eurbrl) bits.push(`euro a ${fmtBrl(q.eurbrl.value, 3)}${q.eurbrl.changePct != null ? ` (${fmtPct(q.eurbrl.changePct)})` : ''}`);
      const btc = q.btcusd ?? q.btcbrl;
      if (btc) bits.push(`bitcoin a ${btc.currency === 'USD' ? `US$ ${Math.round(btc.value).toLocaleString('pt-BR')}` : fmtBrl(btc.value, 0)}${btc.changePct != null ? ` (${fmtPct(btc.changePct)})` : ''}`);
      if (bits.length) {
        let s = `No mercado: ${bits.join(', ')}.`;
        const big = m.quotes.filter((x) => x.changePct != null && Math.abs(x.changePct) >= (x.symbol === 'BTC' || x.symbol === 'ETH' ? 4 : 1));
        if (big.length) s += ` Atenção à variação forte em ${big.map((x) => x.label).join(' e ')}.`;
        paragraphs.push({ text: s, refs: ['markets'] });
      }
    }

    const n = f.news;
    if (n?.highlights?.length) {
      const top = n.highlights.slice(0, 3);
      const multi = top.filter((i) => i.coveredBy.length > 1).length;
      paragraphs.push({
        text: `Entre as notícias, ${top.length === 1 ? 'um assunto merece' : `${top.length} assuntos merecem`} atenção${multi ? ` (${multi} repercutido${multi > 1 ? 's' : ''} por mais de uma fonte)` : ''}:`,
        refs: ['news'],
        items: top.map((i) => ({ title: i.title, source: i.source, link: i.link, publishedAt: i.publishedAt, coveredBy: i.coveredBy.length })),
      });
    }

    const a = f.ai;
    if (a?.items?.length) {
      const dayAgo = Date.parse(f.now) - 24 * 3600e3;
      const recent = a.items.filter((i) => Date.parse(i.publishedAt) >= dayAgo);
      const companies = a.tags.filter((t) => ['anthropic', 'openai', 'google', 'meta'].includes(t.id) && recent.some((i) => i.tags.includes(t.id))).map((t) => t.label);
      if (recent.length) {
        let s = `Em IA e tecnologia, ${recent.length} publicaç${recent.length > 1 ? 'ões' : 'ão'} nas últimas 24 horas`;
        if (companies.length) s += `, com novidades envolvendo ${companies.join(', ').replace(/, ([^,]*)$/, ' e $1')}`;
        s += '.';
        const official = a.official?.find((i) => Date.parse(i.publishedAt) >= dayAgo);
        paragraphs.push({ text: s, refs: ['ai'], items: official ? [{ title: official.title, source: official.source, link: official.link, publishedAt: official.publishedAt, official: true }] : undefined });
      }
    }

    if (f.unavailable.length) {
      const names = { weather: 'clima', markets: 'indicadores', news: 'notícias', ai: 'IA' };
      paragraphs.push({ text: `Sem dados atualizados de ${f.unavailable.map((u) => names[u]).join(', ')} no momento; esses itens ficaram fora do resumo.`, refs: f.unavailable, notice: true });
    }
    return { paragraphs };
  },
};

export function createBriefingProvider({ summarizer = ruleBasedSummarizer } = {}) {
  return {
    id: 'briefing',
    title: 'Morning Briefing',
    dependsOn: ['weather', 'markets', 'news', 'ai'],
    intervalMs: 5 * 60e3, // também recalcula periodicamente (saudação muda com o horário; dados envelhecem)
    minIntervalMs: 60e3,
    staleAfterMs: 20 * 60e3,
    manualCooldownMs: 5e3,
    async fetch({ hub, settings }) {
      const facts = collectFacts(hub, settings);
      const out = await summarizer.generate(facts);
      const basedOn = ['weather', 'markets', 'news', 'ai'].filter((id) => !facts.unavailable.includes(id)).map((id) => ({ id, updatedAt: hub.view(id).updatedAt }));
      return {
        data: { ...out, summarizer: { id: summarizer.id, label: summarizer.label }, basedOn, generatedAt: facts.now },
        dataTime: facts.now,
        sources: [{ name: 'Dados dos módulos do painel', url: null }],
      };
    },
  };
}
