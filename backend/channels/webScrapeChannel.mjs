import {
  decodeHtmlEntities,
  dedupeChannelRecords,
  normalizeChannelRecord,
  normalizeText,
  stripHtml,
  toAbsoluteUrl
} from './channelUtils.mjs';

const WEB_RESULT_LIMIT = Number(process.env.WEB_CHANNEL_RESULT_LIMIT || 20);
const WEB_FETCH_CONCURRENCY = Number(process.env.WEB_CHANNEL_CONCURRENCY || 4);
const LINK_PATTERN = /<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;

const WEB_SOURCE_CONFIGS = [
  {
    id: 'govcn-zhengce',
    url: 'https://www.gov.cn/zhengce/',
    source: '中国政府网政策',
    enabledByDefault: true
  },
  {
    id: 'stats-home',
    url: 'https://www.stats.gov.cn/',
    source: '国家统计局',
    enabledByDefault: true
  },
  {
    id: 'pbc-home',
    url: 'http://www.pbc.gov.cn/',
    source: '中国人民银行',
    enabledByDefault: true
  },
  {
    id: 'mof-home',
    url: 'https://www.mof.gov.cn/',
    source: '财政部',
    enabledByDefault: true
  },
  {
    id: 'ndrc-home',
    url: 'https://www.ndrc.gov.cn/',
    source: '国家发展改革委',
    enabledByDefault: true
  },
  {
    id: 'npc-home',
    url: 'http://www.npc.gov.cn/',
    source: '全国人大',
    enabledByDefault: true
  },
  {
    id: 'court-home',
    url: 'https://www.court.gov.cn/',
    source: '最高人民法院',
    enabledByDefault: true
  },
  {
    id: 'spp-home',
    url: 'https://www.spp.gov.cn/',
    source: '最高人民检察院',
    enabledByDefault: true
  },
  {
    id: 'ccdi-home',
    url: 'https://www.ccdi.gov.cn/',
    source: '中央纪委国家监委',
    enabledByDefault: true
  }
];

const runWithConcurrency = async (items, limit, handler) => {
  const all = [];
  let cursor = 0;
  const workers = Array.from({ length: Math.max(1, limit) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      const item = items[index];
      if (!item) continue;
      const rows = await handler(item);
      if (Array.isArray(rows) && rows.length > 0) {
        all.push(...rows);
      }
    }
  });
  await Promise.all(workers);
  return all;
};

const getSourceConfigs = (params = {}) => {
  const requestedSourceId = String(params.sourceId || '').trim();
  const requestedSourceIds = Array.isArray(params.sourceIds)
    ? params.sourceIds.map((item) => String(item || '').trim()).filter(Boolean)
    : [];
  const requested = requestedSourceIds.length > 0
    ? requestedSourceIds
    : (requestedSourceId ? [requestedSourceId] : []);
  if (requested.length === 0) return WEB_SOURCE_CONFIGS;
  return WEB_SOURCE_CONFIGS.filter((item) => requested.includes(item.id));
};

class WebScrapeChannel {
  constructor() {
    this.metadata = {
      name: 'macro_policy_scraper',
      description: '抓取宏观政策新闻',
      input_schema: {
        keyword: 'string'
      },
      healthcheck_params: {
        keyword: '政策',
        sourceId: 'govcn-zhengce'
      }
    };
  }

  listSources() {
    return WEB_SOURCE_CONFIGS.map((item) => ({
      id: item.id,
      name: item.source,
      url: item.url,
      enabledByDefault: item.enabledByDefault !== false
    }));
  }

  async execute(params = {}) {
    const keyword = String(params.keyword || '').trim();
    if (!keyword) {
      throw new Error('keyword is required');
    }

    const configs = getSourceConfigs(params);
    if (configs.length === 0) {
      throw new Error('Web source not found');
    }
    const strictSourceSelection = String(params.sourceId || '').trim().length > 0
      || (Array.isArray(params.sourceIds) && params.sourceIds.length > 0);

    const lowerKeyword = normalizeText(keyword);
    const all = await runWithConcurrency(configs, WEB_FETCH_CONCURRENCY, async (config) => {
      try {
        const response = await fetch(config.url, {
          headers: {
            Accept: 'text/html,application/xhtml+xml',
            'User-Agent': 'Selfeed/0.1'
          }
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const html = await response.text();
        const results = [];
        LINK_PATTERN.lastIndex = 0;
        let match;
        while ((match = LINK_PATTERN.exec(html)) !== null) {
          const href = match[1];
          const rawTitle = stripHtml(decodeHtmlEntities(match[2])).trim();
          if (!rawTitle || rawTitle.length < 6) continue;
          if (!normalizeText(rawTitle).includes(lowerKeyword)) continue;

          const absUrl = toAbsoluteUrl(href, config.url);
          if (!absUrl) continue;

          results.push(normalizeChannelRecord({
            title: rawTitle,
            date: new Date().toISOString(),
            summary: '',
            url: absUrl,
            source: config.source
          }));
        }

        return results;
      } catch (error) {
        if (strictSourceSelection) {
          throw error;
        }
        console.error(`Web channel failed for ${config.url}:`, error?.message || error);
        return [];
      }
    });

    return dedupeChannelRecords(all).slice(0, WEB_RESULT_LIMIT);
  }
}

export default new WebScrapeChannel();
