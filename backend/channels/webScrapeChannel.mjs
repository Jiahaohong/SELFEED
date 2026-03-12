import {
  decodeHtmlEntities,
  dedupeChannelRecords,
  normalizeChannelRecord,
  normalizeText,
  stripHtml,
  toAbsoluteUrl
} from './channelUtils.mjs';

const LINK_PATTERN = /<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;

class WebScrapeChannel {
  constructor() {
    this.metadata = {
      name: 'macro_policy_scraper',
      description: '抓取宏观政策新闻',
      input_schema: {
        keyword: 'string'
      },
      healthcheck_params: {
        keyword: '政策'
      }
    };
    this.url = 'https://www.gov.cn/zhengce/';
    this.defaultSourceId = 'govcn-zhengce';
  }

  listSources() {
    return [{
      id: this.defaultSourceId,
      name: 'Gov Policy Page',
      url: this.url,
      enabledByDefault: true
    }];
  }

  async execute(params = {}) {
    const keyword = String(params.keyword || '').trim();
    if (!keyword) {
      throw new Error('keyword is required');
    }
    const sourceId = String(params.sourceId || '').trim();
    if (sourceId && sourceId !== this.defaultSourceId) {
      throw new Error('Web source not found');
    }

    const response = await fetch(this.url, {
      headers: {
        Accept: 'text/html,application/xhtml+xml',
        'User-Agent': 'Selfeed/0.1'
      }
    });

    if (!response.ok) {
      throw new Error(`Gov policy page HTTP ${response.status}`);
    }

    const html = await response.text();
    const lowerKeyword = normalizeText(keyword);
    const results = [];

    let match;
    while ((match = LINK_PATTERN.exec(html)) !== null) {
      const href = match[1];
      const rawTitle = stripHtml(decodeHtmlEntities(match[2]));
      if (!rawTitle) continue;
      if (!normalizeText(rawTitle).includes(lowerKeyword)) continue;

      const absUrl = toAbsoluteUrl(href, this.url);
      if (!absUrl) continue;

      results.push(normalizeChannelRecord({
        title: rawTitle,
        date: '',
        summary: '',
        url: absUrl,
        source: 'Gov Policy Page'
      }));
    }

    return dedupeChannelRecords(results).slice(0, 10);
  }
}

export default new WebScrapeChannel();
