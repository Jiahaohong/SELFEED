const HTML_ENTITY_MAP = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&nbsp;': ' '
};

export const stripHtml = (value) => String(value || '')
  .replace(/<[^>]+>/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

export const decodeHtmlEntities = (value) => String(value || '').replace(
  /&amp;|&lt;|&gt;|&quot;|&#39;|&nbsp;/g,
  (token) => HTML_ENTITY_MAP[token] || token
);

export const normalizeText = (value) => String(value || '').trim().toLowerCase();

export const toAbsoluteUrl = (href, base) => {
  const raw = String(href || '').trim();
  if (!raw) return '';
  try {
    return new URL(raw, base).toString();
  } catch {
    return '';
  }
};

export const normalizeChannelRecord = (item) => ({
  title: String(item?.title || '').trim(),
  date: String(item?.date || '').trim(),
  summary: String(item?.summary || '').trim(),
  url: String(item?.url || '').trim(),
  source: String(item?.source || '').trim()
});

export const dedupeChannelRecords = (records) => {
  const seen = new Set();
  return records.filter((item) => {
    const key = `${item.url}::${item.title}`;
    if (!item.url || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};
