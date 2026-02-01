import type { Article, Folder, FolderKeywordLink, Keyword, StockQuote } from '../types';

const API_BASE = import.meta.env.VITE_API_URL
  ?? (window.location.protocol === 'file:' ? 'http://localhost:8787' : '');

const DEFAULT_TIMEOUT_MS = 10000;

const requestJson = async <T>(
  path: string,
  options: RequestInit = {},
  timeoutMs: number = DEFAULT_TIMEOUT_MS
): Promise<T> => {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${API_BASE}${path}`, {
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {})
      },
      signal: controller.signal,
      ...options
    });

    if (!response.ok) {
      const message = await response.text();
      throw new Error(message || `Request failed: ${response.status}`);
    }

    if (response.status === 204) {
      return undefined as T;
    }

    return response.json() as Promise<T>;
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error('Request timeout');
    }
    throw error;
  } finally {
    window.clearTimeout(timeout);
  }
};

export const api = {
  getKeywords: () => requestJson<Keyword[]>('/api/keywords'),
  getFolders: () => requestJson<Folder[]>('/api/folders'),
  getFolderLinks: () => requestJson<FolderKeywordLink[]>('/api/folder-links'),
  createFolder: (payload: Partial<Folder>) =>
    requestJson<Folder>('/api/folders', {
      method: 'POST',
      body: JSON.stringify(payload)
    }),
  updateFolder: (id: string, payload: Partial<Folder>) =>
    requestJson<Folder>(`/api/folders/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload)
    }),
  deleteFolder: (id: string) =>
    requestJson<void>(`/api/folders/${id}`, {
      method: 'DELETE'
    }),
  linkKeywordToFolder: (folderId: string, keywordId: string) =>
    requestJson<void>(`/api/folders/${folderId}/keywords`, {
      method: 'POST',
      body: JSON.stringify({ keywordId })
    }),
  unlinkKeywordFromFolder: (folderId: string, keywordId: string) =>
    requestJson<void>(`/api/folders/${folderId}/keywords/${keywordId}`, {
      method: 'DELETE'
    }),
  createKeyword: (payload: Partial<Keyword>) =>
    requestJson<Keyword>('/api/keywords', {
      method: 'POST',
      body: JSON.stringify(payload)
    }),
  updateKeyword: (id: string, payload: Partial<Keyword>) =>
    requestJson<Keyword>(`/api/keywords/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload)
    }),
  deleteKeyword: (id: string) =>
    requestJson<void>(`/api/keywords/${id}`, {
      method: 'DELETE'
    }),
  refreshKeyword: (id: string) =>
    requestJson<{ matched: number; sources: number }>(`/api/keywords/${id}/refresh`, {
      method: 'POST'
    }),
  getStockQuote: (id: string) =>
    requestJson<StockQuote>(`/api/keywords/${id}/stock-quote`),
  refreshFolder: (id: string) =>
    requestJson<{ matched: number; sources: number }>(`/api/folders/${id}/refresh`, {
      method: 'POST'
    }),
  getArticles: (keywordId: string) =>
    requestJson<Article[]>(`/api/articles?keywordId=${encodeURIComponent(keywordId)}`),
  getFolderArticles: (folderId: string) =>
    requestJson<Article[]>(`/api/articles?folderId=${encodeURIComponent(folderId)}`),
  getArticle: (articleId: string) => requestJson<Article>(`/api/articles/${articleId}`),
  markIrrelevant: (keywordId: string, articleId: string) =>
    requestJson<void>(`/api/articles/${articleId}/irrelevant`, {
      method: 'POST',
      body: JSON.stringify({ keywordId })
    }),
  markIrrelevantForFolder: (folderId: string, articleId: string) =>
    requestJson<void>(`/api/folders/${folderId}/articles/${articleId}/irrelevant`, {
      method: 'POST'
    })
};
