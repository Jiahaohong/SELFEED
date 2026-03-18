import { normalizeChannelRecord } from './channelUtils.mjs';
import iconvModule from 'iconv-lite';

const REQUEST_TIMEOUT_MS = Number(process.env.STOCK_CHANNEL_TIMEOUT_MS || 8000);
const EASTMONEY_QUOTE_URL = process.env.EASTMONEY_QUOTE_URL || 'https://push2.eastmoney.com/api/qt/stock/get';
const TENCENT_QUOTE_URL = process.env.TENCENT_QUOTE_URL || 'https://qt.gtimg.cn/q=';
const TENCENT_MINUTE_API_URL = process.env.TENCENT_MINUTE_API_URL || 'https://web.ifzq.gtimg.cn/appstock/app/minute/query';
const SINA_QUOTE_URL = process.env.SINA_QUOTE_URL || 'https://hq.sinajs.cn/list=';
const NETEASE_QUOTE_URL = process.env.NETEASE_QUOTE_URL || 'https://api.money.126.net/data/feed/';
const YAHOO_QUOTE_URL = process.env.YAHOO_QUOTE_URL || 'https://query1.finance.yahoo.com/v7/finance/quote?symbols=';
const EASTMONEY_UT = process.env.EASTMONEY_UT || '7eea3edcaed734bea9cbfc24409ed989';
const iconv = iconvModule?.default || iconvModule;

const toRaw = (value) => (value === undefined || value === null ? '' : String(value).trim());

const normalizeCnSymbol = (symbol) => {
  const raw = String(symbol || '').trim().toUpperCase();
  if (!raw) return '';
  if (/^\d{6}$/.test(raw)) return raw;
  const suffix = raw.match(/^(\d{6})\.(SH|SZ|SS)$/);
  if (suffix) return suffix[1];
  const prefix = raw.match(/^(SH|SZ)(\d{6})$/);
  if (prefix) return prefix[2];
  return '';
};

const resolveCnMarket = (symbol, original) => {
  const raw = String(original || '').trim().toUpperCase();
  if (raw.endsWith('.SH') || raw.endsWith('.SS') || raw.startsWith('SH')) return 'SH';
  if (raw.endsWith('.SZ') || raw.startsWith('SZ')) return 'SZ';
  if (symbol.startsWith('6') || symbol.startsWith('9')) return 'SH';
  if (symbol.startsWith('0') || symbol.startsWith('2') || symbol.startsWith('3')) return 'SZ';
  return '';
};

const parseQuotedContent = (text) => {
  const raw = String(text || '');
  const start = raw.indexOf('"');
  const end = raw.lastIndexOf('"');
  if (start < 0 || end <= start) return '';
  return raw.slice(start + 1, end);
};

const parseMarketDate = (datePart, timePart) => {
  const dateText = String(datePart || '').trim();
  const timeText = String(timePart || '').trim();
  if (!dateText || !timeText) return new Date().toISOString();
  const date = new Date(`${dateText}T${timeText}+08:00`);
  if (Number.isNaN(date.getTime())) return new Date().toISOString();
  return date.toISOString();
};

const parseCompactDateTime = (value) => {
  const raw = String(value || '').trim();
  const match = raw.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/);
  if (!match) return new Date().toISOString();
  const [, y, m, d, hh, mm, ss] = match;
  const date = new Date(`${y}-${m}-${d}T${hh}:${mm}:${ss}+08:00`);
  if (Number.isNaN(date.getTime())) return new Date().toISOString();
  return date.toISOString();
};

const fetchWithTimeout = async (url, options = {}) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal
    });
  } finally {
    clearTimeout(timeout);
  }
};

const readResponseText = async (response, charset = 'utf-8') => {
  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  try {
    return iconv.decode(buffer, charset);
  } catch {
    return buffer.toString('utf8');
  }
};

const parseIntradayPriceText = (value) => {
  const raw = toRaw(value);
  if (!raw) return '';
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? raw : '';
};

const extractTencentMinuteRows = (payload, code) => {
  const candidates = [
    payload?.data?.[code]?.data?.data,
    payload?.data?.[code.toUpperCase()]?.data?.data,
    payload?.data?.[code]?.data,
    payload?.data?.[code.toUpperCase()]?.data
  ];
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) return candidate;
  }
  return [];
};

const parseTencentIntradaySeries = (rows) => {
  if (!Array.isArray(rows)) return [];
  return rows
    .map((row) => {
      if (typeof row === 'string') {
        const parts = row.trim().split(/\s+/);
        if (parts.length < 2) return '';
        return parseIntradayPriceText(parts[1]);
      }
      if (Array.isArray(row)) {
        if (row.length < 2) return '';
        return parseIntradayPriceText(row[1]);
      }
      if (row && typeof row === 'object') {
        return parseIntradayPriceText(row.price ?? row.close ?? row.last ?? row.value);
      }
      return '';
    })
    .filter(Boolean);
};

const fetchTencentIntradaySeries = async ({ symbol, market }) => {
  const cnSymbol = normalizeCnSymbol(symbol);
  if (!cnSymbol) return [];
  const safeMarket = market === 'SH' ? 'sh' : 'sz';
  const code = `${safeMarket}${cnSymbol}`;
  const endpoint = `${TENCENT_MINUTE_API_URL}?code=${encodeURIComponent(code)}`;
  const response = await fetchWithTimeout(endpoint, {
    headers: {
      Accept: 'application/json, text/plain, */*',
      Referer: 'https://gu.qq.com/',
      'User-Agent': 'Mozilla/5.0'
    }
  });
  if (!response.ok) {
    throw new Error(`Tencent minute HTTP ${response.status}`);
  }
  const payload = await response.json();
  const rows = extractTencentMinuteRows(payload, code);
  return parseTencentIntradaySeries(rows);
};

const appendIntradaySeriesSummary = async ({ summary, symbol, market }) => {
  if (!symbol || !market) return summary;
  try {
    const series = await fetchTencentIntradaySeries({ symbol, market });
    if (series.length < 10) return summary;
    return `${summary} | intraday_series_raw=${series.join('/')}`;
  } catch {
    return summary;
  }
};

const buildSummary = ({ provider, fields = [], note = '' }) => {
  const flat = fields
    .map(([key, value]) => [String(key || '').trim(), toRaw(value)])
    .filter(([key, value]) => key && value)
    .map(([key, value]) => `${key}=${value}`)
    .join(', ');
  const parts = [`Provider: ${provider}`];
  if (note) {
    parts.push(note);
  }
  if (flat) {
    parts.push(flat);
  }
  return parts.join(' | ');
};

const buildRecord = ({ symbol, name, date, url, source, summary }) => {
  const displayName = String(name || symbol).trim();
  const displaySymbol = String(symbol || '').trim();
  return normalizeChannelRecord({
    title: `${displayName} (${displaySymbol}) Stock Price`,
    date: date || new Date().toISOString(),
    summary: String(summary || '').trim(),
    url,
    source
  });
};

const STOCK_SOURCE_CONFIGS = [
  {
    id: 'tencent',
    name: 'Tencent Quote API',
    url: TENCENT_QUOTE_URL,
    enabledByDefault: true
  },
  {
    id: 'sina',
    name: 'Sina Quote API',
    url: SINA_QUOTE_URL,
    enabledByDefault: true
  },
  {
    id: 'netease',
    name: 'Netease API',
    url: NETEASE_QUOTE_URL,
    enabledByDefault: true
  },
  {
    id: 'eastmoney',
    name: 'Eastmoney API',
    url: EASTMONEY_QUOTE_URL,
    enabledByDefault: true
  },
  {
    id: 'yahoo',
    name: 'Yahoo Finance API',
    url: YAHOO_QUOTE_URL,
    enabledByDefault: false
  }
];

const fetchEastmoneyQuote = async ({ symbol, market }) => {
  const secid = `${market === 'SH' ? '1' : '0'}.${symbol}`;
  const params = new URLSearchParams({
    ut: EASTMONEY_UT,
    invt: '2',
    fltt: '2',
    fields: 'f43,f57,f58,f169,f170,f60',
    secid
  });
  const endpoint = `${EASTMONEY_QUOTE_URL}?${params.toString()}`;
  const response = await fetchWithTimeout(endpoint, {
    headers: {
      Accept: 'application/json, text/plain, */*',
      Referer: 'https://quote.eastmoney.com/',
      'User-Agent': 'Mozilla/5.0'
    }
  });
  if (!response.ok) {
    throw new Error(`Eastmoney HTTP ${response.status}`);
  }
  const payload = await response.json();
  const data = payload?.data;
  if (!data) {
    throw new Error('Eastmoney returned empty data');
  }

  const priceRaw = toRaw(data.f43);
  if (!priceRaw) {
    throw new Error('Eastmoney price is missing');
  }

  const summary = await appendIntradaySeriesSummary({
    summary: buildSummary({
      provider: 'Eastmoney API',
      note: 'raw fields',
      fields: [
        ['price_raw_f43', data.f43],
        ['change_raw_f169', data.f169],
        ['change_percent_raw_f170', data.f170],
        ['prev_close_raw_f60', data.f60]
      ]
    }),
    symbol,
    market
  });

  return buildRecord({
    symbol: String(data.f57 || symbol).toUpperCase(),
    name: String(data.f58 || symbol).trim(),
    date: new Date().toISOString(),
    url: `https://quote.eastmoney.com/${market === 'SH' ? 'sh' : 'sz'}${symbol}.html`,
    source: 'Eastmoney API',
    summary
  });
};

const fetchTencentQuote = async ({ symbol, market }) => {
  const code = `${market.toLowerCase()}${symbol}`;
  const endpoint = `${TENCENT_QUOTE_URL}${encodeURIComponent(code)}`;
  const response = await fetchWithTimeout(endpoint, {
    headers: {
      Accept: 'text/plain, */*',
      Referer: 'https://gu.qq.com/',
      'User-Agent': 'Mozilla/5.0'
    }
  });
  if (!response.ok) {
    throw new Error(`Tencent HTTP ${response.status}`);
  }

  const text = await readResponseText(response, 'gb18030');
  const content = parseQuotedContent(text);
  const parts = content.split('~');
  if (parts.length < 5) {
    throw new Error('Tencent returned invalid payload');
  }

  const name = parts[1] || symbol;
  const parsedSymbol = String(parts[2] || symbol).toUpperCase();
  const priceRaw = toRaw(parts[3]);
  const date = parseCompactDateTime(parts[30]);

  if (!priceRaw) {
    throw new Error('Tencent price is missing');
  }

  const summary = await appendIntradaySeriesSummary({
    summary: buildSummary({
      provider: 'Tencent Quote API',
      note: 'raw fields',
      fields: [
        ['price_raw_3', parts[3]],
        ['prev_close_raw_4', parts[4]],
        ['change_raw_31', parts[31]],
        ['change_percent_raw_32', parts[32]]
      ]
    }),
    symbol: parsedSymbol,
    market
  });

  return buildRecord({
    symbol: parsedSymbol,
    name,
    date,
    url: `https://gu.qq.com/${code}`,
    source: 'Tencent Quote API',
    summary
  });
};

const fetchSinaQuote = async ({ symbol, market }) => {
  const code = `${market.toLowerCase()}${symbol}`;
  const endpoint = `${SINA_QUOTE_URL}${encodeURIComponent(code)}`;
  const response = await fetchWithTimeout(endpoint, {
    headers: {
      Accept: 'text/plain, */*',
      Referer: 'https://finance.sina.com.cn/',
      'User-Agent': 'Mozilla/5.0'
    }
  });
  if (!response.ok) {
    throw new Error(`Sina HTTP ${response.status}`);
  }

  const text = await readResponseText(response, 'gb18030');
  const content = parseQuotedContent(text);
  const parts = content.split(',');
  if (parts.length < 4) {
    throw new Error('Sina returned invalid payload');
  }

  const name = parts[0] || symbol;
  const priceRaw = toRaw(parts[3]);
  const date = parseMarketDate(parts[30], parts[31]);

  if (!priceRaw) {
    throw new Error('Sina price is missing');
  }

  const summary = await appendIntradaySeriesSummary({
    summary: buildSummary({
      provider: 'Sina Quote API',
      note: 'raw fields',
      fields: [
        ['price_raw_3', parts[3]],
        ['prev_close_raw_2', parts[2]],
        ['date_raw_30', parts[30]],
        ['time_raw_31', parts[31]]
      ]
    }),
    symbol,
    market
  });

  return buildRecord({
    symbol,
    name,
    date,
    url: `https://finance.sina.com.cn/realstock/company/${code}/nc.shtml`,
    source: 'Sina Quote API',
    summary
  });
};

const fetchNeteaseQuote = async ({ symbol, market }) => {
  const neteaseCode = `${market === 'SH' ? '0' : '1'}${symbol}`;
  const endpoint = `${NETEASE_QUOTE_URL}${encodeURIComponent(neteaseCode)},money.api`;
  const response = await fetchWithTimeout(endpoint, {
    headers: {
      Accept: 'text/plain, */*',
      Referer: 'https://quotes.money.163.com/',
      'User-Agent': 'Mozilla/5.0'
    }
  });
  if (!response.ok) {
    throw new Error(`Netease HTTP ${response.status}`);
  }

  const text = await readResponseText(response, 'gb18030');
  const jsonMatch = text.match(/\((\{[\s\S]*\})\)\s*;?\s*$/);
  if (!jsonMatch) {
    throw new Error('Netease returned invalid payload');
  }
  const payload = JSON.parse(jsonMatch[1]);
  const quote = payload?.[neteaseCode];
  if (!quote) {
    throw new Error('Netease quote not found');
  }

  const priceRaw = toRaw(quote.price);
  const update = String(quote.update || '').replace(/\//g, '-');
  const date = Number.isNaN(new Date(update).getTime()) ? new Date().toISOString() : new Date(update).toISOString();

  if (!priceRaw) {
    throw new Error('Netease price is missing');
  }

  const summary = await appendIntradaySeriesSummary({
    summary: buildSummary({
      provider: 'Netease API',
      note: 'raw fields',
      fields: [
        ['price_raw', quote.price],
        ['updown_raw', quote.updown],
        ['percent_raw', quote.percent],
        ['yestclose_raw', quote.yestclose ?? quote.yestClose ?? quote.preclose]
      ]
    }),
    symbol,
    market
  });

  return buildRecord({
    symbol,
    name: String(quote.name || symbol),
    date,
    url: `https://quotes.money.163.com/${neteaseCode}.html`,
    source: 'Netease API',
    summary
  });
};

const fetchYahooQuote = async ({ symbol }) => {
  const endpoint = `${YAHOO_QUOTE_URL}${encodeURIComponent(symbol)}`;
  const response = await fetchWithTimeout(endpoint, {
    headers: {
      Accept: 'application/json'
    }
  });
  if (!response.ok) {
    throw new Error(`Yahoo Finance API HTTP ${response.status}`);
  }

  const payload = await response.json();
  const quote = payload?.quoteResponse?.result?.[0];
  if (!quote) {
    throw new Error(`No quote data for ${symbol}`);
  }

  const date = Number.isFinite(quote.regularMarketTime)
    ? new Date(quote.regularMarketTime * 1000).toISOString()
    : new Date().toISOString();
  return buildRecord({
    symbol: String(quote.symbol || symbol).toUpperCase(),
    name: String(quote.shortName || quote.longName || symbol),
    date,
    url: `https://finance.yahoo.com/quote/${encodeURIComponent(String(quote.symbol || symbol))}`,
    source: 'Yahoo Finance API',
    summary: buildSummary({
      provider: 'Yahoo Finance API',
      note: 'raw fields',
      fields: [
        ['regularMarketPrice_raw', quote.regularMarketPrice],
        ['regularMarketChange_raw', quote.regularMarketChange],
        ['regularMarketChangePercent_raw', quote.regularMarketChangePercent]
      ]
    })
  });
};

class StockAPIChannel {
  constructor() {
    this.metadata = {
      name: 'stock_price_api',
      description: '获取股票实时价格（国内源优先：东财/腾讯/新浪/网易）',
      input_schema: {
        symbol: 'string'
      },
      healthcheck_params: {
        symbol: '600519'
      }
    };
  }

  listSources() {
    return STOCK_SOURCE_CONFIGS.map((item) => ({
      id: item.id,
      name: item.name,
      url: item.url,
      enabledByDefault: item.enabledByDefault !== false
    }));
  }

  async execute(params = {}) {
    const symbol = String(params.symbol || '').trim().toUpperCase();
    if (!symbol) {
      throw new Error('symbol is required');
    }

    const requestedSourceId = String(params.sourceId || params.source || '').trim().toLowerCase();
    const requestedSourceIds = Array.isArray(params.sourceIds)
      ? params.sourceIds.map((item) => String(item || '').trim().toLowerCase()).filter(Boolean)
      : [];
    const requested = requestedSourceIds.length > 0
      ? requestedSourceIds
      : (requestedSourceId ? [requestedSourceId] : []);

    const cnSymbol = normalizeCnSymbol(symbol);
    const market = cnSymbol ? resolveCnMarket(cnSymbol, symbol) : '';
    const domesticProviders = [
      {
        id: 'tencent',
        run: () => fetchTencentQuote({ symbol: cnSymbol, market })
      },
      {
        id: 'sina',
        run: () => fetchSinaQuote({ symbol: cnSymbol, market })
      },
      {
        id: 'netease',
        run: () => fetchNeteaseQuote({ symbol: cnSymbol, market })
      },
      {
        id: 'eastmoney',
        run: () => fetchEastmoneyQuote({ symbol: cnSymbol, market })
      }
    ];

    const yahooSymbol = cnSymbol
      ? `${cnSymbol}.${market === 'SH' ? 'SS' : 'SZ'}`
      : symbol;
    const globalProviders = [
      {
        id: 'yahoo',
        run: () => fetchYahooQuote({ symbol: yahooSymbol })
      }
    ];

    const providers = (cnSymbol && market)
      ? [...domesticProviders, ...globalProviders]
      : globalProviders;
    const runnableProviders = requested.length > 0
      ? providers.filter((provider) => requested.includes(provider.id))
      : providers;
    if (runnableProviders.length === 0) {
      throw new Error(`Unsupported stock source: ${requested.join(', ') || 'empty'}`);
    }

    const errors = [];
    for (const provider of runnableProviders) {
      try {
        const record = await provider.run();
        return [record];
      } catch (error) {
        errors.push(`${provider.id}: ${error?.message || String(error)}`);
      }
    }

    throw new Error(`No stock provider available: ${errors.join(' | ')}`);
  }
}

export default new StockAPIChannel();
