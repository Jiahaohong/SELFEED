import { runChannel } from './core/executor.mjs';
import { getChannelByName } from './core/channelRegistry.mjs';

const STATUS_TIMEOUT_MS = Number(process.env.SOURCE_STATUS_TIMEOUT_MS || 8000);
const STATUS_CONCURRENCY = Number(process.env.SOURCE_STATUS_CONCURRENCY || 16);

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const withTimeout = async (promiseFactory, timeoutMs) => {
  let timeoutHandle;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutHandle = setTimeout(() => {
      reject(new Error(`Probe timeout after ${timeoutMs}ms`));
    }, timeoutMs);
  });
  try {
    return await Promise.race([promiseFactory(), timeoutPromise]);
  } finally {
    clearTimeout(timeoutHandle);
  }
};

const resolveChannelName = (source) => {
  const explicit = String(source?.channelName || '').trim();
  if (explicit) return explicit;
  const url = String(source?.url || '').trim();
  const match = url.match(/^channel:\/\/(.+)$/i);
  return match?.[1] || '';
};

const clonePlainObject = (value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return Object.entries(value).reduce((acc, [key, item]) => {
    if (!key) return acc;
    acc[key] = item;
    return acc;
  }, {});
};

const buildProbeParams = (channel) => {
  const healthcheckParams = clonePlainObject(
    channel?.metadata?.healthcheck_params ?? channel?.metadata?.probe_params
  );
  if (healthcheckParams && Object.keys(healthcheckParams).length > 0) {
    return healthcheckParams;
  }
  const schema = channel?.metadata?.input_schema || {};
  if ('symbol' in schema) return { symbol: '600519' };
  if ('keyword' in schema) return { keyword: '政策' };
  return {};
};

const probeSource = async (source, options = {}) => {
  const checkedAt = new Date().toISOString();
  const force = Boolean(options.force);
  const channelName = resolveChannelName(source);
  if (source.enabled === false && !force) {
    return {
      id: source.id,
      name: source.name,
      url: source.url,
      channelName,
      enabled: false,
      status: 'disabled',
      checkedAt
    };
  }

  const channel = getChannelByName(channelName);
  if (!channel) {
    return {
      id: source.id,
      name: source.name,
      url: source.url,
      channelName,
      enabled: source.enabled !== false,
      status: 'error',
      message: `Unknown channel: ${channelName || 'empty'}`,
      checkedAt
    };
  }

  const params = {
    ...buildProbeParams(channel),
    ...(clonePlainObject(source?.channelParams) || {})
  };
  try {
    const result = await withTimeout(
      () => runChannel(channelName, params),
      STATUS_TIMEOUT_MS
    );
    const count = Array.isArray(result) ? result.length : 0;
    return {
      id: source.id,
      name: source.name,
      url: source.url,
      channelName,
      enabled: source.enabled !== false,
      status: 'ok',
      checkedUrl: `channel://${channelName}`,
      message: `Probe ok, records: ${count}`,
      checkedAt
    };
  } catch (error) {
    return {
      id: source.id,
      name: source.name,
      url: source.url,
      channelName,
      enabled: source.enabled !== false,
      status: 'error',
      message: error?.message || String(error),
      checkedAt
    };
  }
};

export const checkSourcesStatus = async (sources, options = {}) => {
  const results = [];
  let cursor = 0;

  const workers = Array.from({ length: Math.max(1, STATUS_CONCURRENCY) }, async () => {
    while (cursor < sources.length) {
      const current = sources[cursor];
      cursor += 1;
      if (!current || !current.url) continue;
      const result = await probeSource(current, options);
      results.push(result);
      await wait(10);
    }
  });

  await Promise.all(workers);
  return results;
};
