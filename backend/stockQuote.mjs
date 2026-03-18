import YahooFinance from 'yahoo-finance2';

const yahooFinance = (() => {
  if (typeof YahooFinance === 'function') {
    try {
      return new YahooFinance();
    } catch (error) {
      console.warn('Failed to initialize YahooFinance class', error?.message || error);
    }
  }
  return YahooFinance;
})();

const QUOTE_CACHE_TTL_MS = Number(process.env.STOCK_QUOTE_TTL_MS || 20000);
const HISTORY_RANGE_MS = Number(process.env.STOCK_HISTORY_RANGE_MS || 24 * 60 * 60 * 1000);
const HISTORY_INTERVAL = process.env.STOCK_HISTORY_INTERVAL || '1h';
const STOCK_LOOKBACK_DAYS = Number(process.env.STOCK_LOOKBACK_DAYS || 60);
const MAX_SERIES_POINTS = Number(process.env.STOCK_SERIES_POINTS || 24);
const MAX_CACHE_ENTRIES = Number(process.env.STOCK_QUOTE_CACHE_LIMIT || 200);

const EASTMONEY_BASE_URL = process.env.EASTMONEY_BASE_URL || 'https://push2.eastmoney.com/api/qt/stock/get';
const EASTMONEY_HIST_BASE_URL = process.env.EASTMONEY_HIST_BASE_URL || 'https://push2his.eastmoney.com/api/qt/stock/kline/get';
const EASTMONEY_TIMEOUT_MS = Number(process.env.EASTMONEY_TIMEOUT_MS || 12000);
const EASTMONEY_UT = process.env.EASTMONEY_UT || '7eea3edcaed734bea9cbfc24409ed989';

const quoteCache = new Map();

const hashString = (value) => {
  let hash = 7;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) % 100000;
  }
  return hash;
};

const roundTo = (value, decimals = 2) => {
  if (!Number.isFinite(value)) return 0;
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
};

const buildSeries = (base, seed, change) => {
  const points = 24;
  const series = [];
  for (let i = 0; i < points; i += 1) {
    const wave = Math.sin((i / 3) + seed) * (0.6 + (seed % 5) / 10);
    const trend = (change / 6) * ((i / (points - 1)) - 0.5);
    series.push(roundTo(base + wave + trend, 2));
  }
  return series;
};

const isFiniteNumber = (value) => Number.isFinite(value);

const pickNumber = (...values) => {
  for (const value of values) {
    if (Number.isFinite(value)) return value;
  }
  return 0;
};

const toNumber = (value) => {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : NaN;
  }
  if (typeof value === 'string') {
    const normalized = value.replace(/,/g, '').trim();
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : NaN;
  }
  return NaN;
};

const getCacheKey = (provider, symbol, exchange, market) =>
  `${provider}:${symbol || ''}:${exchange || ''}:${market || ''}`.toUpperCase();

const getCachedQuote = (key) => {
  const entry = quoteCache.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    quoteCache.delete(key);
    return null;
  }
  return entry.value;
};

const setCachedQuote = (key, value) => {
  if (!key || !value) return;
  quoteCache.set(key, { value, expiresAt: Date.now() + QUOTE_CACHE_TTL_MS });
  if (quoteCache.size > MAX_CACHE_ENTRIES) {
    const oldestKey = quoteCache.keys().next().value;
    if (oldestKey) quoteCache.delete(oldestKey);
  }
};

const fetchWithTimeout = async (url, timeoutMs) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        Accept: 'application/json'
      }
    });
    return response;
  } finally {
    clearTimeout(timeout);
  }
};

const isCnStockSymbol = (value) => /^\d{6}$/.test(value);

const normalizeCnSymbol = (symbol) => {
  if (!symbol) return '';
  const raw = String(symbol).trim().toUpperCase();
  if (/^\d{6}$/.test(raw)) return raw;
  const dotMatch = raw.match(/^(\d{6})\.(SH|SZ|SS)$/);
  if (dotMatch) return dotMatch[1];
  const prefixMatch = raw.match(/^(SH|SZ)(\d{6})$/);
  if (prefixMatch) return prefixMatch[2];
  return '';
};

const getEastmoneySecid = (symbol, exchange = '', market = '') => {
  const normalized = normalizeCnSymbol(symbol);
  if (!normalized) return '';
  const exchangeLower = String(exchange || '').toLowerCase();
  const marketLower = String(market || '').toLowerCase();
  const isSh = normalized.startsWith('6')
    || normalized.startsWith('9')
    || exchangeLower.includes('sse')
    || exchangeLower.includes('上交')
    || exchangeLower.includes('沪')
    || marketLower.includes('sse')
    || marketLower.includes('sh');
  return `${isSh ? '1' : '0'}.${normalized}`;
};

const isCnKeyword = (keyword) => {
  const symbol = normalizeCnSymbol(keyword.stock?.symbol || '');
  if (symbol) return true;
  const market = (keyword.stock?.market || '').toLowerCase();
  const exchange = (keyword.stock?.exchange || '').toLowerCase();
  return (
    market.includes('cn')
    || market.includes('china')
    || exchange.includes('sse')
    || exchange.includes('szse')
    || exchange.includes('上交')
    || exchange.includes('深交')
  );
};

const formatDateYYYYMMDD = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}${month}${day}`;
};

const fetchEastmoneyJson = async (baseUrl, params, timeoutMs = EASTMONEY_TIMEOUT_MS) => {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    query.set(key, String(value));
  });

  const endpoint = `${baseUrl}?${query.toString()}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(endpoint, {
      signal: controller.signal,
      headers: {
        Accept: 'application/json, text/plain, */*',
        Referer: 'https://quote.eastmoney.com/',
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
      }
    });
    if (!response.ok) {
      throw new Error(`Eastmoney HTTP ${response.status}`);
    }
    return response.json();
  } finally {
    clearTimeout(timeout);
  }
};

const normalizeEastmoneyPrice = (value) => {
  const parsed = toNumber(value);
  if (!Number.isFinite(parsed)) return NaN;
  return roundTo(parsed / 100, 2);
};

const fetchEastmoneyQuote = async ({ symbol, exchange, market }) => {
  const secid = getEastmoneySecid(symbol, exchange, market);
  if (!secid) {
    throw new Error('Eastmoney requires CN stock symbol like 600519');
  }

  const payload = await fetchEastmoneyJson(EASTMONEY_BASE_URL, {
    ut: EASTMONEY_UT,
    invt: 2,
    fltt: 2,
    fields: 'f43,f57,f58,f169,f170,f60',
    secid
  });

  const data = payload?.data;
  if (!data) {
    throw new Error('Eastmoney quote returned empty data');
  }

  const price = normalizeEastmoneyPrice(data.f43);
  const prevClose = normalizeEastmoneyPrice(data.f60);
  const change = normalizeEastmoneyPrice(data.f169);
  const changePercent = roundTo(toNumber(data.f170) / 100, 2);

  return {
    symbol: String(data.f57 || symbol).toUpperCase(),
    name: String(data.f58 || '').trim(),
    price: Number.isFinite(price) ? price : roundTo(prevClose + change, 2),
    prevClose: Number.isFinite(prevClose) ? prevClose : 0,
    change: Number.isFinite(change) ? change : 0,
    changePercent: Number.isFinite(changePercent) ? changePercent : 0
  };
};

const parseEastmoneyKline = (rows) => {
  if (!Array.isArray(rows)) return [];
  return rows
    .map((row) => {
      const parts = String(row || '').split(',');
      if (parts.length < 6) return null;
      return {
        date: parts[0],
        open: toNumber(parts[1]),
        close: toNumber(parts[2]),
        high: toNumber(parts[3]),
        low: toNumber(parts[4]),
        volume: toNumber(parts[5]),
        amount: toNumber(parts[6])
      };
    })
    .filter(Boolean)
    .filter((item) => Number.isFinite(item.close));
};

const fetchEastmoneyKline = async ({ symbol, exchange, market, startDate, endDate }) => {
  const secid = getEastmoneySecid(symbol, exchange, market);
  if (!secid) {
    throw new Error('Eastmoney requires CN stock symbol like 600519');
  }

  const payload = await fetchEastmoneyJson(EASTMONEY_HIST_BASE_URL, {
    fields1: 'f1,f2,f3,f4,f5,f6',
    fields2: 'f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61,f116',
    ut: EASTMONEY_UT,
    klt: 101,
    fqt: 1,
    secid,
    beg: startDate,
    end: endDate
  });

  const data = payload?.data;
  if (!data?.klines) {
    throw new Error('Eastmoney kline returned empty data');
  }

  return {
    symbol: String(data.code || symbol).toUpperCase(),
    name: String(data.name || '').trim(),
    market: 'CN',
    kline: parseEastmoneyKline(data.klines)
  };
};

const buildQuoteFromEastmoney = (keyword, quoteData, hist) => {
  const kline = hist.kline || [];
  if (kline.length < 2) {
    throw new Error(`Eastmoney history too short for ${hist.symbol}`);
  }

  const latest = kline[kline.length - 1];
  const prev = kline[kline.length - 2];
  const fallbackChange = latest.close - prev.close;
  const fallbackChangePercent = prev.close ? (fallbackChange / prev.close) * 100 : 0;

  return {
    symbol: quoteData?.symbol || hist.symbol,
    name: quoteData?.name || hist.name || keyword.stock?.name || keyword.text || hist.symbol,
    price: roundTo(quoteData?.price || latest.close, 2),
    change: roundTo(Number.isFinite(quoteData?.change) ? quoteData.change : fallbackChange, 2),
    changePercent: roundTo(
      Number.isFinite(quoteData?.changePercent) ? quoteData.changePercent : fallbackChangePercent,
      2
    ),
    currency: keyword.stock?.currency || 'CNY',
    source: 'eastmoney',
    series: kline.slice(-MAX_SERIES_POINTS).map((item) => roundTo(item.close, 2)),
    updatedAt: new Date().toISOString()
  };
};

const getStockQuoteFromEastmoney = async (keyword) => {
  const exchange = keyword.stock?.exchange || '';
  const market = keyword.stock?.market || '';
  const symbol = normalizeCnSymbol(keyword.stock?.symbol || keyword.text || '');
  if (!isCnStockSymbol(symbol)) {
    throw new Error('Eastmoney requires CN stock symbol like 600519');
  }

  const cacheKey = getCacheKey('eastmoney', symbol, exchange, market);
  const cached = getCachedQuote(cacheKey);
  if (cached) return cached;

  const endDate = new Date();
  const startDate = new Date(endDate.getTime() - STOCK_LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
  const hist = await fetchEastmoneyKline({
    symbol,
    exchange,
    market,
    startDate: formatDateYYYYMMDD(startDate),
    endDate: formatDateYYYYMMDD(endDate)
  });
  let quoteData = null;
  try {
    quoteData = await fetchEastmoneyQuote({ symbol, exchange, market });
  } catch (error) {
    console.warn(`Eastmoney quote endpoint failed for ${symbol}, fallback to kline`, error?.message || error);
  }

  const quote = buildQuoteFromEastmoney(keyword, quoteData, hist);
  setCachedQuote(cacheKey, quote);
  return quote;
};

const resolveSymbolAndName = async (keyword, options = {}) => {
  const { forceSearch = false } = options;
  const fallbackSymbol = (keyword.stock?.symbol || '').trim();
  const fallbackName = (keyword.stock?.name || keyword.text || '').trim();
  if (fallbackSymbol && !forceSearch) {
    return {
      symbol: fallbackSymbol.toUpperCase(),
      name: fallbackName || fallbackSymbol.toUpperCase()
    };
  }

  const query = (keyword.text || fallbackName || fallbackSymbol || '').trim();
  if (!query) {
    return { symbol: '', name: fallbackName || '' };
  }

  try {
    const result = await yahooFinance.search(query);
    const match = result?.quotes?.find(item => item?.symbol);
    if (match?.symbol) {
      const name =
        match.shortname
        ?? match.longname
        ?? match.shortName
        ?? match.longName
        ?? fallbackName
        ?? String(match.symbol);
      return { symbol: String(match.symbol).toUpperCase(), name };
    }
  } catch (error) {
    console.warn('Yahoo Finance search failed', error?.message || error);
  }

  if (fallbackSymbol) {
    return {
      symbol: fallbackSymbol.toUpperCase(),
      name: fallbackName || fallbackSymbol.toUpperCase()
    };
  }

  return { symbol: '', name: fallbackName || '' };
};

const buildSeriesFromHistory = (history, fallbackSeries) => {
  const closes = (history || [])
    .map(item => item?.close)
    .filter(isFiniteNumber);
  if (closes.length < 2) {
    return fallbackSeries;
  }
  return closes.slice(-MAX_SERIES_POINTS).map(value => roundTo(value, 2));
};

const buildFallbackSeries = (symbol, exchange, market, price, change) => {
  const seed = hashString(`${symbol}:${exchange}:${market}`);
  return buildSeries(price, seed / 13, change);
};

const normalizeYahooQuote = ({ raw, fallback, series }) => {
  const price = pickNumber(
    raw?.regularMarketPrice,
    raw?.postMarketPrice,
    raw?.preMarketPrice,
    fallback?.price
  );
  const change = pickNumber(
    raw?.regularMarketChange,
    raw?.postMarketChange,
    raw?.preMarketChange,
    fallback?.change
  );
  const changePercent = pickNumber(
    raw?.regularMarketChangePercent,
    raw?.postMarketChangePercent,
    raw?.preMarketChangePercent,
    price ? (change / price) * 100 : 0
  );
  const currency = raw?.currency || raw?.regularMarketCurrency || fallback?.currency || 'USD';
  const symbol = raw?.symbol || fallback?.symbol || '';
  const name =
    raw?.shortName
    ?? raw?.longName
    ?? raw?.shortname
    ?? raw?.longname
    ?? fallback?.name
    ?? symbol;

  return {
    symbol,
    name,
    price: roundTo(price, 2),
    change: roundTo(change, 2),
    changePercent: roundTo(changePercent, 2),
    currency,
    source: 'yahoo',
    series: series || [],
    updatedAt: new Date().toISOString()
  };
};

const getStockQuoteFromYahoo = async (keyword) => {
  const exchange = keyword.stock?.exchange || '';
  const market = keyword.stock?.market || '';
  const currency = keyword.stock?.currency || '';

  const resolved = await resolveSymbolAndName(keyword);
  let symbol = resolved.symbol;
  let name = resolved.name;
  if (!symbol) {
    throw new Error('Missing stock symbol');
  }

  let cacheKey = getCacheKey('yahoo', symbol, exchange, market);
  const cached = getCachedQuote(cacheKey);
  if (cached) return cached;

  let rawQuote = null;
  try {
    rawQuote = await yahooFinance.quote(symbol);
  } catch (error) {
    console.warn('Yahoo Finance quote failed', error?.message || error);
  }

  if (!rawQuote) {
    try {
      const fallbackResolved = await resolveSymbolAndName(keyword, { forceSearch: true });
      if (fallbackResolved.symbol && fallbackResolved.symbol !== symbol) {
        const fallbackQuote = await yahooFinance.quote(fallbackResolved.symbol);
        rawQuote = fallbackQuote;
        symbol = fallbackResolved.symbol;
        name = fallbackResolved.name || name;
        cacheKey = getCacheKey('yahoo', symbol, exchange, market);
      }
    } catch (error) {
      console.warn('Yahoo Finance fallback quote failed', error?.message || error);
    }
  }

  if (!rawQuote) {
    throw new Error(`Failed to fetch quote for ${symbol}`);
  }

  const fallback = {
    symbol,
    name: name || symbol,
    currency: currency || 'USD',
    price: 0,
    change: 0
  };

  const priceForSeries = pickNumber(
    rawQuote?.regularMarketPrice,
    rawQuote?.postMarketPrice,
    rawQuote?.preMarketPrice,
    0
  );
  const changeForSeries = pickNumber(
    rawQuote?.regularMarketChange,
    rawQuote?.postMarketChange,
    rawQuote?.preMarketChange,
    0
  );
  const fallbackSeries = buildFallbackSeries(symbol, exchange, market, priceForSeries || 1, changeForSeries || 0);

  let series = fallbackSeries;
  try {
    const period2 = new Date();
    const period1 = new Date(period2.getTime() - HISTORY_RANGE_MS);
    const history = await yahooFinance.historical(symbol, {
      period1,
      period2,
      interval: HISTORY_INTERVAL
    });
    series = buildSeriesFromHistory(history, fallbackSeries);
  } catch (error) {
    console.warn('Yahoo Finance historical failed', error?.message || error);
  }

  const normalized = normalizeYahooQuote({
    raw: rawQuote,
    fallback,
    series
  });
  setCachedQuote(cacheKey, normalized);
  return normalized;
};

export const getStockQuote = async (keyword, options = {}) => {
  const requestedSource = (options.source || 'auto').toLowerCase();
  const sourceOrder = (() => {
    if (requestedSource === 'yahoo') return ['yahoo'];
    if (requestedSource === 'eastmoney') return ['eastmoney'];
    if (isCnKeyword(keyword)) return ['eastmoney', 'yahoo'];
    return ['yahoo'];
  })();

  const errors = [];
  for (const source of sourceOrder) {
    try {
      if (source === 'eastmoney') return await getStockQuoteFromEastmoney(keyword);
      if (source === 'yahoo') return await getStockQuoteFromYahoo(keyword);
    } catch (error) {
      errors.push(`${source}: ${error?.message || String(error)}`);
    }
  }
  throw new Error(`Failed to fetch stock quote (${errors.join(' | ')})`);
};
