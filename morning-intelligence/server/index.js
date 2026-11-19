// Ponto de entrada: node server/index.js
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { loadEnv } from './core/env.js';
import { createApp } from './app.js';
import { log } from './core/log.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
loadEnv(join(root, '.env'));

const fixtures = process.env.MI_FIXTURES === '1';
let fetchImpl;
if (fixtures) {
  const { createFixtureFetch } = await import('./fixtures.js');
  fetchImpl = createFixtureFetch(join(root, 'test', 'fixtures'));
  log.warn('boot', 'MODO DE TESTE: usando dados locais de test/fixtures — não são dados reais.');
}

const { server, hub } = createApp({
  webRoot: join(root, 'web'),
  settingsPath: join(root, 'data', fixtures ? 'settings.fixtures.json' : 'settings.json'),
  fetchImpl,
  fixtures,
});

const port = Number(process.env.PORT || 8787);
const host = process.env.HOST || '127.0.0.1';
const loopback = ['127.0.0.1', 'localhost', '::1'].includes(host);
if (!loopback && !process.env.MI_PASSWORD) {
  log.error('boot', `HOST=${host} expõe o painel na rede, mas MI_PASSWORD não foi definida. Defina uma senha ou use HOST=127.0.0.1.`);
  process.exit(1);
}
server.listen(port, host, () => {
  log.info('boot', `Morning Intelligence em http://${host}:${port}`);
  hub.start();
});

for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { server.close(); process.exit(0); });
