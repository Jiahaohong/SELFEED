import type {
  Article,
  ChannelMetadata,
  Folder,
  FolderKeywordLink,
  Keyword,
  SourceConfig,
  SourceDemoResponse,
  SourceStatus,
  StockQuote
} from '../types';

const API_BASE = import.meta.env.VITE_API_URL
  ?? (window.location.protocol === 'file:' ? 'http://localhost:8787' : '');

const DEFAULT_TIMEOUT_MS = 10000;

const requestJson = async <T>(
  path: string,
  options: RequestInit = {},
  requestOptions: {
    timeoutMs?: number;
    signal?: AbortSignal;
  } = {},
): Promise<T> => {
  const timeoutMs = requestOptions.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const timeoutController = new AbortController();
  let didTimeout = false;
  const timeout = window.setTimeout(() => {
    didTimeout = true;
    timeoutController.abort();
  }, timeoutMs);
  const externalSignal = requestOptions.signal;
  const anySignal = (AbortSignal as typeof AbortSignal & { any?: (signals: AbortSignal[]) => AbortSignal }).any;
  const signal = externalSignal
    ? anySignal?.([timeoutController.signal, externalSignal]) ?? timeoutController.signal
    : timeoutController.signal;
  let detachExternalAbort: (() => void) | null = null;
  if (externalSignal && !anySignal) {
    const handleAbort = () => timeoutController.abort();
    externalSignal.addEventListener('abort', handleAbort, { once: true });
    detachExternalAbort = () => externalSignal.removeEventListener('abort', handleAbort);
  }

  try {
    const response = await fetch(`${API_BASE}${path}`, {
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {})
      },
      signal,
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
      if (didTimeout) {
        throw new Error('Request timeout');
      }
      if (externalSignal?.aborted) {
        throw new Error('Request aborted');
      }
      throw new Error('Request aborted');
    }
    throw error;
  } finally {
    detachExternalAbort?.();
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
  refreshKeyword: (id: string, signal?: AbortSignal) =>
    requestJson<{ matched: number; sources: number }>(`/api/keywords/${id}/refresh`, {
      method: 'POST'
    }, { timeoutMs: 65000, signal }),
  getStockQuote: (id: string, source: 'auto' | 'stock-api' = 'auto', signal?: AbortSignal) =>
    requestJson<StockQuote>(`/api/keywords/${id}/stock-quote?source=${encodeURIComponent(source)}`, {}, { timeoutMs: 25000, signal }),
  getChannelMetadata: () => requestJson<ChannelMetadata[]>('/api/channels/metadata'),
  runChannelDemo: (channelName: string, query: string) =>
    requestJson<SourceDemoResponse>(`/api/demo/channel/${encodeURIComponent(channelName)}`, {
      method: 'POST',
      body: JSON.stringify({ query })
    }, { timeoutMs: 30000 }),
  getSources: () => requestJson<SourceConfig[]>('/api/sources'),
  getSourcesStatus: () => requestJson<SourceStatus[]>('/api/sources/status', {}, { timeoutMs: 30000 }),
  getSourceStatus: (id: string) => requestJson<SourceStatus>(`/api/sources/${id}/status`, {}, { timeoutMs: 30000 }),
  updateSource: (id: string, payload: Partial<SourceConfig>) =>
    requestJson<SourceConfig>(`/api/sources/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload)
    }),
  runRssDemo: (query: string) =>
    requestJson<SourceDemoResponse>('/api/demo/rss', {
      method: 'POST',
      body: JSON.stringify({ query })
    }, { timeoutMs: 30000 }),
  runExchangeDemo: (query: string) =>
    requestJson<SourceDemoResponse>('/api/demo/exchange', {
      method: 'POST',
      body: JSON.stringify({ query })
    }, { timeoutMs: 30000 }),
  runWebDemo: (query: string) =>
    requestJson<SourceDemoResponse>('/api/demo/web', {
      method: 'POST',
      body: JSON.stringify({ query })
    }, { timeoutMs: 30000 }),
  runStockApiDemo: (query: string) =>
    requestJson<SourceDemoResponse>('/api/demo/stock-api', {
      method: 'POST',
      body: JSON.stringify({ query })
    }, { timeoutMs: 30000 }),
  refreshFolder: (id: string, signal?: AbortSignal) =>
    requestJson<{ matched: number; sources: number }>(`/api/folders/${id}/refresh`, {
      method: 'POST'
    }, { timeoutMs: 90000, signal }),
  getArticles: (keywordId: string, signal?: AbortSignal) =>
    requestJson<Article[]>(`/api/articles?keywordId=${encodeURIComponent(keywordId)}`, {}, { signal }),
  getFolderArticles: (folderId: string, signal?: AbortSignal) =>
    requestJson<Article[]>(`/api/articles?folderId=${encodeURIComponent(folderId)}`, {}, { signal }),
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
