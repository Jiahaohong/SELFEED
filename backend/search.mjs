import Parser from 'rss-parser';
import { sources } from './sources.mjs';
import {
  getKeyword,
  getKeywordLastChecked,
  linkKeywordArticle,
  listKeywords,
  updateKeywordLastChecked,
  upsertArticle
} from './store.mjs';

const parser = new Parser();
const FETCH_TIMEOUT_MS = Number(process.env.RSS_TIMEOUT_MS || 8000);
const MAX_ITEMS_PER_SOURCE = 40;

const stripHtml = (value) => {
  if (!value) return '';
  return value.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
};

const normalizeText = (value) => (value || '').toLowerCase();

const buildTerms = (keyword) => {
  const rawTerms = [keyword.text, ...(keyword.aliases || [])];
  if (keyword.kind === 'stock' && keyword.stock) {
    rawTerms.push(
      keyword.stock.symbol,
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

const scoreMatch = (title, snippet, terms) => {
  const lowerTitle = normalizeText(title);
  const lowerSnippet = normalizeText(snippet);

  let score = 0;
  terms.forEach(term => {
    if (lowerTitle.includes(term)) {
      score = Math.max(score, 1);
    } else if (lowerSnippet.includes(term)) {
      score = Math.max(score, 0.7);
    }
  });

  return score;
};

const normalizeItem = (item, sourceName) => {
  const title = item.title ?? 'Untitled';
  const snippet = item.contentSnippet ?? stripHtml(item.content ?? '') ?? '';
  const content = stripHtml(item.content ?? item.summary ?? item.contentSnippet ?? '') || snippet;
  const url = item.link ?? item.guid ?? '';
  const publishTime = item.isoDate ?? item.pubDate ?? new Date().toISOString();

  return {
    title,
    summary: snippet.slice(0, 200),
    content,
    url,
    publishTime,
    source: item.creator || sourceName || 'Unknown'
  };
};

const fetchFeedXml = async (url) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Selfeed/0.1'
      }
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    return await response.text();
  } finally {
    clearTimeout(timeout);
  }
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

  let matched = 0;

  for (const source of sources) {
    try {
      const xml = await fetchFeedXml(source.url);
      const feed = await parser.parseString(xml);
      const items = (feed.items || []).slice(0, MAX_ITEMS_PER_SOURCE);

      for (const item of items) {
        const normalized = normalizeItem(item, source.name || feed.title);
        if (!normalized.url) continue;

        const score = scoreMatch(normalized.title, normalized.summary, terms);
        if (score <= 0) continue;

        const articleId = upsertArticle({
          title: normalized.title,
          summary: normalized.summary,
          url: normalized.url,
          source: normalized.source,
          publishTime: normalized.publishTime,
          content: normalized.content
        });

        linkKeywordArticle({ keywordId, articleId, score });
        matched += 1;
      }
    } catch (error) {
      console.error(`Failed to fetch source ${source.name}:`, error?.message || error);
    }
  }

  updateKeywordLastChecked(keywordId);
  return { matched, sources: sources.length };
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
