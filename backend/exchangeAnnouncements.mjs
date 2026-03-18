const SSE_SOURCE_URL = 'exchange://sse/announcements';
const SZSE_SOURCE_URL = 'exchange://szse/announcements';

const SSE_ANNOUNCEMENT_API = 'https://query.sse.com.cn/security/stock/queryCompanyBulletin.do';
const SZSE_ANNOUNCEMENT_API = 'https://www.szse.cn/api/disc/announcement/annList';
const EASTMONEY_SEARCH_API = 'https://searchapi.eastmoney.com/api/suggest/get';
const EASTMONEY_SEARCH_TOKEN = 'D43BF722C8E33BDC906FB84D85E326E8';

const REQUEST_TIMEOUT_MS = Number(process.env.EXCHANGE_ANNOUNCEMENT_TIMEOUT_MS || 8000);
const REQUEST_GAP_MS = Number(process.env.EXCHANGE_ANNOUNCEMENT_GAP_MS || 250);
const CACHE_TTL_MS = Number(process.env.EXCHANGE_ANNOUNCEMENT_TTL_MS || 5 * 60 * 1000);

const SAMPLE_CODES = {
  sse: '600690',
  szse: '000001'
};

const SSE_HEADERS = {
  Referer: 'https://www.sse.com.cn/',
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  Accept: 'application/json, text/javascript, */*; q=0.01'
};

const SZSE_HEADERS = {
  Referer: 'https://www.szse.cn/disclosure/listed/notice/index.html',
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  Accept: 'application/json, text/plain, */*'
};

const cache = new Map();

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const stripHtml = (value) => String(value || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const normalizeKeyword = (value) => String(value || '').trim().toLowerCase();

const normalizeCode = (value) => {
  const raw = String(value || '').trim().toUpperCase();
  const digits = raw.match(/\d{6}/);
  return digits ? digits[0] : '';
};

const isJsonResponseOk = (response) => response.ok;

const fetchJson = async (url, options = {}) => {
  const {
    method = 'GET',
    params = null,
    headers = {},
    body = null
  } = options;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const target = new URL(url);
    Object.entries(params || {}).forEach(([key, value]) => {
      if (value === undefined || value === null || value === '') return;
      target.searchParams.set(key, String(value));
    });
    const response = await fetch(target, {
      method,
      signal: controller.signal,
      headers,
      body: body ? JSON.stringify(body) : undefined
    });
    if (!isJsonResponseOk(response)) {
      throw new Error(`HTTP ${response.status} ${response.statusText}`);
    }
    return response.json();
  } finally {
    clearTimeout(timeout);
  }
};

const dedupeByUrl = (items) => {
  const seen = new Set();
  return items.filter((item) => {
    if (!item.url || seen.has(item.url)) return false;
    seen.add(item.url);
    return true;
  });
};

export const resolveExchangeKind = (keyword) => {
  const code = normalizeCode(keyword?.stock?.symbol || keyword?.text || '');
  const exchange = String(keyword?.stock?.exchange || '').toLowerCase();
  const market = String(keyword?.stock?.market || '').toLowerCase();

  if (
    exchange.includes('sse')
    || exchange.includes('上交')
    || exchange.includes('沪')
    || market.includes('sse')
    || market.includes('sh')
  ) {
    return 'sse';
  }

  if (
    exchange.includes('szse')
    || exchange.includes('深交')
    || exchange.includes('深')
    || market.includes('szse')
    || market.includes('sz')
  ) {
    return 'szse';
  }

  if (code.startsWith('6') || code.startsWith('9')) return 'sse';
  if (code.startsWith('0') || code.startsWith('2') || code.startsWith('3')) return 'szse';
  return null;
};

export const getExchangeLabel = (exchangeKind) => (
  exchangeKind === 'sse' ? '上交所公告' : exchangeKind === 'szse' ? '深交所公告' : '交易所公告'
);

const getCacheKey = (exchangeKind, code) => `${exchangeKind}:${code}`;

const readCache = (key) => {
  const entry = cache.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    cache.delete(key);
    return null;
  }
  return entry.value;
};

const writeCache = (key, value) => {
  cache.set(key, {
    value,
    expiresAt: Date.now() + CACHE_TTL_MS
  });
};

const mapSseItem = (item) => ({
  title: stripHtml(item.TITLE || item.title || ''),
  publishTime: item.SSEDATE || item.date || new Date().toISOString(),
  url: item.URL ? `https://www.sse.com.cn${item.URL}` : '',
  category: '公司公告'
});

const mapSzseItem = (item) => {
  const title = stripHtml(item.title || item.announcementTitle || item.secName || '');
  const publishTime = item.publishTime || item.publishDate || item.announcementTime || new Date().toISOString();
  const rawUrl = item.attachPath || item.pdfPath || item.announcementUrl || item.adjunctUrl || '';
  let url = rawUrl;
  if (url && !/^https?:\/\//i.test(url)) {
    url = `https://www.szse.cn${url.startsWith('/') ? '' : '/'}${url}`;
  }
  return {
    title,
    publishTime,
    url,
    category: '公司公告'
  };
};

const fetchSseAnnouncements = async (code) => {
  const json = await fetchJson(SSE_ANNOUNCEMENT_API, {
    params: {
      isPagination: 'true',
      productId: code,
      keyWord: '',
      securityType: '0101,120100,020100,020200,120200',
      reportType2: '',
      reportType: 'ALL',
      beginDate: '',
      endDate: '',
      'pageHelp.pageSize': 20,
      'pageHelp.pageCount': 50,
      'pageHelp.pageNo': 1,
      'pageHelp.beginPage': 1,
      'pageHelp.cacheSize': 1,
      'pageHelp.endPage': 5,
      _: Date.now()
    },
    headers: {
      ...SSE_HEADERS,
      Referer: 'https://www.sse.com.cn/disclosure/listedinfo/announcement/'
    }
  });

  const rows = Array.isArray(json?.result) ? json.result : [];
  return dedupeByUrl(rows.map((item) => mapSseItem(item))).filter((item) => item.title && item.url);
};

const fetchSzseAnnouncements = async (code) => {
  const json = await fetchJson(SZSE_ANNOUNCEMENT_API, {
    method: 'POST',
    headers: {
      ...SZSE_HEADERS,
      'Content-Type': 'application/json'
    },
    body: {
      pageNum: 1,
      pageSize: 20,
      stock: [code],
      searchkey: '',
      channelCode: ['listedNotice_disc']
    }
  });

  const rows = Array.isArray(json?.data)
    ? json.data
    : Array.isArray(json?.announceList)
      ? json.announceList
      : Array.isArray(json?.list)
        ? json.list
        : [];

  return dedupeByUrl(rows.map((item) => mapSzseItem(item))).filter((item) => item.title && item.url);
};

const resolveExchangeKindFromSearchItem = (item) => {
  const quoteId = String(item?.QuoteID || '');
  const securityTypeName = String(item?.SecurityTypeName || '');
  const code = normalizeCode(item?.Code || item?.UnifiedCode || '');
  if (quoteId.startsWith('1.') || securityTypeName.includes('沪') || code.startsWith('6') || code.startsWith('9')) {
    return 'sse';
  }
  if (quoteId.startsWith('0.') || securityTypeName.includes('深') || code.startsWith('0') || code.startsWith('2') || code.startsWith('3')) {
    return 'szse';
  }
  return null;
};

const resolveCompanyByKeyword = async (query) => {
  const raw = String(query || '').trim();
  if (!raw) {
    throw new Error('请输入公司关键词');
  }

  const code = normalizeCode(raw);
  if (code) {
    const exchangeKind = resolveExchangeKind({ text: code, stock: { symbol: code, exchange: '', market: '' } });
    if (!exchangeKind) {
      throw new Error(`无法判断 ${code} 的交易所`);
    }
    return { code, name: code, exchangeKind };
  }

  const payload = await fetchJson(EASTMONEY_SEARCH_API, {
    params: {
      input: raw,
      type: 14,
      token: EASTMONEY_SEARCH_TOKEN,
      count: 10
    },
    headers: {
      Referer: 'https://quote.eastmoney.com/',
      'User-Agent': 'Mozilla/5.0',
      Accept: 'application/json, text/plain, */*'
    }
  });

  const rows = Array.isArray(payload?.QuotationCodeTable?.Data) ? payload.QuotationCodeTable.Data : [];
  const normalizedQuery = normalizeKeyword(raw);
  const candidates = rows
    .map((item) => ({
      code: normalizeCode(item?.Code || item?.UnifiedCode || ''),
      name: String(item?.Name || '').trim(),
      exchangeKind: resolveExchangeKindFromSearchItem(item),
      raw: item
    }))
    .filter((item) => item.code && item.name && item.exchangeKind);

  const exact = candidates.find((item) => normalizeKeyword(item.name) === normalizedQuery || item.code === code);
  if (exact) return exact;

  const partial = candidates.find((item) => normalizeKeyword(item.name).includes(normalizedQuery));
  if (partial) return partial;

  if (candidates[0]) return candidates[0];
  throw new Error(`未找到与“${raw}”相关的上市公司`);
};

export const fetchAnnouncementsByExchange = async (exchangeKind, code) => {
  if (exchangeKind === 'sse') {
    return fetchSseAnnouncements(code);
  }
  if (exchangeKind === 'szse') {
    return fetchSzseAnnouncements(code);
  }
  return [];
};

export const isExchangeSourceUrl = (url) => /^exchange:\/\//i.test(String(url || ''));

export const getExchangeSourceKind = (url) => {
  const normalized = String(url || '').toLowerCase();
  if (normalized === SSE_SOURCE_URL) return 'sse';
  if (normalized === SZSE_SOURCE_URL) return 'szse';
  return null;
};

export const shouldUseExchangeSourceForKeyword = (url, keyword) => {
  if (keyword?.kind !== 'stock') return false;
  const sourceKind = getExchangeSourceKind(url);
  const keywordKind = resolveExchangeKind(keyword);
  return Boolean(sourceKind && keywordKind && sourceKind === keywordKind);
};

export const fetchExchangeAnnouncementArticles = async (keyword, source) => {
  if (!shouldUseExchangeSourceForKeyword(source?.url, keyword)) {
    return [];
  }

  const exchangeKind = resolveExchangeKind(keyword);
  const code = normalizeCode(keyword?.stock?.symbol || keyword?.text || '');
  if (!exchangeKind || !code) {
    return [];
  }

  const cacheKey = getCacheKey(exchangeKind, code);
  const cached = readCache(cacheKey);
  const rows = cached || await fetchAnnouncementsByExchange(exchangeKind, code);
  if (!cached) {
    writeCache(cacheKey, rows);
  }

  const companyName = keyword.stock?.name || keyword.text || code;
  const sourceLabel = getExchangeLabel(exchangeKind);
  return rows.map((item) => ({
    title: item.title,
    summary: `${sourceLabel} | ${companyName}(${code})`,
    url: item.url,
    source: sourceLabel,
    publishTime: item.publishTime,
    content: [
      `证券名称：${companyName}`,
      `证券代码：${code}`,
      `交易所：${sourceLabel}`,
      `公告日期：${item.publishTime}`,
      `PDF链接：${item.url}`
    ].join('\n'),
    score: 1
  }));
};

export const probeExchangeSource = async (url) => {
  const exchangeKind = getExchangeSourceKind(url);
  if (!exchangeKind) {
    throw new Error('Unsupported exchange source');
  }

  const sampleCode = SAMPLE_CODES[exchangeKind];
  await fetchAnnouncementsByExchange(exchangeKind, sampleCode);
  return {
    checkedUrl: exchangeKind === 'sse' ? SSE_ANNOUNCEMENT_API : SZSE_ANNOUNCEMENT_API
  };
};

export const fetchExchangeAnnouncementDemo = async (query) => {
  const resolved = await resolveCompanyByKeyword(query);
  const code = resolved.code;
  const exchangeKind = resolved.exchangeKind;
  const companyName = resolved.name || code;
  const sourceLabel = getExchangeLabel(exchangeKind);
  const rows = await fetchAnnouncementsByExchange(exchangeKind, code);
  return {
    results: rows.map((item) => ({
      title: item.title,
      subtitle: `${sourceLabel} | ${companyName}(${code})`,
      description: item.url,
      url: item.url,
      source: sourceLabel,
      publishTime: item.publishTime
    })),
    errors: []
  };
};
