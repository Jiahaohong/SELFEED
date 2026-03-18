import Parser from 'rss-parser';
import iconvModule from 'iconv-lite';
import {
  decodeHtmlEntities,
  dedupeChannelRecords,
  normalizeChannelRecord,
  normalizeText,
  stripHtml,
  toAbsoluteUrl
} from './channelUtils.mjs';

const RSS_REQUEST_TIMEOUT_MS = Number(process.env.RSS_CHANNEL_TIMEOUT_MS || 12000);
const RSS_RESULT_LIMIT = Number(process.env.RSS_CHANNEL_RESULT_LIMIT || 20);
const RSS_FETCH_CONCURRENCY = Number(process.env.RSS_CHANNEL_CONCURRENCY || 6);
const INCLUDE_UNSTABLE_RSS_SOURCES = /^(1|true|yes)$/i.test(
  String(process.env.RSS_CHANNEL_INCLUDE_UNSTABLE || '')
);
const parser = new Parser();
const iconv = iconvModule?.default || iconvModule;

const DEFAULT_SOURCE_CONFIGS = [
  {
    id: 'mfa-lqbb',
    url: 'https://cs.mfa.gov.cn/gyls/lsgz/lqbb/rss_57447.xml',
    source: '外交部领事播报',
    parse: parseMfaLqbbFeed
  },
  {
    id: 'mfa-fwxx',
    url: 'https://cs.mfa.gov.cn/gyls/lsgz/fwxx/rss_57447.xml',
    source: '外交部领事服务信息',
    parse: parseMfaFwxxFeed
  },
  {
    id: 'mfa-lsyj',
    url: 'https://cs.mfa.gov.cn/gyls/lsgz/lsyj/rss_57447.xml',
    source: '外交部领事预警',
    parse: parseMfaLsyjFeed
  },
  {
    id: 'stats-zxfb',
    url: 'https://www.stats.gov.cn/sj/zxfb/rss.xml',
    source: '国家统计局最新发布',
    parse: parseStatsZhFeed
  },
  {
    id: 'stats-sjjd',
    url: 'https://www.stats.gov.cn/sj/sjjd/rss.xml',
    source: '国家统计局数据解读',
    parse: parseStatsZhFeed
  },
  {
    id: 'stats-pressrelease-en',
    url: 'https://www.stats.gov.cn/english/PressRelease/rss.xml',
    source: 'NBS Press Release',
    parse: parseStatsEnglishFeed
  },
  {
    id: 'stats-pressrelease-en-http',
    url: 'http://www.stats.gov.cn/english/PressRelease/rss.xml',
    source: 'NBS Press Release',
    parse: parseStatsEnglishFeed
  },
  // 宏观 / 金融新闻
  {
    id: 'chinaorg-1195896',
    url: 'http://www.china.org.cn/rss/1195896.xml',
    source: 'China.org.cn Finance',
    parse: parseChinaOrgFinanceFeed,
    enabledByDefault: false
  },
  {
    id: 'chinadaily-business',
    url: 'http://www.chinadaily.com.cn/rss/business_rss.xml',
    source: 'China Daily Business',
    parse: parseChinaDailyBusinessFeed,
    enabledByDefault: false
  },
  {
    id: 'chinanews-finance',
    url: 'http://www.chinanews.com/rss/finance.xml',
    source: '中国新闻网财经',
    parse: parseChinaNewsFinanceFeed
  },
  {
    id: 'gmw-finance',
    url: 'http://www.gmw.cn/rss/finance.xml',
    source: '光明网财经',
    parse: parseGmwFinanceFeed,
    enabledByDefault: false
  },
  // 证券 / 交易所 / 财经媒体
  {
    id: 'cnstock-news',
    url: 'http://www.cnstock.com/rss/rss_news.xml',
    source: '上海证券报',
    parse: parseCnstockFeed,
    enabledByDefault: false
  },
  {
    id: 'stcn',
    url: 'http://www.stcn.com/rss/rss.xml',
    source: '证券时报',
    parse: parseStcnFeed
  },
  {
    id: 'sina-finance',
    url: 'https://rss.sina.com.cn/finance.xml',
    source: '新浪财经',
    parse: parseSinaFinanceFeed,
    enabledByDefault: false
  },
  {
    id: 'sina-stock',
    url: 'https://rss.sina.com.cn/stock.xml',
    source: '新浪股票',
    parse: parseSinaStockFeed,
    enabledByDefault: false
  },
  {
    id: 'sina-bank',
    url: 'https://rss.sina.com.cn/bank.xml',
    source: '新浪银行',
    parse: parseSinaBankFeed,
    enabledByDefault: false
  },
  // RSSHub 金融源
  {
    id: 'rsshub-eastmoney-news',
    url: 'https://rsshub.app/eastmoney/news',
    source: 'RSSHub Eastmoney News',
    parse: parseRsshubEastmoneyNewsFeed,
    enabledByDefault: false
  },
  {
    id: 'rsshub-eastmoney-report',
    url: 'https://rsshub.app/eastmoney/report',
    source: 'RSSHub Eastmoney Report',
    parse: parseRsshubEastmoneyReportFeed,
    enabledByDefault: false
  },
  {
    id: 'rsshub-tencent-finance',
    url: 'https://rsshub.app/tencent/finance',
    source: 'RSSHub Tencent Finance',
    parse: parseRsshubTencentFinanceFeed,
    enabledByDefault: false
  },
  {
    id: 'rsshub-wallstreetcn-news',
    url: 'https://rsshub.app/wallstreetcn/news',
    source: 'RSSHub WallstreetCN News',
    parse: parseRsshubWallstreetcnNewsFeed,
    enabledByDefault: false
  },
  {
    id: 'rsshub-wallstreetcn-live',
    url: 'https://rsshub.app/wallstreetcn/live',
    source: 'RSSHub WallstreetCN Live',
    parse: parseRsshubWallstreetcnLiveFeed,
    enabledByDefault: false
  },
  // 聚合 / 财经分类
  {
    id: 'xinwengao-business',
    url: 'https://www.xinwengao.com/rss/business.xml',
    source: '新闻稿网商业频道',
    parse: parseXinwengaoBusinessFeed,
    enabledByDefault: false
  },
  {
    id: 'xinwengao-finance',
    url: 'https://www.xinwengao.com/rss/finance.xml',
    source: '新闻稿网财经频道',
    parse: parseXinwengaoFinanceFeed,
    enabledByDefault: false
  },
  {
    id: 'xinwengao-energy',
    url: 'https://www.xinwengao.com/rss/energy.xml',
    source: '新闻稿网能源频道',
    parse: parseXinwengaoEnergyFeed,
    enabledByDefault: false
  },
  // FT 中文
  {
    id: 'ftchinese-news',
    url: 'https://www.ftchinese.com/rss/news',
    source: 'FT中文网新闻',
    parse: parseFtChineseNewsFeed,
    enabledByDefault: false
  },
  {
    id: 'ftchinese-finance',
    url: 'https://www.ftchinese.com/rss/finance',
    source: 'FT中文网财经',
    parse: parseFtChineseFinanceFeed,
    enabledByDefault: false
  },
  {
    id: 'chinaorg-1201719',
    url: 'http://www.china.org.cn/rss/1201719.xml',
    source: 'China.org.cn Government',
    parse: parseChinaOrg1201719Feed,
    enabledByDefault: false
  },
  {
    id: 'chinaorg-1185842',
    url: 'http://www.china.org.cn/rss/1185842.xml',
    source: 'China.org.cn China',
    parse: parseChinaOrg1185842Feed,
    enabledByDefault: false
  },
  {
    id: 'chinaorg-en-201724',
    url: 'http://www.china.org.cn/english/rss/201724.xml',
    source: 'China.org.cn English',
    parse: parseChinaOrgEnglishFeed
  },
  {
    id: 'xinwengao-government',
    url: 'https://www.xinwengao.com/rss/government.xml',
    source: '新闻稿网政府频道',
    parse: parseXinwengaoGovernmentFeed,
    enabledByDefault: false
  },
  // 法律 / 司法 / 监管
  {
    id: 'legaldaily-fzrb',
    url: 'http://www.legaldaily.com.cn/rss/fzrb.xml',
    source: '法治日报',
    parse: parseLegalDailyFeed,
    enabledByDefault: false
  },
  {
    id: 'chinanews-legal',
    url: 'https://www.chinanews.com.cn/rss/society.xml',
    source: '中国新闻网法治',
    parse: parseChinaNewsLegalFeed
  },
  {
    id: 'gmw-legal',
    url: 'http://www.gmw.cn/rss/legal.xml',
    source: '光明网法治',
    parse: parseGmwLegalFeed,
    enabledByDefault: false
  },
  {
    id: 'rsshub-thepaper-law',
    url: 'https://rsshub.app/thepaper/channel/25951',
    source: 'RSSHub 澎湃法治',
    parse: parseRsshubThePaperLawFeed,
    enabledByDefault: false
  },
  {
    id: 'sz-gzw-rss',
    url: 'https://gzw.sz.gov.cn/RSS/',
    source: '深圳国资委',
    parse: parseShenzhenGzwFeed
  },
  {
    id: 'sz-jtys-rss',
    url: 'https://jtys.sz.gov.cn/fzlm/rss/',
    source: '深圳交通运输局',
    parse: parseShenzhenJtysFeed
  },
  {
    id: 'anshunjkq-rss',
    url: 'https://www.anshunjkq.gov.cn/syqt/rssdy/',
    source: '安顺经开区',
    parse: parseAnshunGovernmentFeed
  },
  {
    id: 'govcn-main-rss',
    url: 'http://www.gov.cn/rss.xml',
    source: '中国政府网',
    parse: parseGovCnFeed,
    enabledByDefault: false
  },
  {
    id: 'chinadaily-china',
    url: 'http://www.chinadaily.com.cn/rss/china_rss.xml',
    source: 'China Daily China',
    parse: parseChinaDailyChinaFeed,
    enabledByDefault: false
  },
  // 医疗 / 健康 / 生物医药
  {
    id: 'chinanews-health',
    url: 'https://www.chinanews.com.cn/rss/health.xml',
    source: '中国新闻网健康',
    parse: parseChinaNewsHealthFeed
  },
  {
    id: 'gmw-health',
    url: 'http://www.gmw.cn/rss/health.xml',
    source: '光明网健康',
    parse: parseGmwHealthFeed,
    enabledByDefault: false
  },
  {
    id: 'chinadaily-life',
    url: 'http://www.chinadaily.com.cn/rss/life_rss.xml',
    source: 'China Daily Life',
    parse: parseChinaDailyLifeFeed,
    enabledByDefault: false
  },
  {
    id: 'xinwengao-health',
    url: 'https://www.xinwengao.com/rss/health.xml',
    source: '新闻稿网健康频道',
    parse: parseXinwengaoHealthFeed,
    enabledByDefault: false
  },
  {
    id: 'xinwengao-chemical',
    url: 'https://www.xinwengao.com/rss/chemical.xml',
    source: '新闻稿网化工医药频道',
    parse: parseXinwengaoChemicalFeed,
    enabledByDefault: false
  },
  {
    id: 'rsshub-thepaper-health',
    url: 'https://rsshub.app/thepaper/channel/25950',
    source: 'RSSHub 澎湃健康',
    parse: parseRsshubThePaperHealthFeed,
    enabledByDefault: false
  },
  {
    id: 'rsshub-36kr-health',
    url: 'https://rsshub.app/36kr/information/health',
    source: 'RSSHub 36Kr Health',
    parse: parseRsshub36krHealthFeed,
    enabledByDefault: false
  },
  {
    id: 'rsshub-36kr-biotech',
    url: 'https://rsshub.app/36kr/information/biotech',
    source: 'RSSHub 36Kr Biotech',
    parse: parseRsshub36krBiotechFeed,
    enabledByDefault: false
  },
  {
    id: 'ftchinese-health',
    url: 'https://www.ftchinese.com/rss/health',
    source: 'FT中文网健康',
    parse: parseFtChineseHealthFeed,
    enabledByDefault: false
  },
  {
    id: 'ftchinese-tech',
    url: 'https://www.ftchinese.com/rss/tech',
    source: 'FT中文网科技',
    parse: parseFtChineseTechFeed,
    enabledByDefault: false
  }
];

const getSourceConfigs = () => {
  const fromEnv = String(process.env.RSS_CHANNEL_URLS || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  if (fromEnv.length > 0) {
    return fromEnv.map((url, index) => ({
      id: `env-${index + 1}`,
      url,
      source: 'RSS Feed',
      parse: parseGenericFeed
    }));
  }
  return DEFAULT_SOURCE_CONFIGS.filter(
    (item) => INCLUDE_UNSTABLE_RSS_SOURCES || item.enabledByDefault !== false
  );
};

const getAllSourceConfigsForManagement = () => {
  const fromEnv = String(process.env.RSS_CHANNEL_URLS || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  if (fromEnv.length > 0) {
    return fromEnv.map((url, index) => ({
      id: `env-${index + 1}`,
      url,
      source: 'RSS Feed',
      parse: parseGenericFeed,
      enabledByDefault: true
    }));
  }
  return DEFAULT_SOURCE_CONFIGS;
};

function escapeRegex(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function cleanupXmlValue(value) {
  const raw = String(value || '')
    .replace(/^<!\[CDATA\[([\s\S]*?)\]\]>$/i, '$1')
    .trim();
  return decodeHtmlEntities(stripHtml(raw)).trim();
}

function asString(value) {
  if (value === undefined || value === null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return asString(value[0]);
  if (typeof value === 'object') {
    if ('href' in value) return asString(value.href);
    if ('_' in value) return asString(value._);
    try {
      return JSON.stringify(value);
    } catch {
      return '';
    }
  }
  return '';
}

function extractTag(block, tagName) {
  const escaped = escapeRegex(tagName);
  const regex = new RegExp(`<${escaped}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${escaped}>`, 'i');
  const match = String(block || '').match(regex);
  return match?.[1] || '';
}

function extractFirstTag(block, tagNames) {
  for (const tagName of tagNames) {
    const value = extractTag(block, tagName);
    if (String(value || '').trim()) return value;
  }
  return '';
}

function extractLink(block, baseUrl) {
  const linkAttr = String(block || '').match(/<link\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*\/?>/i);
  if (linkAttr?.[1]) return toAbsoluteUrl(linkAttr[1], baseUrl);
  const linkValue = cleanupXmlValue(extractFirstTag(block, ['link', 'guid', 'id']));
  return toAbsoluteUrl(linkValue, baseUrl) || linkValue;
}

function extractChannelTitle(text) {
  const raw = String(text || '');
  const channelStart = raw.search(/<channel\b/i);
  const itemStart = raw.search(/<(item|entry)\b/i);
  if (channelStart >= 0 && itemStart > channelStart) {
    const section = raw.slice(channelStart, itemStart);
    const title = cleanupXmlValue(extractTag(section, 'title'));
    if (title) return title;
  }
  return cleanupXmlValue(extractTag(raw, 'title'));
}

function parseItemBlocks(text) {
  return String(text || '').match(/<item\b[\s\S]*?<\/item>/gi) || [];
}

function parseEntryBlocks(text) {
  return String(text || '').match(/<entry\b[\s\S]*?<\/entry>/gi) || [];
}

function parseRssItemsByRegex({ text, url, source }) {
  const channelTitle = extractChannelTitle(text) || source;
  return parseItemBlocks(text)
    .map((block) => {
      const title = cleanupXmlValue(extractFirstTag(block, ['title']));
      const date = cleanupXmlValue(extractFirstTag(block, ['pubDate', 'dc:date', 'date']));
      const summary = cleanupXmlValue(extractFirstTag(block, ['description', 'content:encoded', 'summary']));
      const link = extractLink(block, url);
      return normalizeChannelRecord({
        title: title || 'Untitled',
        date: date || new Date().toISOString(),
        summary,
        url: link || '',
        source: channelTitle || source
      });
    })
    .filter((item) => item.url);
}

function parseAtomEntriesByRegex({ text, url, source }) {
  const feedTitle = extractChannelTitle(text) || source;
  return parseEntryBlocks(text)
    .map((block) => {
      const title = cleanupXmlValue(extractFirstTag(block, ['title']));
      const date = cleanupXmlValue(extractFirstTag(block, ['updated', 'published']));
      const summary = cleanupXmlValue(extractFirstTag(block, ['summary', 'content']));
      const link = extractLink(block, url);
      return normalizeChannelRecord({
        title: title || 'Untitled',
        date: date || new Date().toISOString(),
        summary,
        url: link || '',
        source: feedTitle || source
      });
    })
    .filter((item) => item.url);
}

function parseHtmlAnchors({ text, url, source }) {
  const results = [];
  const linkPattern = /<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = linkPattern.exec(String(text || ''))) !== null) {
    const href = toAbsoluteUrl(match[1], url);
    const title = cleanupXmlValue(match[2]);
    if (!href || !title || title.length < 4) continue;
    results.push(normalizeChannelRecord({
      title,
      date: new Date().toISOString(),
      summary: '',
      url: href,
      source
    }));
  }
  return results;
}

function sanitizeBrokenXml(text) {
  return String(text || '')
    .replace(/&(?![A-Za-z0-9#]+;)/g, '&amp;')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
}

async function parseWithRssParserThenRegex(ctx) {
  const safeText = sanitizeBrokenXml(ctx.text);
  try {
    const feed = await parser.parseString(safeText);
    const sourceName = asString(feed?.title) || ctx.source;
    const items = (feed?.items || [])
      .map((item) => {
        const title = cleanupXmlValue(asString(item?.title) || 'Untitled');
        const date = cleanupXmlValue(asString(item?.isoDate || item?.pubDate || item?.date));
        const summary = cleanupXmlValue(asString(item?.contentSnippet || item?.content || item?.summary));
        const link = toAbsoluteUrl(
          asString(item?.link || item?.guid || item?.id),
          ctx.url
        ) || asString(item?.link || item?.guid || item?.id);
        return normalizeChannelRecord({
          title,
          date: date || new Date().toISOString(),
          summary,
          url: link,
          source: sourceName
        });
      })
      .filter((item) => item.url);
    if (items.length > 0) return items;
  } catch {
    // fall back to regex strategies
  }

  const itemResults = parseRssItemsByRegex(ctx);
  if (itemResults.length > 0) return itemResults;
  const atomResults = parseAtomEntriesByRegex(ctx);
  if (atomResults.length > 0) return atomResults;
  return parseHtmlAnchors(ctx);
}

function parseMfaLqbbFeed(ctx) {
  return parseRssItemsByRegex(ctx);
}

function parseMfaFwxxFeed(ctx) {
  const rssItems = parseRssItemsByRegex(ctx);
  if (rssItems.length > 0) return rssItems;
  const atomEntries = parseAtomEntriesByRegex(ctx);
  if (atomEntries.length > 0) return atomEntries;
  return parseHtmlAnchors(ctx);
}

function parseMfaLsyjFeed(ctx) {
  return parseRssItemsByRegex(ctx);
}

function parseStatsZhFeed(ctx) {
  return parseWithRssParserThenRegex(ctx);
}

function parseStatsEnglishFeed(ctx) {
  return parseRssItemsByRegex(ctx);
}

function parseChinaOrgFinanceFeed(ctx) {
  return parseWithRssParserThenRegex(ctx);
}

function parseChinaDailyBusinessFeed(ctx) {
  return parseWithRssParserThenRegex(ctx);
}

function parseChinaNewsFinanceFeed(ctx) {
  return parseWithRssParserThenRegex(ctx);
}

function parseGmwFinanceFeed(ctx) {
  return parseWithRssParserThenRegex(ctx);
}

function parseCnstockFeed(ctx) {
  return parseWithRssParserThenRegex(ctx);
}

function parseStcnFeed(ctx) {
  return parseWithRssParserThenRegex(ctx);
}

function parseSinaFinanceFeed(ctx) {
  return parseWithRssParserThenRegex(ctx);
}

function parseSinaStockFeed(ctx) {
  return parseWithRssParserThenRegex(ctx);
}

function parseSinaBankFeed(ctx) {
  return parseWithRssParserThenRegex(ctx);
}

function parseRsshubEastmoneyNewsFeed(ctx) {
  return parseWithRssParserThenRegex(ctx);
}

function parseRsshubEastmoneyReportFeed(ctx) {
  return parseWithRssParserThenRegex(ctx);
}

function parseRsshubTencentFinanceFeed(ctx) {
  return parseWithRssParserThenRegex(ctx);
}

function parseRsshubWallstreetcnNewsFeed(ctx) {
  return parseWithRssParserThenRegex(ctx);
}

function parseRsshubWallstreetcnLiveFeed(ctx) {
  return parseWithRssParserThenRegex(ctx);
}

function parseXinwengaoBusinessFeed(ctx) {
  return parseWithRssParserThenRegex(ctx);
}

function parseXinwengaoFinanceFeed(ctx) {
  return parseWithRssParserThenRegex(ctx);
}

function parseXinwengaoEnergyFeed(ctx) {
  return parseWithRssParserThenRegex(ctx);
}

function parseFtChineseNewsFeed(ctx) {
  return parseWithRssParserThenRegex(ctx);
}

function parseFtChineseFinanceFeed(ctx) {
  return parseWithRssParserThenRegex(ctx);
}

function parseChinaOrg1201719Feed(ctx) {
  return parseWithRssParserThenRegex(ctx);
}

function parseChinaOrg1185842Feed(ctx) {
  return parseRssItemsByRegex(ctx);
}

function parseChinaOrgEnglishFeed(ctx) {
  return parseWithRssParserThenRegex(ctx);
}

function parseXinwengaoGovernmentFeed(ctx) {
  return parseWithRssParserThenRegex(ctx);
}

function parseLegalDailyFeed(ctx) {
  return parseWithRssParserThenRegex(ctx);
}

function parseChinaNewsLegalFeed(ctx) {
  return parseWithRssParserThenRegex(ctx);
}

function parseGmwLegalFeed(ctx) {
  return parseWithRssParserThenRegex(ctx);
}

function parseRsshubThePaperLawFeed(ctx) {
  return parseWithRssParserThenRegex(ctx);
}

function parseShenzhenGzwFeed(ctx) {
  return parseWithRssParserThenRegex(ctx);
}

function parseShenzhenJtysFeed(ctx) {
  return parseWithRssParserThenRegex(ctx);
}

function parseAnshunGovernmentFeed(ctx) {
  return parseWithRssParserThenRegex(ctx);
}

function parseGovCnFeed(ctx) {
  return parseWithRssParserThenRegex(ctx);
}

function parseChinaDailyChinaFeed(ctx) {
  return parseWithRssParserThenRegex(ctx);
}

function parseChinaNewsHealthFeed(ctx) {
  return parseWithRssParserThenRegex(ctx);
}

function parseGmwHealthFeed(ctx) {
  return parseWithRssParserThenRegex(ctx);
}

function parseChinaDailyLifeFeed(ctx) {
  return parseWithRssParserThenRegex(ctx);
}

function parseXinwengaoHealthFeed(ctx) {
  return parseWithRssParserThenRegex(ctx);
}

function parseXinwengaoChemicalFeed(ctx) {
  return parseWithRssParserThenRegex(ctx);
}

function parseRsshubThePaperHealthFeed(ctx) {
  return parseWithRssParserThenRegex(ctx);
}

function parseRsshub36krHealthFeed(ctx) {
  return parseWithRssParserThenRegex(ctx);
}

function parseRsshub36krBiotechFeed(ctx) {
  return parseWithRssParserThenRegex(ctx);
}

function parseFtChineseHealthFeed(ctx) {
  return parseWithRssParserThenRegex(ctx);
}

function parseFtChineseTechFeed(ctx) {
  return parseWithRssParserThenRegex(ctx);
}

function parseGenericFeed(ctx) {
  return parseWithRssParserThenRegex(ctx);
}

function resolveCharset(contentType) {
  const raw = String(contentType || '').toLowerCase();
  const match = raw.match(/charset=([a-z0-9._-]+)/i);
  const charset = match?.[1] || '';
  if (charset.includes('gbk') || charset.includes('gb2312') || charset.includes('gb18030')) {
    return 'gb18030';
  }
  if (charset.includes('utf-8') || charset.includes('utf8')) {
    return 'utf8';
  }
  return '';
}

function chooseDecodedText(buffer, contentType) {
  const declared = resolveCharset(contentType);
  if (declared === 'utf8') return buffer.toString('utf8');
  if (declared === 'gb18030') return iconv.decode(buffer, 'gb18030');

  const utf8 = buffer.toString('utf8');
  const gb = iconv.decode(buffer, 'gb18030');
  const score = (value) => {
    const replacementCount = (value.match(/�/g) || []).length;
    const xmlHint = /<(rss|feed|channel|item|entry)\b/i.test(value) ? 5 : 0;
    return xmlHint - replacementCount;
  };
  return score(gb) > score(utf8) ? gb : utf8;
}

async function fetchTextWithTimeout(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), RSS_REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        Accept: 'application/rss+xml, application/xml, text/xml, text/html, */*',
        'User-Agent': 'Mozilla/5.0'
      }
    });
    if (!response.ok) {
      throw new Error(`Status code ${response.status}`);
    }
    const contentType = response.headers.get('content-type') || '';
    const buffer = Buffer.from(await response.arrayBuffer());
    return chooseDecodedText(buffer, contentType);
  } finally {
    clearTimeout(timeout);
  }
}

async function runWithConcurrency(items, limit, handler) {
  const all = [];
  let cursor = 0;
  const workers = Array.from({ length: Math.max(1, limit) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      const item = items[index];
      if (!item) continue;
      const results = await handler(item);
      if (Array.isArray(results) && results.length > 0) {
        all.push(...results);
      }
    }
  });
  await Promise.all(workers);
  return all;
}

class RSSChannel {
  constructor() {
    this.metadata = {
      name: 'news_rss_channel',
      description: '获取财经媒体RSS新闻',
      input_schema: {
        keyword: 'string'
      },
      healthcheck_params: {
        keyword: '政策'
      }
    };
  }

  listSources() {
    const configs = getAllSourceConfigsForManagement();
    return configs.map((config) => ({
      id: String(config.id || '').trim(),
      name: String(config.source || config.id || 'RSS Feed').trim(),
      url: String(config.url || '').trim(),
      enabledByDefault: config.enabledByDefault !== false
    }));
  }

  async execute(params = {}) {
    const keyword = String(params.keyword || '').trim();
    if (!keyword) {
      throw new Error('keyword is required');
    }

    const lowerKeyword = normalizeText(keyword);
    const requestedSourceId = String(params.sourceId || '').trim();
    const requestedSourceIds = Array.isArray(params.sourceIds)
      ? params.sourceIds.map((item) => String(item || '').trim()).filter(Boolean)
      : [];
    const requested = requestedSourceIds.length > 0
      ? requestedSourceIds
      : (requestedSourceId ? [requestedSourceId] : []);
    const allConfigs = getSourceConfigs();
    const configs = requested.length > 0
      ? allConfigs.filter((config) => requested.includes(String(config.id || '').trim()))
      : allConfigs;
    if (configs.length === 0) {
      throw new Error('RSS source not found');
    }
    const all = await runWithConcurrency(
      configs,
      RSS_FETCH_CONCURRENCY,
      async (config) => {
        try {
          const text = await fetchTextWithTimeout(config.url);
          const parsed = await config.parse({
            id: config.id,
            url: config.url,
            source: config.source,
            text
          });
          return (parsed || [])
            .filter((item) => item.url)
            .filter((item) => {
              const title = normalizeText(item.title);
              const summary = normalizeText(item.summary);
              return title.includes(lowerKeyword) || summary.includes(lowerKeyword);
            });
        } catch (error) {
          console.error(`RSS channel failed for ${config.url}:`, error?.message || error);
          return [];
        }
      }
    );

    return dedupeChannelRecords(all).slice(0, RSS_RESULT_LIMIT);
  }
}

export default new RSSChannel();
