import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getAllChannelMetadata, getChannelByName } from './core/channelRegistry.mjs';
const CHANNEL_SOURCE_PREFIX = {
  news_rss_channel: 'rss',
  stock_price_api: 'stock',
  macro_policy_scraper: 'web'
};
const CHANNEL_SOURCE_LABEL = {
  news_rss_channel: 'RSS',
  stock_price_api: '股票API',
  macro_policy_scraper: '网页爬取'
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const sourcesPath = path.join(__dirname, 'sources.json');

const loadSources = () => {
  try {
    const raw = fs.readFileSync(sourcesPath, 'utf-8');
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed;
    }
  } catch (error) {
    console.error('Failed to load sources.json', error);
  }

  return [];
};

const toChannelName = (source) => {
  const explicit = String(source?.channelName || '').trim();
  if (explicit) return explicit;
  const url = String(source?.url || '').trim();
  const match = url.match(/^channel:\/\/(.+)$/i);
  return match?.[1] || '';
};

const isValidSource = (source) => (
  source
  && typeof source.id === 'string'
  && source.id.trim().length > 0
  && typeof source.name === 'string'
  && source.name.trim().length > 0
  && typeof source.url === 'string'
  && source.url.trim().length > 0
  && Boolean(getChannelByName(toChannelName(source)))
);

const normalizeChannelParams = (value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const next = Object.entries(value).reduce((acc, [key, item]) => {
    if (!key) return acc;
    acc[key] = item;
    return acc;
  }, {});
  return Object.keys(next).length > 0 ? next : undefined;
};

const normalizeSource = (source) => {
  const channelName = toChannelName(source);
  const channelMeta = getChannelByName(channelName)?.metadata || {};
  return {
    id: String(source.id || channelName || channelMeta.name || '').trim(),
    name: String(source.name || channelMeta.description || channelMeta.name || '').trim(),
    url: String(source.url || `channel://${channelName}`).trim(),
    channelName,
    channelParams: normalizeChannelParams(source.channelParams),
    enabled: source.enabled !== false
  };
};

const buildChannelSourceEntries = (channelName, baseEnabled = true) => {
  const channel = getChannelByName(channelName);
  if (!channel || typeof channel.listSources !== 'function') return [];
  const sources = channel.listSources();
  if (!Array.isArray(sources) || sources.length === 0) return [];
  const prefix = CHANNEL_SOURCE_PREFIX[channelName] || channelName;
  const label = CHANNEL_SOURCE_LABEL[channelName] || channelName;
  return sources
    .map((item) => {
      const sourceId = String(item?.id || '').trim();
      if (!sourceId) return null;
      return normalizeSource({
        id: `${prefix}-${sourceId}`,
        name: `${label} | ${String(item?.name || sourceId).trim()}`,
        url: String(item?.url || `channel://${channelName}`).trim(),
        channelName,
        channelParams: {
          sourceId
        },
        enabled: baseEnabled && item?.enabledByDefault !== false
      });
    })
    .filter((item) => item && isValidSource(item));
};

const bootstrapDefaultSources = () => getAllChannelMetadata().flatMap((meta) => {
  const channelEntries = buildChannelSourceEntries(meta.name, true);
  if (channelEntries.length > 0) {
    return channelEntries;
  }
  return [{
    id: `channel-${meta.name}`,
    name: meta.description || meta.name,
    url: `channel://${meta.name}`,
    channelName: meta.name,
    enabled: true
  }];
});

const getChannelSourceId = (source) => String(source?.channelParams?.sourceId || '').trim();

const reconcileChannelSources = (sources) => {
  let next = [...sources];
  for (const meta of getAllChannelMetadata()) {
    const channelName = meta.name;
    const hasManagedEntries = buildChannelSourceEntries(channelName, true).length > 0;
    if (!hasManagedEntries) continue;
    const existingForChannel = next.filter((source) => source.channelName === channelName);
    const granularMap = new Map(
      existingForChannel
        .map((source) => [getChannelSourceId(source), source])
        .filter(([sourceId]) => sourceId)
    );
    const hasGranular = granularMap.size > 0;
    const legacy = existingForChannel.filter((source) => !getChannelSourceId(source));
    const baseEnabled = legacy.some((source) => source.enabled !== false);
    const templateEntries = buildChannelSourceEntries(
      channelName,
      hasGranular ? true : baseEnabled
    );
    const merged = templateEntries.map((source) => {
      const sourceId = getChannelSourceId(source);
      const existing = sourceId ? granularMap.get(sourceId) : null;
      if (!existing) return source;
      return normalizeSource({
        ...source,
        enabled: existing.enabled !== false
      });
    });
    next = [
      ...next.filter((source) => source.channelName !== channelName),
      ...merged
    ];
  }
  return next;
};

const persistSources = (sources) => {
  fs.writeFileSync(sourcesPath, JSON.stringify(sources, null, 2));
};

let cachedSources = (() => {
  const loaded = loadSources()
    .map(normalizeSource)
    .filter(isValidSource);
  if (loaded.length > 0) {
    const migrated = reconcileChannelSources(loaded);
    if (JSON.stringify(migrated) !== JSON.stringify(loaded)) {
      persistSources(migrated);
    }
    return migrated;
  }
  const defaults = bootstrapDefaultSources();
  persistSources(defaults);
  return defaults;
})();

export const getAllSources = () => cachedSources;

export const getEnabledSources = () => cachedSources.filter((source) => source.enabled !== false);

export const getSourceById = (id) => cachedSources.find((source) => source.id === id) || null;

export const setSourceEnabled = (id, enabled) => {
  if (!id) return null;
  const next = cachedSources.map((source) => {
    if (source.id === id) {
      return {
        ...source,
        enabled: Boolean(enabled)
      };
    }
    return source;
  });
  const updated = next.find((source) => source.id === id);
  if (!updated) return null;
  cachedSources = next;
  persistSources(cachedSources);
  return updated;
};
