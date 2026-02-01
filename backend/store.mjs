import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dbPath = path.join(__dirname, 'selfeed.db');

export const db = new Database(dbPath);

db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS keywords (
    id TEXT PRIMARY KEY,
    text TEXT NOT NULL,
    aliases TEXT DEFAULT '[]',
    frequency_minutes INTEGER DEFAULT 360,
    enabled INTEGER DEFAULT 1,
    kind TEXT DEFAULT 'normal',
    stock_symbol TEXT,
    stock_name TEXT,
    stock_exchange TEXT,
    stock_market TEXT,
    stock_currency TEXT,
    folder_id TEXT,
    created_at TEXT NOT NULL,
    last_checked_at TEXT
  );

  CREATE TABLE IF NOT EXISTS folders (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS folder_keywords (
    folder_id TEXT NOT NULL,
    keyword_id TEXT NOT NULL,
    PRIMARY KEY (folder_id, keyword_id),
    FOREIGN KEY (folder_id) REFERENCES folders(id) ON DELETE CASCADE,
    FOREIGN KEY (keyword_id) REFERENCES keywords(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS articles (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    summary TEXT,
    url TEXT UNIQUE NOT NULL,
    source TEXT,
    publish_time TEXT,
    content TEXT
  );

  CREATE TABLE IF NOT EXISTS keyword_articles (
    keyword_id TEXT NOT NULL,
    article_id TEXT NOT NULL,
    score REAL DEFAULT 0,
    irrelevant INTEGER DEFAULT 0,
    PRIMARY KEY (keyword_id, article_id),
    FOREIGN KEY (keyword_id) REFERENCES keywords(id) ON DELETE CASCADE,
    FOREIGN KEY (article_id) REFERENCES articles(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_keyword_articles_keyword ON keyword_articles(keyword_id);
  CREATE INDEX IF NOT EXISTS idx_articles_publish_time ON articles(publish_time);
  CREATE INDEX IF NOT EXISTS idx_folder_keywords_folder ON folder_keywords(folder_id);
`);

const ensureColumn = (table, column, definition) => {
  const info = db.prepare(`PRAGMA table_info(${table})`).all();
  const exists = info.some(row => row.name === column);
  if (exists) return;
  db.prepare(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`).run();
};

ensureColumn('keywords', 'folder_id', 'TEXT');
ensureColumn('keywords', 'kind', "TEXT DEFAULT 'normal'");
ensureColumn('keywords', 'stock_symbol', 'TEXT');
ensureColumn('keywords', 'stock_name', 'TEXT');
ensureColumn('keywords', 'stock_exchange', 'TEXT');
ensureColumn('keywords', 'stock_market', 'TEXT');
ensureColumn('keywords', 'stock_currency', 'TEXT');

const parseAliases = (value) => {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const serializeAliases = (aliases) => JSON.stringify(Array.isArray(aliases) ? aliases : []);

const normalizeStock = (stock) => {
  if (!stock) return null;
  const symbol = (stock.symbol ?? '').trim();
  const name = (stock.name ?? '').trim();
  const exchange = (stock.exchange ?? '').trim();
  const market = (stock.market ?? '').trim();
  const currency = (stock.currency ?? '').trim();
  if (!symbol && !name && !exchange && !market && !currency) return null;
  return { symbol, name, exchange, market, currency };
};

const stockToDb = (stock) => ({
  symbol: stock?.symbol || null,
  name: stock?.name || null,
  exchange: stock?.exchange || null,
  market: stock?.market || null,
  currency: stock?.currency || null
});

const buildStockFromRow = (row) => {
  const symbol = row.stock_symbol ?? '';
  const name = row.stock_name ?? '';
  const exchange = row.stock_exchange ?? '';
  const market = row.stock_market ?? '';
  const currency = row.stock_currency ?? '';
  if (!symbol && !name && !exchange && !market && !currency) return null;
  return { symbol, name, exchange, market, currency };
};

const toKeyword = (row) => ({
  id: row.id,
  text: row.text,
  aliases: parseAliases(row.aliases),
  frequencyMinutes: row.frequency_minutes,
  enabled: Boolean(row.enabled),
  kind: row.kind === 'stock' ? 'stock' : 'normal',
  stock: buildStockFromRow(row)
});

const toArticle = (row) => ({
  id: row.id,
  title: row.title,
  summary: row.summary ?? '',
  source: row.source ?? '',
  publishTime: row.publish_time ?? new Date().toISOString(),
  url: row.url,
  content: row.content ?? '',
  relevanceScore: row.relevanceScore ?? 0
});

export const listKeywords = () => {
  const rows = db.prepare('SELECT * FROM keywords ORDER BY created_at ASC').all();
  return rows.map(toKeyword);
};

export const listFolders = () => {
  const rows = db.prepare('SELECT * FROM folders ORDER BY created_at ASC').all();
  return rows.map(row => ({
    id: row.id,
    name: row.name
  }));
};

export const listFolderLinks = () => {
  const rows = db.prepare('SELECT folder_id, keyword_id FROM folder_keywords').all();
  return rows.map(row => ({ folderId: row.folder_id, keywordId: row.keyword_id }));
};

export const listKeywordsForFolder = (folderId) => {
  const rows = db.prepare(
    `
      SELECT k.*
      FROM folder_keywords fk
      JOIN keywords k ON k.id = fk.keyword_id
      WHERE fk.folder_id = ?
      ORDER BY k.created_at ASC
    `
  ).all(folderId);
  return rows.map(toKeyword);
};

export const addKeywordToFolder = (folderId, keywordId) => {
  db.prepare(
    'INSERT OR IGNORE INTO folder_keywords (folder_id, keyword_id) VALUES (?, ?)'
  ).run(folderId, keywordId);
};

export const removeKeywordFromFolder = (folderId, keywordId) => {
  db.prepare('DELETE FROM folder_keywords WHERE folder_id = ? AND keyword_id = ?').run(folderId, keywordId);
};

export const getFolder = (id) => {
  const row = db.prepare('SELECT * FROM folders WHERE id = ?').get(id);
  return row ? { id: row.id, name: row.name } : null;
};

export const createFolder = ({ name }) => {
  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  db.prepare('INSERT INTO folders (id, name, created_at) VALUES (?, ?, ?)').run(id, name, createdAt);
  return getFolder(id);
};

export const updateFolder = (id, updates) => {
  const existing = getFolder(id);
  if (!existing) return null;
  const nextName = updates.name ?? existing.name;
  db.prepare('UPDATE folders SET name = ? WHERE id = ?').run(nextName, id);
  return getFolder(id);
};

export const deleteFolder = (id) => {
  db.prepare('DELETE FROM folder_keywords WHERE folder_id = ?').run(id);
  db.prepare('DELETE FROM folders WHERE id = ?').run(id);
};

export const getKeyword = (id) => {
  const row = db.prepare('SELECT * FROM keywords WHERE id = ?').get(id);
  return row ? toKeyword(row) : null;
};

export const createKeyword = ({
  text,
  aliases = [],
  frequencyMinutes = 360,
  enabled = true,
  kind = 'normal',
  stock = null
}) => {
  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  const normalizedKind = kind === 'stock' ? 'stock' : 'normal';
  const normalizedStock = normalizedKind === 'stock' ? normalizeStock(stock) : null;
  const stockDb = stockToDb(normalizedStock);
  db.prepare(
    `INSERT INTO keywords (
      id,
      text,
      aliases,
      frequency_minutes,
      enabled,
      kind,
      stock_symbol,
      stock_name,
      stock_exchange,
      stock_market,
      stock_currency,
      folder_id,
      created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    text,
    serializeAliases(aliases),
    frequencyMinutes,
    enabled ? 1 : 0,
    normalizedKind,
    stockDb.symbol,
    stockDb.name,
    stockDb.exchange,
    stockDb.market,
    stockDb.currency,
    null,
    createdAt
  );
  return getKeyword(id);
};

export const updateKeyword = (id, updates) => {
  const existing = getKeyword(id);
  if (!existing) return null;

  const next = {
    text: updates.text ?? existing.text,
    aliases: updates.aliases ?? existing.aliases,
    frequencyMinutes: updates.frequencyMinutes ?? existing.frequencyMinutes,
    enabled: typeof updates.enabled === 'boolean' ? updates.enabled : existing.enabled,
    kind: updates.kind ?? existing.kind ?? 'normal',
    stock: updates.stock ?? existing.stock
  };

  const normalizedKind = next.kind === 'stock' ? 'stock' : 'normal';
  const normalizedStock = normalizedKind === 'stock' ? normalizeStock(next.stock) : null;
  const stockDb = stockToDb(normalizedStock);

  db.prepare(
    `
      UPDATE keywords
      SET text = ?, aliases = ?, frequency_minutes = ?, enabled = ?, kind = ?,
        stock_symbol = ?, stock_name = ?, stock_exchange = ?, stock_market = ?, stock_currency = ?
      WHERE id = ?
    `
  ).run(
    next.text,
    serializeAliases(next.aliases),
    next.frequencyMinutes,
    next.enabled ? 1 : 0,
    normalizedKind,
    stockDb.symbol,
    stockDb.name,
    stockDb.exchange,
    stockDb.market,
    stockDb.currency,
    id
  );

  return getKeyword(id);
};

export const deleteKeyword = (id) => {
  db.prepare('DELETE FROM folder_keywords WHERE keyword_id = ?').run(id);
  db.prepare('DELETE FROM keyword_articles WHERE keyword_id = ?').run(id);
  db.prepare('DELETE FROM keywords WHERE id = ?').run(id);
};

export const updateKeywordLastChecked = (id) => {
  db.prepare('UPDATE keywords SET last_checked_at = ? WHERE id = ?').run(new Date().toISOString(), id);
};

export const listArticlesForKeyword = (keywordId) => {
  const rows = db.prepare(
    `
      SELECT a.*, ka.score as relevanceScore
      FROM keyword_articles ka
      JOIN articles a ON a.id = ka.article_id
      WHERE ka.keyword_id = ? AND ka.irrelevant = 0
      ORDER BY a.publish_time DESC
    `
  ).all(keywordId);

  return rows.map(toArticle);
};

export const listArticlesForFolder = (folderId) => {
  const rows = db.prepare(
    `
      SELECT a.*, MAX(ka.score) as relevanceScore
      FROM folder_keywords fk
      JOIN keyword_articles ka ON ka.keyword_id = fk.keyword_id
      JOIN articles a ON a.id = ka.article_id
      WHERE fk.folder_id = ? AND ka.irrelevant = 0
      GROUP BY a.id
      ORDER BY a.publish_time DESC
    `
  ).all(folderId);

  return rows.map(toArticle);
};

export const getArticle = (id) => {
  const row = db.prepare('SELECT * FROM articles WHERE id = ?').get(id);
  return row ? toArticle({ ...row, relevanceScore: row.relevanceScore ?? 0 }) : null;
};

export const markIrrelevant = (keywordId, articleId) => {
  db.prepare(
    'UPDATE keyword_articles SET irrelevant = 1 WHERE keyword_id = ? AND article_id = ?'
  ).run(keywordId, articleId);
};

export const upsertArticle = ({ title, summary, url, source, publishTime, content }) => {
  const existing = db.prepare('SELECT id FROM articles WHERE url = ?').get(url);
  if (existing) {
    db.prepare(
      'UPDATE articles SET title = ?, summary = ?, source = ?, publish_time = ?, content = ? WHERE id = ?'
    ).run(title, summary, source, publishTime, content, existing.id);
    return existing.id;
  }

  const id = crypto.randomUUID();
  db.prepare(
    'INSERT INTO articles (id, title, summary, url, source, publish_time, content) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(id, title, summary, url, source, publishTime, content);
  return id;
};

export const linkKeywordArticle = ({ keywordId, articleId, score }) => {
  db.prepare(
    `
      INSERT INTO keyword_articles (keyword_id, article_id, score, irrelevant)
      VALUES (?, ?, ?, 0)
      ON CONFLICT(keyword_id, article_id) DO UPDATE SET
        score = CASE
          WHEN excluded.score > keyword_articles.score THEN excluded.score
          ELSE keyword_articles.score
        END
    `
  ).run(keywordId, articleId, score);
};

export const getKeywordLastChecked = (id) => {
  const row = db.prepare('SELECT last_checked_at FROM keywords WHERE id = ?').get(id);
  return row?.last_checked_at ?? null;
};
