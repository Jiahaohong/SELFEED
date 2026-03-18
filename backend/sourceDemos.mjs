import { runChannel } from './core/executor.mjs';
import { getEnabledSources } from './sources.mjs';
import { getChannelByName } from './core/channelRegistry.mjs';

const RSS_RESULTS_LIMIT = Number(process.env.RSS_DEMO_RESULTS_LIMIT || 20);
const WEB_RESULTS_LIMIT = Number(process.env.WEB_DEMO_RESULTS_LIMIT || 20);
const DEFAULT_RESULTS_LIMIT = Number(process.env.CHANNEL_DEMO_RESULTS_LIMIT || 20);

const mapRecordsToDemoResults = (records) => records.map((item) => ({
  title: item.title,
  subtitle: item.source,
  description: item.summary,
  url: item.url,
  source: item.source,
  publishTime: item.date
}));

const assertChannelEnabled = (channelName) => {
  const enabled = getEnabledSources().some(
    (source) => source.channelName === channelName
  );
  if (!enabled) {
    throw new Error(`通道未启用：${channelName}`);
  }
};

const buildDemoParams = (channel, query) => {
  const schema = channel?.metadata?.input_schema || {};
  const keys = Object.keys(schema);
  if (keys.length === 0) return {};
  if ('symbol' in schema) {
    return { symbol: String(query || '').trim().toUpperCase() };
  }
  if ('keyword' in schema) {
    return { keyword: String(query || '').trim() };
  }
  const firstKey = keys[0];
  return {
    [firstKey]: String(query || '').trim()
  };
};

export const runChannelDemo = async ({ channelName, query }) => {
  const channel = getChannelByName(channelName);
  if (!channel) {
    throw new Error(`Unknown channel: ${channelName}`);
  }
  const cleaned = String(query || '').trim();
  if (!cleaned) {
    throw new Error('请输入查询内容');
  }

  assertChannelEnabled(channelName);
  const params = buildDemoParams(channel, cleaned);
  const records = await runChannel(channelName, params);
  return {
    results: mapRecordsToDemoResults(records).slice(0, DEFAULT_RESULTS_LIMIT),
    errors: []
  };
};

export const runRssDemo = async (query) => {
  const keyword = String(query || '').trim();
  if (!keyword) {
    throw new Error('请输入 RSS 搜索关键词');
  }
  assertChannelEnabled('news_rss_channel');
  const records = await runChannel('news_rss_channel', { keyword });
  return {
    results: mapRecordsToDemoResults(records).slice(0, RSS_RESULTS_LIMIT),
    errors: []
  };
};

export const runWebDemo = async (query) => {
  const keyword = String(query || '').trim();
  if (!keyword) {
    throw new Error('请输入网页抓取关键词');
  }
  assertChannelEnabled('macro_policy_scraper');
  const records = await runChannel('macro_policy_scraper', { keyword });
  return {
    results: mapRecordsToDemoResults(records).slice(0, WEB_RESULTS_LIMIT),
    errors: []
  };
};

export const runExchangeDemo = async (query) => runWebDemo(query);

export const runStockApiDemo = async (query) => {
  const symbol = String(query || '').trim().toUpperCase();
  if (!symbol) {
    throw new Error('请输入股票代码');
  }
  assertChannelEnabled('stock_price_api');
  const records = await runChannel('stock_price_api', { symbol });
  return {
    results: mapRecordsToDemoResults(records),
    errors: []
  };
};
