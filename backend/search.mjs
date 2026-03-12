import { getEnabledSources } from './sources.mjs';
import { runChannel } from './core/executor.mjs';
import {
  getKeyword,
  getKeywordLastChecked,
  linkKeywordArticle,
  listKeywords,
  updateKeywordLastChecked,
  upsertArticle
} from './store.mjs';

const CHANNEL_CONCURRENCY = Number(process.env.CHANNEL_CONCURRENCY || 6);

const normalizeText = (value) => (value || '').toLowerCase();

const expandStockSymbolTerms = (rawSymbol, exchange) => {
  const symbol = (rawSymbol || '').trim().toUpperCase();
  if (!symbol) return [];
  const terms = new Set([symbol]);
  const digitsMatch = symbol.match(/\d{6}/);
  const digits = digitsMatch ? digitsMatch[0] : '';
  if (digits) {
    terms.add(digits);
    const exchangeLower = (exchange || '').toLowerCase();
    const isSh = digits.startsWith('6') || exchangeLower.includes('sse') || exchangeLower.includes('上交');
    const isSz = digits.startsWith('0') || digits.startsWith('3') || exchangeLower.includes('szse') || exchangeLower.includes('深交');
    if (isSh) {
      terms.add(`SH${digits}`);
      terms.add(`${digits}.SH`);
    }
    if (isSz) {
      terms.add(`SZ${digits}`);
      terms.add(`${digits}.SZ`);
    }
  }
  return Array.from(terms);
};

const buildTerms = (keyword) => {
  const rawTerms = [keyword.text, ...(keyword.aliases || [])];
  if (keyword.kind === 'stock' && keyword.stock) {
    rawTerms.push(...expandStockSymbolTerms(keyword.stock.symbol, keyword.stock.exchange));
    rawTerms.push(
      keyword.stock.name,
      keyword.stock.exchange,
      keyword.stock.market
    );
  }
  const terms = rawTerms
    .map(term => (term || '').trim())
    .filter(Boolean);
  return Array.from(new Set(terms.map(term => term.toLowerCase())));
};

const scoreMatch = (title, snippet, content, terms) => {
  const lowerTitle = normalizeText(title);
  const lowerSnippet = normalizeText(snippet);
  const lowerContent = normalizeText(content);

  let score = 0;
  terms.forEach(term => {
    if (lowerTitle.includes(term)) {
      score = Math.max(score, 1);
    } else if (lowerSnippet.includes(term)) {
      score = Math.max(score, 0.7);
    } else if (lowerContent.includes(term)) {
      score = Math.max(score, 0.5);
    }
  });

  return score;
};

const runWithConcurrency = async (items, limit, handler) => {
  let cursor = 0;
  const workers = Array.from({ length: Math.max(1, limit) }, async () => {
    let local = 0;
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      const item = items[index];
      if (!item) continue;
      local += await handler(item);
    }
    return local;
  });

  const results = await Promise.all(workers);
  return results.reduce((sum, value) => sum + value, 0);
};

const storeMatchedArticle = ({ keywordId, article, score }) => {
  const articleId = upsertArticle({
    title: article.title,
    summary: article.summary,
    url: article.url,
    source: article.source,
    publishTime: article.publishTime,
    content: article.content
  });

  linkKeywordArticle({ keywordId, articleId, score });
};

const toSymbol = (keyword) => String(keyword?.stock?.symbol || keyword?.text || '')
  .trim()
  .toUpperCase();

const buildChannelParams = (channelName, keyword, source) => {
  if (channelName === 'stock_price_api') {
    // Stock quote data is rendered by the dedicated stock card endpoint,
    // not as article summaries.
    return null;
  }

  if (channelName === 'news_rss_channel' || channelName === 'macro_policy_scraper') {
    const query = keyword.kind === 'stock'
      ? (keyword.stock?.name || keyword.text || keyword.stock?.symbol || '')
      : keyword.text;
    const normalized = String(query || '').trim();
    if (!normalized) return null;
    const channelParams = (
      source?.channelParams
      && typeof source.channelParams === 'object'
      && !Array.isArray(source.channelParams)
    )
      ? source.channelParams
      : {};
    return {
      keyword: normalized,
      ...channelParams
    };
  }

  return null;
};

const normalizeChannelItem = (item, sourceName) => {
  const title = String(item?.title || '').trim();
  const summary = String(item?.summary || '').trim();
  const url = String(item?.url || '').trim();
  const date = String(item?.date || '').trim();
  const source = String(item?.source || sourceName || '').trim();
  if (!title || !url) return null;

  return {
    title,
    summary: summary.slice(0, 200),
    content: [title, summary, url].filter(Boolean).join('\n'),
    url,
    publishTime: date || new Date().toISOString(),
    source
  };
};

export const refreshKeyword = async (keywordId) => {
  const keyword = getKeyword(keywordId);
  if (!keyword || !keyword.enabled) {
    return { matched: 0, sources: 0 };
  }

  const terms = buildTerms(keyword);
  if (terms.length === 0) {
    return { matched: 0, sources: 0 };
  }

  const activeSources = getEnabledSources();
  const runnableSources = activeSources.filter((source) => {
    const channelName = source.channelName;
    return Boolean(channelName && buildChannelParams(channelName, keyword, source));
  });

  const matched = await runWithConcurrency(runnableSources, CHANNEL_CONCURRENCY, async (source) => {
    const channelName = source.channelName;
    const params = buildChannelParams(channelName, keyword, source);
    if (!channelName || !params) return 0;

    try {
      const items = await runChannel(channelName, params);

      let localMatched = 0;
      for (const item of items) {
        const normalized = normalizeChannelItem(item, source.name);
        if (!normalized) continue;

        const score = scoreMatch(normalized.title, normalized.summary, normalized.content, terms);
        if (score <= 0) continue;

        storeMatchedArticle({
          keywordId,
          article: {
            title: normalized.title,
            summary: normalized.summary,
            url: normalized.url,
            source: normalized.source,
            publishTime: normalized.publishTime,
            content: normalized.content
          },
          score
        });
        localMatched += 1;
      }
      return localMatched;
    } catch (error) {
      console.error(
        `Failed to fetch source ${source.name} for keyword ${keyword.text}:`,
        error?.message || error
      );
      return 0;
    }
  });

  updateKeywordLastChecked(keywordId);
  return { matched, sources: runnableSources.length };
};

export const refreshDueKeywords = async () => {
  const keywords = listKeywords();
  const now = Date.now();

  for (const keyword of keywords) {
    if (!keyword.enabled) continue;
    const lastChecked = getKeywordLastChecked(keyword.id);
    if (lastChecked) {
      const diffMinutes = (now - new Date(lastChecked).getTime()) / 60000;
      if (diffMinutes < keyword.frequencyMinutes) {
        continue;
      }
    }
    await refreshKeyword(keyword.id);
  }
};
