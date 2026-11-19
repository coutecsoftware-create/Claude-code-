// Catálogo de fontes. Para adicionar/remover um feed, edite apenas este arquivo.
// Todas são gratuitas e públicas (RSS ou API sem chave).

const gnews = (q) => `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=pt-BR&gl=BR&ceid=BR:pt-419`;
const gtopic = (topic) => `https://news.google.com/rss/headlines/section/topic/${topic}?hl=pt-BR&gl=BR&ceid=BR:pt-419`;

export const NEWS_CATEGORIES = [
  { id: 'brasil', label: 'Brasil' },
  { id: 'mundo', label: 'Mundo' },
  { id: 'politica', label: 'Política' },
  { id: 'economia', label: 'Economia' },
  { id: 'tecnologia', label: 'Tecnologia' },
  { id: 'ia', label: 'Inteligência artificial' },
  { id: 'negocios', label: 'Negócios e mercado' },
];

// name = nome exibido como fonte; aggregator = itens trazem a fonte original no próprio feed (Google Notícias)
export const NEWS_FEEDS = [
  { id: 'abr-ultimas', category: 'brasil', name: 'Agência Brasil', url: 'https://agenciabrasil.ebc.com.br/rss/ultimasnoticias/feed.xml' },
  { id: 'g1', category: 'brasil', name: 'g1', url: 'https://g1.globo.com/rss/g1/' },
  { id: 'gn-brasil', category: 'brasil', name: 'Google Notícias', aggregator: true, url: gtopic('NATION') },

  { id: 'bbc-br', category: 'mundo', name: 'BBC News Brasil', url: 'https://feeds.bbci.co.uk/portuguese/rss.xml' },
  { id: 'gn-mundo', category: 'mundo', name: 'Google Notícias', aggregator: true, url: gtopic('WORLD') },

  { id: 'abr-politica', category: 'politica', name: 'Agência Brasil', url: 'https://agenciabrasil.ebc.com.br/rss/politica/feed.xml' },
  { id: 'gn-politica', category: 'politica', name: 'Google Notícias', aggregator: true, url: gnews('política Brasil when:1d') },

  { id: 'abr-economia', category: 'economia', name: 'Agência Brasil', url: 'https://agenciabrasil.ebc.com.br/rss/economia/feed.xml' },
  { id: 'gn-economia', category: 'economia', name: 'Google Notícias', aggregator: true, url: gtopic('BUSINESS') },

  { id: 'gn-tec', category: 'tecnologia', name: 'Google Notícias', aggregator: true, url: gtopic('TECHNOLOGY') },
  { id: 'verge', category: 'tecnologia', name: 'The Verge', url: 'https://www.theverge.com/rss/index.xml' },

  { id: 'gn-ia', category: 'ia', name: 'Google Notícias', aggregator: true, url: gnews('"inteligência artificial" when:1d') },

  { id: 'infomoney', category: 'negocios', name: 'InfoMoney', url: 'https://www.infomoney.com.br/feed/' },
  { id: 'gn-mercado', category: 'negocios', name: 'Google Notícias', aggregator: true, url: gnews('mercado financeiro Ibovespa when:1d') },
];

// Módulo IA & Tecnologia: blogs oficiais + imprensa especializada + buscas por empresa.
export const AI_FEEDS = [
  { id: 'openai-blog', name: 'OpenAI', official: true, url: 'https://openai.com/news/rss.xml' },
  { id: 'google-ai-blog', name: 'Google', official: true, url: 'https://blog.google/technology/ai/rss/' },
  { id: 'tc-ai', name: 'TechCrunch', url: 'https://techcrunch.com/category/artificial-intelligence/feed/' },
  { id: 'verge-ai', name: 'The Verge', url: 'https://www.theverge.com/rss/ai-artificial-intelligence/index.xml' },
  { id: 'gn-anthropic', name: 'Google Notícias', aggregator: true, url: gnews('Anthropic Claude when:3d') },
  { id: 'gn-openai', name: 'Google Notícias', aggregator: true, url: gnews('OpenAI ChatGPT when:2d') },
  { id: 'gn-gemini', name: 'Google Notícias', aggregator: true, url: gnews('Google Gemini when:3d') },
];

// Etiquetas aplicadas por palavra-chave aos itens de IA (ordem = prioridade de exibição).
export const AI_TAGS = [
  { id: 'anthropic', label: 'Anthropic', match: /\b(anthropic|claude)\b/i },
  { id: 'openai', label: 'OpenAI', match: /\b(openai|chatgpt|gpt-?\d|sora|sam altman)\b/i },
  { id: 'google', label: 'Google', match: /\b(gemini|deepmind|google ai)\b/i },
  { id: 'meta', label: 'Meta', match: /\b(llama|meta ai)\b/i },
  { id: 'models', label: 'Modelos', match: /\b(modelo|model|llm|open[- ]?source|weights|benchmark)\b/i },
  { id: 'automation', label: 'Automação', match: /\b(agent[es]?|agentes?|automa[çc][ãa]o|automation|copilot|workflow)\b/i },
  { id: 'launch', label: 'Lançamento', match: /\b(lan[çc]a|lan[çc]amento|launch(es|ed)?|release[sd]?|unveil|anuncia|announce[sd]?)\b/i },
];

export const WEATHER = {
  forecast: 'https://api.open-meteo.com/v1/forecast',
  geocoding: 'https://geocoding-api.open-meteo.com/v1/search',
  name: 'Open-Meteo',
  site: 'https://open-meteo.com/',
};

export const MARKETS = {
  awesome: { name: 'AwesomeAPI (cotações)', site: 'https://docs.awesomeapi.com.br/', url: 'https://economia.awesomeapi.com.br/json/last/USD-BRL,EUR-BRL,BTC-BRL' },
  coingecko: { name: 'CoinGecko', site: 'https://www.coingecko.com/', url: 'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum&vs_currencies=usd,brl&include_24hr_change=true&include_last_updated_at=true' },
  bcb: {
    name: 'Banco Central do Brasil (SGS)',
    site: 'https://www.bcb.gov.br/estabilidadefinanceira/historicocotacoes',
    series: [
      { id: 'selic', code: 432, label: 'Selic (meta)', unit: '% a.a.' },
      { id: 'ipca12', code: 13522, label: 'IPCA 12 meses', unit: '%' },
    ],
    url: (code) => `https://api.bcb.gov.br/dados/serie/bcdata.sgs.${code}/dados/ultimos/1?formato=json`,
  },
};
