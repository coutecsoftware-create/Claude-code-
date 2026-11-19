// Log estruturado simples. Erros de integração ficam também num buffer consultável em /api/health.
const recent = [];
const MAX = 100;

function write(level, scope, msg, extra) {
  const entry = { at: new Date().toISOString(), level, scope, msg, ...(extra ? { extra } : {}) };
  if (level !== 'debug' || process.env.MI_DEBUG) {
    const line = `[${entry.at}] ${level.toUpperCase()} ${scope}: ${msg}`;
    (level === 'error' || level === 'warn' ? console.error : console.log)(extra ? `${line} ${JSON.stringify(extra)}` : line);
  }
  if (level === 'error' || level === 'warn') {
    recent.push(entry);
    if (recent.length > MAX) recent.shift();
  }
}

export const log = {
  debug: (s, m, e) => write('debug', s, m, e),
  info: (s, m, e) => write('info', s, m, e),
  warn: (s, m, e) => write('warn', s, m, e),
  error: (s, m, e) => write('error', s, m, e),
  recent: () => recent.slice(-30),
};
