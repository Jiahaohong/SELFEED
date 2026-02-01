const hashString = (value) => {
  let hash = 7;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) % 100000;
  }
  return hash;
};

const roundTo = (value, decimals = 2) => {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
};

const buildSeries = (base, seed, change) => {
  const points = 24;
  const series = [];
  for (let i = 0; i < points; i += 1) {
    const wave = Math.sin((i / 3) + seed) * (0.6 + (seed % 5) / 10);
    const trend = (change / 6) * ((i / (points - 1)) - 0.5);
    series.push(roundTo(base + wave + trend, 2));
  }
  return series;
};

export const getMockStockQuote = (keyword) => {
  const symbol = (keyword.stock?.symbol || keyword.text || 'STK').toUpperCase();
  const name = keyword.stock?.name || keyword.text || symbol;
  const exchange = keyword.stock?.exchange || '';
  const market = keyword.stock?.market || '';
  const currency = keyword.stock?.currency || 'USD';

  const seed = hashString(`${symbol}:${exchange}:${market}`);
  const hourFactor = Math.sin((Date.now() / 3600000 + seed) / 5);
  const basePrice = 40 + (seed % 460) + hourFactor * 2;
  const change = roundTo(((seed % 20) - 10) / 10 + hourFactor / 2, 2);
  const price = roundTo(basePrice + change, 2);
  const changePercent = roundTo((change / price) * 100, 2);
  const series = buildSeries(price, seed / 13, change);

  return {
    symbol,
    name,
    price,
    change,
    changePercent,
    currency,
    series,
    updatedAt: new Date().toISOString()
  };
};
