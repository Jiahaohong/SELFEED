const DEFAULT_RSSHUB_BASES = [
  'https://rsshub.app'
];

const normalizeBaseUrl = (value) => value.replace(/\/+$/, '');

export const isRsshubUrl = (rawUrl) => typeof rawUrl === 'string' && /^rsshub:\/\//i.test(rawUrl);

export const extractRsshubRoute = (rawUrl) => {
  if (!isRsshubUrl(rawUrl)) return '';
  return rawUrl.replace(/^rsshub:\/\//i, '').replace(/^\/+/, '');
};

export const getRsshubBaseUrls = () => {
  const envList = process.env.RSSHUB_BASE_URLS || process.env.RSSHUB_BASE_URL || '';
  const fromEnv = envList
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map(normalizeBaseUrl);
  if (fromEnv.length > 0) return fromEnv;
  return DEFAULT_RSSHUB_BASES.map(normalizeBaseUrl);
};

export const resolveFeedUrls = (rawUrl) => {
  if (!isRsshubUrl(rawUrl)) return [rawUrl];
  const route = extractRsshubRoute(rawUrl);
  if (!route) return [];
  const bases = getRsshubBaseUrls();
  return bases.map((base) => `${base}/${route}`);
};
