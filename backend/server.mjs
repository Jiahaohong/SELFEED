import express from 'express';
import cors from 'cors';
import {
  createKeyword,
  createFolder,
  deleteKeyword,
  deleteFolder,
  getArticle,
  getFolder,
  getKeyword,
  listArticlesForFolder,
  listArticlesForKeyword,
  listFolders,
  listFolderLinks,
  listKeywordsForFolder,
  addKeywordToFolder,
  removeKeywordFromFolder,
  listKeywords,
  markIrrelevant,
  updateFolder,
  updateKeyword
} from './store.mjs';
import { refreshDueKeywords, refreshKeyword } from './search.mjs';
import { getMockStockQuote } from './stockQuote.mjs';

const app = express();
const port = Number(process.env.PORT || 8787);

app.use(cors());
app.use(express.json());

app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

app.get('/api/keywords', (_req, res) => {
  res.json(listKeywords());
});

app.get('/api/folders', (_req, res) => {
  res.json(listFolders());
});

app.get('/api/folder-links', (_req, res) => {
  res.json(listFolderLinks());
});

app.post('/api/folders', (req, res) => {
  const { name } = req.body || {};
  if (!name) {
    res.status(400).send('Folder name is required');
    return;
  }
  const folder = createFolder({ name });
  res.status(201).json(folder);
});

app.post('/api/folders/:id/keywords', (req, res) => {
  const folder = getFolder(req.params.id);
  if (!folder) {
    res.status(404).send('Folder not found');
    return;
  }
  const { keywordId } = req.body || {};
  if (!keywordId) {
    res.status(400).send('keywordId is required');
    return;
  }
  const keyword = getKeyword(keywordId);
  if (!keyword) {
    res.status(404).send('Keyword not found');
    return;
  }
  addKeywordToFolder(folder.id, keywordId);
  res.status(204).end();
});

app.delete('/api/folders/:id/keywords/:keywordId', (req, res) => {
  const folder = getFolder(req.params.id);
  if (!folder) {
    res.status(404).send('Folder not found');
    return;
  }
  removeKeywordFromFolder(folder.id, req.params.keywordId);
  res.status(204).end();
});

app.patch('/api/folders/:id', (req, res) => {
  const folder = updateFolder(req.params.id, req.body || {});
  if (!folder) {
    res.status(404).send('Folder not found');
    return;
  }
  res.json(folder);
});

app.delete('/api/folders/:id', (req, res) => {
  const folder = getFolder(req.params.id);
  if (!folder) {
    res.status(404).send('Folder not found');
    return;
  }
  deleteFolder(req.params.id);
  res.status(204).end();
});

app.post('/api/keywords', (req, res) => {
  const { text, aliases, frequencyMinutes, enabled, kind, stock } = req.body || {};
  if (!text) {
    res.status(400).send('Keyword text is required');
    return;
  }
  const keyword = createKeyword({ text, aliases, frequencyMinutes, enabled, kind, stock });
  res.status(201).json(keyword);
});

app.patch('/api/keywords/:id', (req, res) => {
  const keyword = updateKeyword(req.params.id, req.body || {});
  if (!keyword) {
    res.status(404).send('Keyword not found');
    return;
  }
  res.json(keyword);
});

app.delete('/api/keywords/:id', (req, res) => {
  const keyword = getKeyword(req.params.id);
  if (!keyword) {
    res.status(404).send('Keyword not found');
    return;
  }
  deleteKeyword(req.params.id);
  res.status(204).end();
});

app.post('/api/keywords/:id/refresh', async (req, res) => {
  const keyword = getKeyword(req.params.id);
  if (!keyword) {
    res.status(404).send('Keyword not found');
    return;
  }

  const result = await refreshKeyword(req.params.id);
  res.json(result);
});

app.get('/api/keywords/:id/stock-quote', (req, res) => {
  const keyword = getKeyword(req.params.id);
  if (!keyword) {
    res.status(404).send('Keyword not found');
    return;
  }
  if (keyword.kind !== 'stock') {
    res.status(400).send('Keyword is not a stock');
    return;
  }
  const quote = getMockStockQuote(keyword);
  res.json(quote);
});

app.get('/api/articles', (req, res) => {
  const keywordId = req.query.keywordId;
  const folderId = req.query.folderId;
  if (folderId && typeof folderId === 'string') {
    res.json(listArticlesForFolder(folderId));
    return;
  }
  if (keywordId && typeof keywordId === 'string') {
    res.json(listArticlesForKeyword(keywordId));
    return;
  }
  res.status(400).send('keywordId or folderId is required');
});

app.get('/api/articles/:id', (req, res) => {
  const article = getArticle(req.params.id);
  if (!article) {
    res.status(404).send('Article not found');
    return;
  }
  res.json(article);
});

app.post('/api/articles/:id/irrelevant', (req, res) => {
  const { keywordId } = req.body || {};
  if (!keywordId) {
    res.status(400).send('keywordId is required');
    return;
  }
  markIrrelevant(keywordId, req.params.id);
  res.status(204).end();
});

app.post('/api/folders/:id/refresh', async (req, res) => {
  const folder = getFolder(req.params.id);
  if (!folder) {
    res.status(404).send('Folder not found');
    return;
  }
  const keywords = listKeywordsForFolder(folder.id);
  let matched = 0;
  for (const keyword of keywords) {
    const result = await refreshKeyword(keyword.id);
    matched += result.matched;
  }
  res.json({ matched, sources: keywords.length });
});

app.post('/api/folders/:id/articles/:articleId/irrelevant', (req, res) => {
  const folder = getFolder(req.params.id);
  if (!folder) {
    res.status(404).send('Folder not found');
    return;
  }
  const keywords = listKeywordsForFolder(folder.id);
  keywords.forEach(keyword => {
    markIrrelevant(keyword.id, req.params.articleId);
  });
  res.status(204).end();
});

app.listen(port, () => {
  console.log(`Selfeed backend listening on ${port}`);
});

const seedKeywords = () => {
  if (listKeywords().length > 0) return;
  createKeyword({
    text: 'Gold',
    aliases: ['gold', 'XAU'],
    frequencyMinutes: 360,
    enabled: true
  });
};

seedKeywords();

const scheduleIntervalMs = 60 * 1000;

setInterval(() => {
  refreshDueKeywords().catch((error) => {
    console.error('Scheduled refresh failed', error);
  });
}, scheduleIntervalMs);
