# Morning Intelligence

Painel matinal pessoal com interface escura e tecnológica. Reúne em uma tela clima, notícias, IA e tecnologia, indicadores econômicos, relógio e um resumo do dia. Os dados vêm de fontes públicas reais e se atualizam sozinhos, sem recarregar a página.

> **Estado:** primeira versão funcional (v0.1.0). Ainda não foi validada com as fontes reais: a rede do ambiente de desenvolvimento bloqueava esses endereços. Veja [Limitações conhecidas](#limitações-conhecidas).

## Como rodar

Requisito: Node.js 20 ou superior.

```bash
cd morning-intelligence
npm install
cp .env.example .env      # opcional: ajuste cidade, fuso e porta
npm start                 # http://127.0.0.1:8787
```

| Comando | O que faz |
| --- | --- |
| `npm start` | Servidor com dados reais |
| `npm run dev` | Igual, reiniciando ao salvar arquivos |
| `npm run demo` | **Modo de teste**: dados fictícios locais, com faixa de aviso amarela na tela |
| `npm test` | 18 testes automatizados (unidade e integração) |

**Atrás de um proxy HTTP** (rede corporativa, alguns contêineres na nuvem), o `fetch` do Node só usa o proxy se você pedir:

```bash
NODE_USE_ENV_PROXY=1 npm start   # usa HTTPS_PROXY / HTTP_PROXY do ambiente
```

Por padrão o servidor escuta só em `127.0.0.1`. O painel não tem login, então não o exponha na internet sem antes colocar autenticação na frente.

## Publicar na web (Render, plano gratuito)

O arquivo [`render.yaml`](../render.yaml), na raiz do repositório, já descreve o serviço.

1. Garanta que o código está no GitHub.
2. Crie uma conta grátis em https://render.com e conecte seu GitHub.
3. Clique em **New → Blueprint** e escolha este repositório.
4. Quando o Render pedir `MI_PASSWORD`, crie uma senha forte. É ela que protege o painel.
5. Ao terminar, o Render mostra um link como `https://morning-intelligence.onrender.com`.

**Como entrar:** o navegador pede usuário e senha. O usuário pode ser qualquer um; a senha é a que você definiu.

**No celular:** abra o link e use "Adicionar à tela inicial" para ter um atalho como se fosse um app.

**Limitações do plano gratuito:**
- O serviço "dorme" após 15 minutos sem acesso. A primeira abertura leva de 30 a 60 segundos.
- As configurações salvas na tela voltam ao padrão quando o serviço reinicia. Para fixar cidade e fuso, use as variáveis `MI_CITY`, `MI_LAT`, `MI_LON` e `MI_TIMEZONE` no painel do Render.

**Proteção extra:** com `HOST` diferente de `127.0.0.1`, o servidor se recusa a iniciar sem `MI_PASSWORD`. Assim o painel nunca fica aberto por engano.

## Arquitetura

```
navegador (HTML/CSS/JS puro, sem build)
   │  GET /api/meta, /api/settings     (inicialização)
   │  EventSource /api/stream          (tempo real: estado inicial + cada atualização)
   │  POST /api/refresh[/:id]          (botão atualizar)
   ▼
servidor Node (sem framework; 1 dependência: fast-xml-parser)
   ├─ ModuleHub ─ agenda cada provedor, guarda o último estado, calcula "desatualizado",
   │              faz backoff após falhas e avisa os navegadores conectados (SSE)
   ├─ http      ─ timeout, novas tentativas, cache por URL, respeito a 429/Retry-After
   ├─ settings  ─ data/settings.json, com toda entrada validada
   └─ providers ─ weather · news · ai · markets · briefing (derivado dos outros)
```

**Por que assim:**

- **Só o servidor acessa as fontes.** Chaves futuras nunca vão para o navegador, o cache é compartilhado entre abas e os limites das APIs ficam sob controle num lugar só.
- **SSE em vez de WebSocket.** O fluxo é só servidor → navegador. O SSE reconecta sozinho e passa por proxies. Um sinal de vida a cada 20 s e um vigia no navegador refazem a conexão se ela travar.
- **Sem framework nem etapa de build.** O projeto fica leve, barato de hospedar e fácil de manter.

### Estado de cada módulo

Cada módulo publica um objeto com:

- `status`: `loading`, `ok`, `partial` (algumas fontes falharam) ou `error`
- `refreshing`
- `data`
- `sources` (nome e link de cada fonte)
- `updatedAt`: quando o servidor obteve o dado
- `dataTime`: o horário que a própria fonte informa (observação do clima, horário da cotação, publicação mais recente)
- `nextRunAt`
- `error`
- `stale`

Na tela, cada card mostra um selo de estado (**Atualizado**, **Atualizando**, **Parcial**, **Desatualizado**, **Falha na atualização** ou **Fonte indisponível**), o horário da última atualização, o horário do dado na fonte, a próxima atualização e os links das fontes.

**Regras de confiabilidade:**

- Se uma atualização falha, o último dado válido continua na tela com um aviso vermelho e a data dele. Nunca aparece como se fosse atual.
- Passado o prazo `staleAfterMs` sem atualizar, o card fica com o selo **Desatualizado**.
- Notícias sem data, com data no futuro ou mais antigas que o limite configurado são descartadas, e o card informa quantas.
- O resumo do dia ignora módulos desatualizados ou com erro e diz quais ficaram de fora.
- Nenhum valor é simulado. No modo real, sem dados, o card mostra o erro e "Sem dados disponíveis".

## Fontes e frequências

Todas são gratuitas e não exigem chave. O catálogo completo está em [`server/config/sources.js`](server/config/sources.js).

| Módulo | Fontes | Frequência padrão (mínima) | Desatualizado após |
| --- | --- | --- | --- |
| Clima | Open-Meteo (previsão e busca de cidades) | 15 min (10) | 45 min |
| Notícias | Agência Brasil, g1, BBC News Brasil, The Verge, InfoMoney e Google Notícias (que mostra a fonte original de cada item) | 10 min (5) | 40 min |
| IA & Tecnologia | Blogs oficiais da OpenAI e do Google AI, TechCrunch, The Verge e buscas no Google Notícias por Anthropic/Claude, OpenAI/ChatGPT e Gemini | 15 min (10) | 60 min |
| Indicadores | AwesomeAPI (dólar, euro e bitcoin em R$), CoinGecko (BTC e ETH em US$, 24 h) e Banco Central/SGS (Selic meta, IPCA 12 meses) | 2 min (1); Banco Central em cache de 6 h | 10 min |
| Briefing | Gerado a partir dos módulos acima | Quando um módulo muda, e a cada 5 min | 20 min |
| Relógio | Navegador, sincronizado com o horário do servidor | 1 s | — |

**Como o projeto evita excesso de requisições:**

- cache por URL;
- requisições simultâneas para o mesmo endereço viram uma só;
- no máximo 4 feeds em paralelo;
- intervalo mínimo entre atualizações manuais;
- pausa automática quando a fonte responde 429.

**Deduplicação:** mesmo link (ignorando parâmetros `utm_*`), mesmo título normalizado ou títulos com pelo menos 80% das palavras em comum. Fica o item publicado primeiro, e o card mostra "+N fontes". Assuntos cobertos por mais de uma fonte sobem para os **Destaques**.

## Personalização

No botão de configurações, no canto superior direito, você pode:

- ativar, ocultar e reordenar módulos;
- definir seu nome para a saudação;
- escolher a cidade (busca no Open-Meteo) e o fuso horário;
- escolher as categorias de notícias e a idade máxima das notícias;
- ajustar a frequência de cada módulo, dentro dos limites;
- atualizar tudo manualmente pelo botão **Atualizar** ou por módulo, pelo ícone em cada card.

## Como adicionar um módulo

1. **Servidor:** crie `server/providers/<id>.js` exportando `{ id, title, intervalMs, minIntervalMs, staleAfterMs, fetch(ctx) }`. O `fetch` deve retornar `{ data, sources, dataTime }` e lançar um erro em caso de falha. Use `ctx.http.getJSON` ou `getText`, que já trazem cache e novas tentativas. Registre o provedor em `server/app.js`.
2. **Navegador:** crie `web/js/modules/<id>.js` exportando `{ id, title, icon, span, render(body, snap, ctx) }` e inclua-o em `web/js/modules/index.js`.
3. Adicione o `id` em `MODULE_IDS`, em `server/core/settings.js`.

Moldura do card, selos, rodapé de fontes, botão de atualizar, tempo real e configurações de layout vêm prontos.

Ideias já discutidas para módulos futuros (ainda não implementados): agenda, feriados, tarefas, lembretes, e-mails, trânsito, ciência, saúde e resumo semanal.

## Resumo inteligente e IA no futuro

Hoje o resumo é montado por regras (`ruleBasedSummarizer` em `server/providers/briefing.js`), sem custo e usando só fatos reais coletados por `collectFacts()`.

Para usar um modelo de IA, crie outro objeto com a mesma assinatura:

```js
export const llmSummarizer = {
  id: 'llm', label: 'Resumo por IA',
  async generate(facts) { /* chama a API usando process.env.MI_LLM_API_KEY */ return { paragraphs: [{ text, refs: ['news'] }] }; },
};
// server/app.js:  createBriefingProvider({ summarizer: llmSummarizer })
```

A chave fica só no `.env` do servidor. O modelo recebe apenas os fatos já validados, o que reduz o risco de inventar informação. **Isso gera custo e só deve ser ativado com sua autorização.**

## Segurança

- **Navegador:** nenhuma chave é enviada. Todo texto vindo das fontes entra na página como texto, nunca como HTML. Só são aceitos links `http` e `https`.
- **Cabeçalhos:** CSP restritiva (`default-src 'self'`), `nosniff`, `X-Frame-Options: DENY` e `no-referrer`.
- **Escrita:** gravações (configurações e atualizações) vindas de outros sites são recusadas (`Origin` diferente → 403). O corpo é limitado a 16 KB e validado campo a campo.
- **Arquivos:** caminhos de arquivo são normalizados para impedir acesso fora da pasta `web/`.
- **Diagnóstico:** erros de integração ficam no log do servidor e em `GET /api/health`.

## Testes

`npm test` roda 18 testes com `node:test`, sem acessar a internet. Eles cobrem:

- leitura de RSS e Atom, limpeza de HTML e bloqueio de links `javascript:`;
- deduplicação e filtro de recência;
- conversão dos dados do Open-Meteo, AwesomeAPI, CoinGecko e Banco Central;
- agenda do hub: erro mantém o último dado, nova tentativa antecipada, marcação de desatualizado, recuperação e intervalo mínimo da atualização manual;
- validação das configurações e geração do resumo;
- integração completa: SSE entregando os módulos, fonte fora do ar virando erro sem dados inventados, bloqueio de CSRF e path traversal e cabeçalhos de segurança.

## Limitações conhecidas

- **Fontes reais não verificadas.** No ambiente onde o projeto foi escrito, a rede bloqueava todos os endereços das fontes. As integrações foram testadas com dados locais no formato documentado de cada API e feed. Na primeira execução com internet, confira `GET /api/health`: se algum feed tiver mudado de endereço, basta trocar a URL em `server/config/sources.js`.
- **Notícias:** o Google Notícias é um agregador. Os títulos e as fontes originais vêm dele, mas o link passa pelo Google antes de chegar ao site da notícia.
- **Variação percentual:** a das moedas (AwesomeAPI) é a do dia, e a das criptomoedas em US$ (CoinGecko) é de 24 h. O gráfico de cada cotação mostra só as leituras feitas desde que a página foi aberta.
- **Estado em memória:** o estado fica na memória do servidor. Ao reiniciar, tudo é buscado de novo.
