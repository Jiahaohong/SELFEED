import express from 'express';
import cors from 'cors';
import {
  createKeyword,
  createFolder,
  deleteKeyword,
  deleteFolder,
  getArticle,
  getFolder,
  getKeyword,
  listArticlesForFolder,
  listArticlesForKeyword,
  listFolders,
  listFolderLinks,
  listKeywordsForFolder,
  addKeywordToFolder,
  removeKeywordFromFolder,
  listKeywords,
  markIrrelevant,
  updateFolder,
  updateKeyword
} from './store.mjs';
import { refreshDueKeywords, refreshKeyword } from './search.mjs';
import { getAllChannelMetadata } from './core/channelRegistry.mjs';
import { runChannel } from './core/executor.mjs';
import { getAllSources, getEnabledSources, getSourceById, setSourceEnabled } from './sources.mjs';
import { checkSourcesStatus } from './sourceStatus.mjs';
import {
  runChannelDemo,
  runExchangeDemo,
  runRssDemo,
  runStockApiDemo,
  runWebDemo
} from './sourceDemos.mjs';

const app = express();
const port = Number(process.env.PORT || 8787);
const STOCK_QUOTE_CHANNEL = 'stock_price_api';
const STOCK_SOURCE_ALIAS_TO_CHANNEL = {
  auto: STOCK_QUOTE_CHANNEL,
  'stock-api': STOCK_QUOTE_CHANNEL,
  stock_price_api: STOCK_QUOTE_CHANNEL
};

app.use(cors());
app.use(express.json());

app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

app.get('/api/channels/metadata', (_req, res) => {
  res.json(getAllChannelMetadata());
});

app.post('/api/demo/rss', async (req, res) => {
  try {
    const data = await runRssDemo(req.body?.query || '');
    res.json(data);
  } catch (error) {
    res.json({
      results: [],
      errors: [error?.message || String(error)]
    });
  }
});

app.post('/api/demo/exchange', async (req, res) => {
  try {
    const data = await runExchangeDemo(req.body?.query || '');
    res.json(data);
  } catch (error) {
    res.json({
      results: [],
      errors: [error?.message || String(error)]
    });
  }
});

app.post('/api/demo/web', async (req, res) => {
  try {
    const data = await runWebDemo(req.body?.query || '');
    res.json(data);
  } catch (error) {
    res.json({
      results: [],
      errors: [error?.message || String(error)]
    });
  }
});

app.post('/api/demo/stock-api', async (req, res) => {
  try {
    const data = await runStockApiDemo(req.body?.query || '');
    res.json(data);
  } catch (error) {
    res.json({
      results: [],
      errors: [error?.message || String(error)]
    });
  }
});

app.post('/api/demo/channel/:name', async (req, res) => {
  try {
    const data = await runChannelDemo({
      channelName: String(req.params.name || '').trim(),
      query: req.body?.query || ''
    });
    res.json(data);
  } catch (error) {
    res.json({
      results: [],
      errors: [error?.message || String(error)]
    });
  }
});

app.get('/api/sources', (_req, res) => {
  res.json(getAllSources());
});

app.get('/api/sources/status', async (_req, res) => {
  try {
    const data = await checkSourcesStatus(getAllSources(), { force: true });
    res.json(data);
  } catch (error) {
    console.error('Failed to check source status', error);
    res.status(500).send('Failed to check source status');
  }
});

app.get('/api/sources/:id/status', async (req, res) => {
  const source = getSourceById(req.params.id);
  if (!source) {
    res.status(404).send('Source not found');
    return;
  }
  try {
    const data = await checkSourcesStatus([source], { force: true });
    res.json(data[0]);
  } catch (error) {
    console.error('Failed to check source status', error);
    res.status(500).send('Failed to check source status');
  }
});

app.patch('/api/sources/:id', (req, res) => {
  const { enabled } = req.body || {};
  if (typeof enabled !== 'boolean') {
    res.status(400).send('enabled must be boolean');
    return;
  }
  const updated = setSourceEnabled(req.params.id, enabled);
  if (!updated) {
    res.status(404).send('Source not found');
    return;
  }
  res.json(updated);
});

app.get('/api/keywords', (_req, res) => {
  res.json(listKeywords());
});

app.get('/api/folders', (_req, res) => {
  res.json(listFolders());
});

app.get('/api/folder-links', (_req, res) => {
  res.json(listFolderLinks());
});

app.post('/api/folders', (req, res) => {
  const { name } = req.body || {};
  if (!name) {
    res.status(400).send('Folder name is required');
    return;
  }
  const folder = createFolder({ name });
  res.status(201).json(folder);
});

app.post('/api/folders/:id/keywords', (req, res) => {
  const folder = getFolder(req.params.id);
  if (!folder) {
    res.status(404).send('Folder not found');
    return;
  }
  const { keywordId } = req.body || {};
  if (!keywordId) {
    res.status(400).send('keywordId is required');
    return;
  }
  const keyword = getKeyword(keywordId);
  if (!keyword) {
    res.status(404).send('Keyword not found');
    return;
  }
  addKeywordToFolder(folder.id, keywordId);
  res.status(204).end();
});

app.delete('/api/folders/:id/keywords/:keywordId', (req, res) => {
  const folder = getFolder(req.params.id);
  if (!folder) {
    res.status(404).send('Folder not found');
    return;
  }
  removeKeywordFromFolder(folder.id, req.params.keywordId);
  res.status(204).end();
});

app.patch('/api/folders/:id', (req, res) => {
  const folder = updateFolder(req.params.id, req.body || {});
  if (!folder) {
    res.status(404).send('Folder not found');
    return;
  }
  res.json(folder);
});

app.delete('/api/folders/:id', (req, res) => {
  const folder = getFolder(req.params.id);
  if (!folder) {
    res.status(404).send('Folder not found');
    return;
  }
  deleteFolder(req.params.id);
  res.status(204).end();
});

app.post('/api/keywords', (req, res) => {
  const { text, aliases, frequencyMinutes, enabled, kind, stock } = req.body || {};
  if (!text) {
    res.status(400).send('Keyword text is required');
    return;
  }
  const keyword = createKeyword({ text, aliases, frequencyMinutes, enabled, kind, stock });
  res.status(201).json(keyword);
});

app.patch('/api/keywords/:id', (req, res) => {
  const keyword = updateKeyword(req.params.id, req.body || {});
  if (!keyword) {
    res.status(404).send('Keyword not found');
    return;
  }
  res.json(keyword);
});

app.delete('/api/keywords/:id', (req, res) => {
  const keyword = getKeyword(req.params.id);
  if (!keyword) {
    res.status(404).send('Keyword not found');
    return;
  }
  deleteKeyword(req.params.id);
  res.status(204).end();
});

app.post('/api/keywords/:id/refresh', async (req, res) => {
  const keyword = getKeyword(req.params.id);
  if (!keyword) {
    res.status(404).send('Keyword not found');
    return;
  }

  const result = await refreshKeyword(req.params.id);
  res.json(result);
});

const parseSummaryKeyValues = (summary) => {
  const text = String(summary || '');
  const pairs = text.match(/[A-Za-z0-9_]+=[^,|]+/g) || [];
  const map = {};
  pairs.forEach((pair) => {
    const [key, ...valueParts] = pair.split('=');
    const value = valueParts.join('=').trim();
    if (key && value) {
      map[key.trim()] = value;
    }
  });
  return map;
};

const parseNumber = (value) => {
  const text = String(value || '').replace(/,/g, '').trim();
  if (!text) return NaN;
  const parsed = Number(text.replace(/%/g, ''));
  if (Number.isFinite(parsed)) return parsed;
  const firstNumber = text.match(/[-+]?\d*\.?\d+(?:[eE][-+]?\d+)?/);
  if (!firstNumber) return NaN;
  const fallback = Number(firstNumber[0]);
  if (!Number.isFinite(fallback)) return NaN;
  return fallback;
};

const parseLegacySummary = (summary) => {
  const text = String(summary || '');
  const priceMatch = text.match(/Price:\s*([-+]?\d*\.?\d+(?:[eE][-+]?\d+)?)/i);
  const changeMatch = text.match(/Change:\s*([-+]?\d*\.?\d+(?:[eE][-+]?\d+)?)/i);
  const percentMatch = text.match(/\(([-+]?\d*\.?\d+(?:[eE][-+]?\d+)?)%\)/);
  return {
    price: parseNumber(priceMatch?.[1]),
    change: parseNumber(changeMatch?.[1]),
    changePercent: parseNumber(percentMatch?.[1])
  };
};

const normalizeEastmoneyRawField = (value, threshold) => {
  const rawText = String(value || '').trim();
  const parsed = parseNumber(rawText);
  if (!Number.isFinite(parsed)) return NaN;
  if (rawText.includes('.')) {
    return parsed;
  }
  if (Math.abs(parsed) >= threshold) {
    return parsed / 100;
  }
  return parsed;
};

const pickNumber = (map, keys) => {
  for (const key of keys) {
    const parsed = parseNumber(map[key]);
    if (Number.isFinite(parsed)) return parsed;
  }
  return NaN;
};

const parseSeriesRaw = (value) => String(value || '')
  .split('/')
  .map((item) => parseNumber(item))
  .filter((item) => Number.isFinite(item));

const buildDaySeries = ({ symbol, price, change, prevClose }) => {
  if (!Number.isFinite(price)) return [];
  const points = 24;
  const base = Number.isFinite(prevClose) && prevClose > 0
    ? prevClose
    : (price - (Number.isFinite(change) ? change : 0));
  const safeBase = Number.isFinite(base) ? base : price;
  const amplitude = Math.max(
    Math.abs(Number.isFinite(change) ? change : 0) * 0.2,
    Math.abs(price) * 0.002
  );
  const seed = String(symbol || '')
    .split('')
    .reduce((acc, char) => acc + char.charCodeAt(0), 0);
  const series = [];
  for (let i = 0; i < points; i += 1) {
    const ratio = i / (points - 1);
    const baseline = safeBase + (price - safeBase) * ratio;
    const wave = Math.sin((i / 3) + (seed % 11)) * amplitude;
    const value = i === points - 1 ? price : baseline + wave;
    series.push(Number(value.toFixed(2)));
  }
  return series;
};

const isStockQuoteSummaryArticle = (article) => {
  const title = String(article?.title || '').trim();
  const source = String(article?.source || '').toLowerCase();
  if (!/stock price$/i.test(title)) return false;
  return (
    source.includes('api')
    || source.includes('eastmoney')
    || source.includes('tencent')
    || source.includes('sina')
    || source.includes('netease')
    || source.includes('yahoo')
  );
};

const resolveStockQuoteChannel = (rawSource) => {
  const normalized = String(rawSource || 'auto').trim().toLowerCase();
  const channelName = STOCK_SOURCE_ALIAS_TO_CHANNEL[normalized];
  if (!channelName) return null;
  return {
    requestedSource: normalized,
    channelName
  };
};

const isChannelEnabled = (channelName) => getEnabledSources()
  .some((source) => source.channelName === channelName);

app.get('/api/keywords/:id/stock-quote', async (req, res) => {
  const keyword = getKeyword(req.params.id);
  if (!keyword) {
    res.status(404).send('Keyword not found');
    return;
  }
  if (keyword.kind !== 'stock') {
    res.status(400).send('Keyword is not a stock');
    return;
  }

  const symbol = String(keyword.stock?.symbol || keyword.text || '').trim().toUpperCase();
  if (!symbol) {
    res.status(400).send('Stock symbol is required');
    return;
  }
  const sourceQuery = Array.isArray(req.query.source) ? req.query.source[0] : req.query.source;
  const sourceConfig = resolveStockQuoteChannel(sourceQuery);
  if (!sourceConfig) {
    res.status(400).send('Unsupported stock quote source. Allowed: auto, stock-api, stock_price_api');
    return;
  }
  if (!isChannelEnabled(sourceConfig.channelName)) {
    res.status(503).send(`Stock quote channel is disabled: ${sourceConfig.channelName}`);
    return;
  }

  try {
    const enabledSourceIds = getEnabledSources()
      .filter((source) => source.channelName === sourceConfig.channelName)
      .map((source) => String(source?.channelParams?.sourceId || '').trim())
      .filter(Boolean);
    const records = await runChannel(sourceConfig.channelName, {
      symbol,
      ...(enabledSourceIds.length > 0 ? { sourceIds: enabledSourceIds } : {})
    });
    const item = records?.[0];
    if (!item) {
      res.status(502).send('No stock quote result');
      return;
    }

    const titleMatch = String(item.title || '').match(/^(.*)\s+\(([^)]+)\)\s+Stock Price$/i);
    const parsedName = titleMatch?.[1]?.trim() || String(keyword.stock?.name || keyword.text || symbol);
    const parsedSymbol = titleMatch?.[2]?.trim() || symbol;
    const summary = String(item.summary || '');
    const fields = parseSummaryKeyValues(summary);
    let price = pickNumber(fields, [
      'price_raw_3',
      'price_raw',
      'regularMarketPrice_raw',
      'price_raw_f43'
    ]);
    let change = pickNumber(fields, [
      'change_raw_31',
      'updown_raw',
      'regularMarketChange_raw',
      'change_raw_f169'
    ]);
    let changePercent = pickNumber(fields, [
      'change_percent_raw_32',
      'percent_raw',
      'regularMarketChangePercent_raw',
      'change_percent_raw_f170'
    ]);
    let prevClose = pickNumber(fields, [
      'prev_close_raw_4',
      'prev_close_raw_2',
      'yestclose_raw',
      'prev_close_raw_f60'
    ]);
    if (!Number.isFinite(price) || !Number.isFinite(change) || !Number.isFinite(changePercent)) {
      const legacy = parseLegacySummary(summary);
      if (!Number.isFinite(price) && Number.isFinite(legacy.price)) {
        price = legacy.price;
      }
      if (!Number.isFinite(change) && Number.isFinite(legacy.change)) {
        change = legacy.change;
      }
      if (!Number.isFinite(changePercent) && Number.isFinite(legacy.changePercent)) {
        changePercent = legacy.changePercent;
      }
    }
    if (String(item.source || '').toLowerCase().includes('eastmoney')) {
      const eastmoneyPrice = normalizeEastmoneyRawField(fields.price_raw_f43, 10000);
      if (Number.isFinite(eastmoneyPrice)) {
        price = eastmoneyPrice;
      }
      const eastmoneyChange = normalizeEastmoneyRawField(fields.change_raw_f169, 100);
      if (Number.isFinite(eastmoneyChange)) {
        change = eastmoneyChange;
      }
      const eastmoneyPercent = normalizeEastmoneyRawField(fields.change_percent_raw_f170, 100);
      if (Number.isFinite(eastmoneyPercent)) {
        changePercent = eastmoneyPercent;
      }
      const eastmoneyPrevClose = normalizeEastmoneyRawField(fields.prev_close_raw_f60, 10000);
      if (Number.isFinite(eastmoneyPrevClose)) {
        prevClose = eastmoneyPrevClose;
      }
    }
    const safePrice = Number.isFinite(price) ? price : 0;
    const safeChange = Number.isFinite(change) ? change : 0;
    const safeChangePercent = Number.isFinite(changePercent) ? changePercent : 0;
    const safePrevClose = Number.isFinite(prevClose) ? prevClose : (safePrice - safeChange);
    const currency = String(keyword.stock?.currency || (parsedSymbol.match(/^\d{6}$/) ? 'CNY' : 'USD'));
    const daySeries = parseSeriesRaw(fields.intraday_series_raw);

    res.json({
      symbol: parsedSymbol,
      name: parsedName,
      price: safePrice,
      change: safeChange,
      changePercent: safeChangePercent,
      currency,
      source: String(item.source || sourceConfig.channelName),
      series: daySeries.length >= 10
        ? daySeries
        : buildDaySeries({
          symbol: parsedSymbol,
          price: safePrice,
          change: safeChange,
          prevClose: safePrevClose
        }),
      summary: String(item.summary || ''),
      url: String(item.url || ''),
      rawTitle: String(item.title || ''),
      updatedAt: String(item.date || new Date().toISOString())
    });
  } catch (error) {
    console.error('Failed to fetch stock quote', error?.message || error);
    res.status(502).send(error?.message || 'Failed to fetch stock quote');
  }
});

app.get('/api/articles', (req, res) => {
  const keywordId = req.query.keywordId;
  const folderId = req.query.folderId;
  if (folderId && typeof folderId === 'string') {
    res.json(listArticlesForFolder(folderId));
    return;
  }
  if (keywordId && typeof keywordId === 'string') {
    const keyword = getKeyword(keywordId);
    const articles = listArticlesForKeyword(keywordId);
    if (keyword?.kind === 'stock') {
      res.json(articles.filter((article) => !isStockQuoteSummaryArticle(article)));
      return;
    }
    res.json(articles);
    return;
  }
  res.status(400).send('keywordId or folderId is required');
});

app.get('/api/articles/:id', (req, res) => {
  const article = getArticle(req.params.id);
  if (!article) {
    res.status(404).send('Article not found');
    return;
  }
  res.json(article);
});

app.post('/api/articles/:id/irrelevant', (req, res) => {
  const { keywordId } = req.body || {};
  if (!keywordId) {
    res.status(400).send('keywordId is required');
    return;
  }
  markIrrelevant(keywordId, req.params.id);
  res.status(204).end();
});

app.post('/api/folders/:id/refresh', async (req, res) => {
  const folder = getFolder(req.params.id);
  if (!folder) {
    res.status(404).send('Folder not found');
    return;
  }
  const keywords = listKeywordsForFolder(folder.id);
  let matched = 0;
  for (const keyword of keywords) {
    const result = await refreshKeyword(keyword.id);
    matched += result.matched;
  }
  res.json({ matched, sources: keywords.length });
});

app.post('/api/folders/:id/articles/:articleId/irrelevant', (req, res) => {
  const folder = getFolder(req.params.id);
  if (!folder) {
    res.status(404).send('Folder not found');
    return;
  }
  const keywords = listKeywordsForFolder(folder.id);
  keywords.forEach(keyword => {
    markIrrelevant(keyword.id, req.params.articleId);
  });
  res.status(204).end();
});

const seedKeywords = () => {
  if (listKeywords().length > 0) return;
  createKeyword({
    text: 'Gold',
    aliases: ['gold', 'XAU'],
    frequencyMinutes: 360,
    enabled: true
  });
};

seedKeywords();

const scheduleIntervalMs = 60 * 1000;

let server;
let scheduleHandle;
let isShuttingDown = false;

const shutdown = async () => {
  if (isShuttingDown) return;
  isShuttingDown = true;

  if (scheduleHandle) {
    clearInterval(scheduleHandle);
    scheduleHandle = undefined;
  }

  if (server) {
    await new Promise((resolve) => {
      server.close(() => resolve());
    });
    server = undefined;
  }

};

const bootstrap = async () => {
  server = app.listen(port, () => {
    console.log(`Selfeed backend listening on ${port}`);
  });

  server.on('error', (error) => {
    console.error('Backend server failed to start', error);
    process.exit(1);
  });

  scheduleHandle = setInterval(() => {
    refreshDueKeywords().catch((error) => {
      console.error('Scheduled refresh failed', error);
    });
  }, scheduleIntervalMs);
};

bootstrap().catch((error) => {
  console.error('Failed to bootstrap backend', error);
  process.exit(1);
});

process.on('SIGINT', async () => {
  await shutdown();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await shutdown();
  process.exit(0);
});
