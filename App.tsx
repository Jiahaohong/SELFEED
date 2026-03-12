import React, { useEffect, useMemo, useRef, useState } from 'react';
import { X } from 'lucide-react';
import SidebarFolders from './components/SidebarFolders';
import SidebarNotes from './components/SidebarNotes';
import MainEditor from './components/MainEditor';
import {
  Article,
  ChannelMetadata,
  Folder,
  FolderKeywordLink,
  Keyword,
  SourceDemoResponse,
  SourceStatus,
  StockQuote
} from './types';
import { api } from './services/api';

type DemoSectionId = 'rss' | 'stock-api' | 'web';
type SourcePanelTabId = DemoSectionId | 'settings';

const DEMO_SECTIONS: Array<{
  id: DemoSectionId;
  title: string;
  hint: string;
  placeholder: string;
  channelCandidates: string[];
}> = [
  {
    id: 'rss',
    title: 'RSS信息源demo',
    hint: '用于测试各个RSS信息源的检索流程',
    placeholder: '输入关键词，例如 医疗 或 政策',
    channelCandidates: ['news_rss_channel']
  },
  {
    id: 'stock-api',
    title: '股票API信息源demo',
    hint: '用于测试各个股票API信息源的检索流程',
    placeholder: '输入股票代码，例如 600690',
    channelCandidates: ['stock_price_api', 'stock-api']
  },
  {
    id: 'web',
    title: '网页爬取信息源demo',
    hint: '用于测试各个网页爬取信息源的检索流程',
    placeholder: '输入关键词，例如 政策 或 监管',
    channelCandidates: ['macro_policy_scraper']
  }
];

const SOURCE_PANEL_TABS: Array<{ id: SourcePanelTabId; title: string }> = [
  { id: 'rss', title: 'RSS信息源' },
  { id: 'stock-api', title: '股票API信息源' },
  { id: 'web', title: '网页爬取信息源' },
  { id: 'settings', title: '设置' }
];

const App: React.FC = () => {
  const AUTO_REFRESH_SETTINGS_STORAGE_KEY = 'selfeed.autoRefreshSettings';
  const SOURCE_STATUS_STORAGE_KEY = 'selfeed.sourceStatuses';
  const [folders, setFolders] = useState<Folder[]>([]);
  const [folderLinks, setFolderLinks] = useState<FolderKeywordLink[]>([]);
  const [keywords, setKeywords] = useState<Keyword[]>([]);
  const [selection, setSelection] = useState<
    | { kind: 'folder'; id: string }
    | { kind: 'keyword-folder'; id: string }
    | { kind: 'keyword-global'; id: string }
    | null
  >(null);
  const [articles, setArticles] = useState<Article[]>([]);
  const [selectedArticleId, setSelectedArticleId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [stockQuote, setStockQuote] = useState<StockQuote | null>(null);
  const [isStockQuoteLoading, setIsStockQuoteLoading] = useState(false);
  const [isStockDialogOpen, setIsStockDialogOpen] = useState(false);
  const [stockDialogMode, setStockDialogMode] = useState<'create' | 'edit'>('create');
  const [stockEditingKeywordId, setStockEditingKeywordId] = useState<string | null>(null);
  const [isSourcesDialogOpen, setIsSourcesDialogOpen] = useState(false);
  const [sourceStatuses, setSourceStatuses] = useState<SourceStatus[]>([]);
  const [isSourceStatusLoading, setIsSourceStatusLoading] = useState(false);
  const [sourceStatusError, setSourceStatusError] = useState('');
  const [activeSourcePanelTab, setActiveSourcePanelTab] = useState<SourcePanelTabId>('rss');
  const [demoChannels, setDemoChannels] = useState<ChannelMetadata[]>([]);
  const [demoQueries, setDemoQueries] = useState<Record<DemoSectionId, string>>({
    rss: '',
    'stock-api': '',
    web: ''
  });
  const [demoResponses, setDemoResponses] = useState<Partial<Record<DemoSectionId, SourceDemoResponse>>>({});
  const [demoLoadingSection, setDemoLoadingSection] = useState<DemoSectionId | null>(null);
  const [autoRefreshSettings, setAutoRefreshSettings] = useState(() => {
    try {
      const raw = localStorage.getItem(AUTO_REFRESH_SETTINGS_STORAGE_KEY);
      if (!raw) {
        return {
          onAppOpen: true,
          onKeywordOpen: true
        };
      }
      const parsed = JSON.parse(raw);
      return {
        onAppOpen: parsed?.onAppOpen !== false,
        onKeywordOpen: parsed?.onKeywordOpen !== false
      };
    } catch {
      return {
        onAppOpen: true,
        onKeywordOpen: true
      };
    }
  });
  const [stockDraft, setStockDraft] = useState({
    symbol: '',
    name: '',
    exchange: ''
  });
  const [stockDraftError, setStockDraftError] = useState('');
  const [stockDraftFolderId, setStockDraftFolderId] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const dragStateRef = useRef<{
    type: 'left' | 'middle' | null;
    startX: number;
    startLeft: number;
    startMiddle: number;
  }>({
    type: null,
    startX: 0,
    startLeft: 0,
    startMiddle: 0
  });
  const [leftWidth, setLeftWidth] = useState(260);
  const [middleWidth, setMiddleWidth] = useState(340);
  const leftWidthRef = useRef(leftWidth);
  const middleWidthRef = useRef(middleWidth);
  const autoRefreshSettingsRef = useRef(autoRefreshSettings);
  const hasHandledInitialKeywordSelectionRef = useRef(false);
  const articleLoadSeqRef = useRef(0);
  const stockLoadSeqRef = useRef(0);
  const refreshSeqRef = useRef(0);
  const articleRequestControllerRef = useRef<AbortController | null>(null);
  const stockRequestControllerRef = useRef<AbortController | null>(null);
  const refreshRequestControllerRef = useRef<AbortController | null>(null);
  const keywordAutoRefreshAtRef = useRef<Map<string, number>>(new Map());
  const [isDesktop, setIsDesktop] = useState(true);
  const selectedFolderId = selection?.kind === 'folder' ? selection.id : null;
  const selectedKeywordId = selection && selection.kind !== 'folder' ? selection.id : null;
  const canRefresh = Boolean(selectedKeywordId || selectedFolderId);
  const MIN_LEFT = 200;
  const MIN_MIDDLE = 260;
  const MIN_RIGHT = 320;
  const STOCK_CARD_REFRESH_INTERVAL_MS = Number(
    import.meta.env.VITE_STOCK_CARD_REFRESH_INTERVAL_MS ?? 15000
  );

  const selectedArticle = useMemo(
    () => articles.find(article => article.id === selectedArticleId) || null,
    [articles, selectedArticleId]
  );

  const selectedKeyword = useMemo(
    () => keywords.find(keyword => keyword.id === selectedKeywordId) || null,
    [keywords, selectedKeywordId]
  );
  const showStockCard = Boolean(selectedKeyword && selectedKeyword.kind === 'stock' && !selectedFolderId);

  useEffect(() => {
    leftWidthRef.current = leftWidth;
  }, [leftWidth]);

  useEffect(() => {
    middleWidthRef.current = middleWidth;
  }, [middleWidth]);

  useEffect(() => {
    autoRefreshSettingsRef.current = autoRefreshSettings;
  }, [autoRefreshSettings]);

  useEffect(() => {
    const media = window.matchMedia('(min-width: 768px)');
    const handleChange = () => setIsDesktop(media.matches);
    handleChange();
    media.addEventListener('change', handleChange);
    return () => media.removeEventListener('change', handleChange);
  }, []);

  const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

  const getContainerWidth = () => containerRef.current?.getBoundingClientRect().width ?? 0;

  const stopDragging = () => {
    if (!dragStateRef.current.type) return;
    dragStateRef.current.type = null;
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  };

  const startDragging = (type: 'left' | 'middle', event: React.MouseEvent<HTMLDivElement>) => {
    if (!isDesktop) return;
    event.preventDefault();
    dragStateRef.current = {
      type,
      startX: event.clientX,
      startLeft: leftWidthRef.current,
      startMiddle: middleWidthRef.current
    };
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  };

  useEffect(() => {
    if (!isDesktop) return;
    const handleMove = (event: MouseEvent) => {
      const dragState = dragStateRef.current;
      if (!dragState.type) return;
      const containerWidth = getContainerWidth();
      if (!containerWidth) return;
      const delta = event.clientX - dragState.startX;

      if (dragState.type === 'left') {
        const maxLeft = Math.max(MIN_LEFT, containerWidth - MIN_MIDDLE - MIN_RIGHT);
        const nextLeft = clamp(dragState.startLeft + delta, MIN_LEFT, maxLeft);
        const maxMiddle = Math.max(MIN_MIDDLE, containerWidth - MIN_RIGHT - nextLeft);
        const nextMiddle = Math.min(dragState.startMiddle, maxMiddle);
        if (nextLeft !== leftWidthRef.current) {
          setLeftWidth(nextLeft);
        }
        if (nextMiddle !== middleWidthRef.current) {
          setMiddleWidth(nextMiddle);
        }
        return;
      }

      const maxMiddle = Math.max(MIN_MIDDLE, containerWidth - MIN_RIGHT - leftWidthRef.current);
      const nextMiddle = clamp(dragState.startMiddle + delta, MIN_MIDDLE, maxMiddle);
      if (nextMiddle !== middleWidthRef.current) {
        setMiddleWidth(nextMiddle);
      }
    };

    const handleUp = () => stopDragging();
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
      stopDragging();
    };
  }, [isDesktop]);

  useEffect(() => () => {
    articleRequestControllerRef.current?.abort();
    stockRequestControllerRef.current?.abort();
    refreshRequestControllerRef.current?.abort();
  }, []);

  const isAbortError = (error: unknown) => {
    const message = error instanceof Error ? error.message : String(error || '');
    return message === 'Request aborted';
  };

  useEffect(() => {
    if (!isDesktop) return;
    const handleResize = () => {
      const containerWidth = getContainerWidth();
      if (!containerWidth) return;
      const maxLeft = Math.max(MIN_LEFT, containerWidth - MIN_MIDDLE - MIN_RIGHT);
      const nextLeft = clamp(leftWidthRef.current, MIN_LEFT, maxLeft);
      const maxMiddle = Math.max(MIN_MIDDLE, containerWidth - MIN_RIGHT - nextLeft);
      const nextMiddle = clamp(middleWidthRef.current, MIN_MIDDLE, maxMiddle);
      if (nextLeft !== leftWidthRef.current) {
        setLeftWidth(nextLeft);
      }
      if (nextMiddle !== middleWidthRef.current) {
        setMiddleWidth(nextMiddle);
      }
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [isDesktop]);

  const loadFolders = async () => {
    try {
      const data = await api.getFolders();
      setFolders(data);
    } catch (error) {
      console.error('Failed to load folders', error);
    }
  };

  const loadFolderLinks = async () => {
    try {
      const data = await api.getFolderLinks();
      setFolderLinks(data);
    } catch (error) {
      console.error('Failed to load folder links', error);
    }
  };

  const loadKeywords = async () => {
    try {
      const data = await api.getKeywords();
      setKeywords(data);
    } catch (error) {
      console.error('Failed to load keywords', error);
    }
  };

  const loadArticles = async (keywordId: string) => {
    const seq = ++articleLoadSeqRef.current;
    articleRequestControllerRef.current?.abort();
    const controller = new AbortController();
    articleRequestControllerRef.current = controller;
    try {
      const data = await api.getArticles(keywordId, controller.signal);
      if (seq !== articleLoadSeqRef.current) return;
      setArticles(data);
      setSelectedArticleId(prev => (data.some(item => item.id === prev) ? prev : null));
    } catch (error) {
      if (seq !== articleLoadSeqRef.current) return;
      if (isAbortError(error)) return;
      console.error('Failed to load articles', error);
      setArticles([]);
      setSelectedArticleId(null);
    }
  };

  const loadArticlesForFolder = async (folderId: string) => {
    const seq = ++articleLoadSeqRef.current;
    articleRequestControllerRef.current?.abort();
    const controller = new AbortController();
    articleRequestControllerRef.current = controller;
    try {
      const data = await api.getFolderArticles(folderId, controller.signal);
      if (seq !== articleLoadSeqRef.current) return;
      setArticles(data);
      setSelectedArticleId(prev => (data.some(item => item.id === prev) ? prev : null));
    } catch (error) {
      if (seq !== articleLoadSeqRef.current) return;
      if (isAbortError(error)) return;
      console.error('Failed to load folder articles', error);
      setArticles([]);
      setSelectedArticleId(null);
    }
  };

  const loadStockQuote = async (keyword: Keyword) => {
    const seq = ++stockLoadSeqRef.current;
    stockRequestControllerRef.current?.abort();
    const controller = new AbortController();
    stockRequestControllerRef.current = controller;
    if (keyword.kind !== 'stock') {
      if (seq !== stockLoadSeqRef.current) return;
      setStockQuote(null);
      setIsStockQuoteLoading(false);
      return;
    }
    setIsStockQuoteLoading(true);
    try {
      const quote = await api.getStockQuote(keyword.id, 'auto', controller.signal);
      if (seq !== stockLoadSeqRef.current) return;
      setStockQuote(quote);
    } catch (error) {
      if (seq !== stockLoadSeqRef.current) return;
      if (isAbortError(error)) return;
      console.error('Failed to load stock quote', error);
      setStockQuote(null);
    } finally {
      if (seq !== stockLoadSeqRef.current) return;
      setIsStockQuoteLoading(false);
    }
  };

  useEffect(() => {
    loadFolders();
    loadFolderLinks();
    loadKeywords();
  }, []);

  useEffect(() => {
    if (selectedFolderId) {
      articleLoadSeqRef.current += 1;
      stockLoadSeqRef.current += 1;
      refreshSeqRef.current += 1;
      articleRequestControllerRef.current?.abort();
      stockRequestControllerRef.current?.abort();
      refreshRequestControllerRef.current?.abort();
      loadArticlesForFolder(selectedFolderId);
      setStockQuote(null);
      setIsStockQuoteLoading(false);
      setIsRefreshing(false);
      return;
    }
    if (!selectedKeywordId) {
      articleLoadSeqRef.current += 1;
      stockLoadSeqRef.current += 1;
      refreshSeqRef.current += 1;
      articleRequestControllerRef.current?.abort();
      stockRequestControllerRef.current?.abort();
      refreshRequestControllerRef.current?.abort();
      setArticles([]);
      setSelectedArticleId(null);
      setStockQuote(null);
      setIsStockQuoteLoading(false);
      setIsRefreshing(false);
      return;
    }
    loadArticles(selectedKeywordId);
  }, [selectedKeywordId, selectedFolderId]);

  useEffect(() => {
    if (!selectedKeyword || selectedFolderId) {
      setStockQuote(null);
      setIsStockQuoteLoading(false);
      return;
    }
    loadStockQuote(selectedKeyword);
  }, [selectedKeyword, selectedFolderId]);

  useEffect(() => {
    if (!selectedKeyword || selectedKeyword.kind !== 'stock' || selectedFolderId) {
      return;
    }
    const timer = window.setInterval(() => {
      loadStockQuote(selectedKeyword);
    }, STOCK_CARD_REFRESH_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [selectedKeyword, selectedFolderId, STOCK_CARD_REFRESH_INTERVAL_MS]);

  useEffect(() => {
    if (!selectedKeywordId || selectedFolderId) return;
    const isInitialSelection = !hasHandledInitialKeywordSelectionRef.current;
    hasHandledInitialKeywordSelectionRef.current = true;
    const shouldAutoRefresh = isInitialSelection
      ? autoRefreshSettingsRef.current.onAppOpen
      : autoRefreshSettingsRef.current.onKeywordOpen;
    if (!shouldAutoRefresh) {
      refreshSeqRef.current += 1;
      refreshRequestControllerRef.current?.abort();
      setIsRefreshing(false);
      return;
    }
    const now = Date.now();
    const lastRefreshedAt = keywordAutoRefreshAtRef.current.get(selectedKeywordId) || 0;
    if (now - lastRefreshedAt < 60 * 1000) {
      setIsRefreshing(false);
      return;
    }
    keywordAutoRefreshAtRef.current.set(selectedKeywordId, now);
    let cancelled = false;
    const refreshSeq = ++refreshSeqRef.current;
    refreshRequestControllerRef.current?.abort();
    const controller = new AbortController();
    refreshRequestControllerRef.current = controller;

    const autoRefreshKeyword = async () => {
      setIsRefreshing(true);
      try {
        await api.refreshKeyword(selectedKeywordId, controller.signal);
        if (cancelled || refreshSeq !== refreshSeqRef.current) return;
        await loadArticles(selectedKeywordId);
      } catch (error) {
        if (isAbortError(error)) return;
        if (!cancelled && refreshSeq === refreshSeqRef.current) {
          console.error('Failed to auto refresh keyword', error);
        }
      } finally {
        if (!cancelled && refreshSeq === refreshSeqRef.current) {
          setIsRefreshing(false);
        }
      }
    };

    autoRefreshKeyword();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [selectedKeywordId, selectedFolderId]);

  const handleAddKeyword = async (folderId?: string | null) => {
    try {
      const created = await api.createKeyword({
        text: '新关键词',
        aliases: [],
        frequencyMinutes: 360,
        enabled: true
      });
      setKeywords(prev => [...prev, created]);
      setSelection({ kind: folderId ? 'keyword-folder' : 'keyword-global', id: created.id });
      if (folderId) {
        await api.linkKeywordToFolder(folderId, created.id);
        setFolderLinks(prev => [...prev, { folderId, keywordId: created.id }]);
      }
    } catch (error) {
      console.error('Failed to create keyword', error);
    }
  };

  const openStockDialog = (folderId?: string | null) => {
    setStockDialogMode('create');
    setStockEditingKeywordId(null);
    setStockDraftFolderId(folderId ?? null);
    setStockDraft({ symbol: '', name: '', exchange: '' });
    setStockDraftError('');
    setIsStockDialogOpen(true);
  };

  const persistSourceStatuses = (data: SourceStatus[]) => {
    try {
      localStorage.setItem(SOURCE_STATUS_STORAGE_KEY, JSON.stringify(data));
    } catch {
      // ignore storage errors
    }
  };

  const loadCachedSourceStatuses = () => {
    try {
      const raw = localStorage.getItem(SOURCE_STATUS_STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      const allowedStatus = new Set(['ok', 'error', 'disabled', 'unknown', 'checking']);
      return parsed
        .filter(item => item && typeof item.id === 'string' && typeof item.url === 'string')
        .map(item => ({
          id: String(item.id),
          name: String(item.name || ''),
          url: String(item.url || ''),
          channelName: String(item.channelName || ''),
          enabled: item.enabled !== false,
          status: allowedStatus.has(String(item.status || '')) ? item.status : 'unknown',
          message: typeof item.message === 'string' ? item.message : '',
          checkedUrl: typeof item.checkedUrl === 'string' ? item.checkedUrl : '',
          checkedAt: typeof item.checkedAt === 'string' ? item.checkedAt : new Date().toISOString()
        })) as SourceStatus[];
    } catch {
      return [];
    }
  };

  const updateSourceStatuses = (updater: (prev: SourceStatus[]) => SourceStatus[]) => {
    setSourceStatuses(prev => {
      const next = updater(prev);
      persistSourceStatuses(next);
      return next;
    });
  };

  const loadSourcesList = async () => {
    setIsSourceStatusLoading(true);
    setSourceStatusError('');
    try {
      const data = await api.getSources();
      data.sort((a, b) => a.name.localeCompare(b.name));
      const now = new Date().toISOString();
      const cached = loadCachedSourceStatuses();
      const cachedMap = new Map(cached.map(item => [item.id, item]));
      const next = data.map(item => {
        const cachedItem = cachedMap.get(item.id);
        const isEnabled = item.enabled !== false;
        const cachedStatus = cachedItem?.status === 'checking' ? 'unknown' : cachedItem?.status;
        const status = cachedStatus || 'unknown';
        return {
          id: item.id,
          name: item.name,
          url: item.url,
          channelName: String(item.channelName || cachedItem?.channelName || ''),
          enabled: isEnabled,
          status,
          checkedAt: cachedItem?.checkedAt || now,
          message: cachedItem?.message,
          checkedUrl: cachedItem?.checkedUrl
        } as SourceStatus;
      });
      setSourceStatuses(next);
      persistSourceStatuses(next);

      const newlyAdded = next.filter(item => !cachedMap.has(item.id));
      if (newlyAdded.length > 0) {
        updateSourceStatuses(prev =>
          prev.map(item => (
            newlyAdded.some(candidate => candidate.id === item.id)
              ? { ...item, status: 'checking' }
              : item
          ))
        );

        const probeResults = await Promise.all(
          newlyAdded.map(async (item) => {
            try {
              const status = await api.getSourceStatus(item.id);
              if (status.status === 'ok') {
                await api.updateSource(item.id, { enabled: true });
                return {
                  ...status,
                  enabled: true
                } as SourceStatus;
              }
              await api.updateSource(item.id, { enabled: false });
              return {
                ...status,
                enabled: false
              } as SourceStatus;
            } catch (error) {
              return {
                ...item,
                enabled: false,
                status: 'error',
                message: error instanceof Error ? error.message : String(error),
                checkedAt: new Date().toISOString()
              } as SourceStatus;
            }
          })
        );

        const probeMap = new Map(probeResults.map(item => [item.id, item]));
        updateSourceStatuses(prev =>
          prev.map(item => probeMap.get(item.id) || item)
        );
      }
    } catch (error) {
      console.error('Failed to load sources', error);
      setSourceStatusError('加载信息源列表失败，请稍后重试。');
    } finally {
      setIsSourceStatusLoading(false);
    }
  };

  const updateAutoRefreshSettings = (updates: Partial<typeof autoRefreshSettings>) => {
    setAutoRefreshSettings(prev => {
      const next = {
        ...prev,
        ...updates
      };
      try {
        localStorage.setItem(AUTO_REFRESH_SETTINGS_STORAGE_KEY, JSON.stringify(next));
      } catch {
        // ignore storage errors
      }
      return next;
    });
  };

  const loadDemoChannels = async () => {
    try {
      const data = await api.getChannelMetadata();
      const channels = data.filter(item => item && typeof item.name === 'string' && item.name.trim());
      setDemoChannels(channels);
    } catch (error) {
      console.error('Failed to load channel metadata', error);
      setDemoChannels([]);
    }
  };

  const runSourceDemo = async (sectionId: DemoSectionId) => {
    const sectionConfig = DEMO_SECTIONS.find(item => item.id === sectionId) || null;
    const channel = sectionConfig
      ? sectionConfig.channelCandidates
        .map(name => demoChannels.find(item => item.name === name) || null)
        .find(Boolean) || null
      : null;
    if (!channel) {
      setDemoResponses(prev => ({
        ...prev,
        [sectionId]: {
          results: [],
          errors: ['当前板块没有可用通道']
        }
      }));
      return;
    }

    const query = (demoQueries[sectionId] || '').trim();
    if (!query) {
      setDemoResponses(prev => ({
        ...prev,
        [sectionId]: {
          results: [],
          errors: ['请输入查询内容']
        }
      }));
      return;
    }

    setDemoLoadingSection(sectionId);
    try {
      const response = await api.runChannelDemo(channel.name, query);

      setDemoResponses(prev => ({
        ...prev,
        [sectionId]: response
      }));
    } catch (error) {
      setDemoResponses(prev => ({
        ...prev,
        [sectionId]: {
          results: [],
          errors: [error instanceof Error ? error.message : String(error)]
        }
      }));
    } finally {
      setDemoLoadingSection(null);
    }
  };

  const refreshSourceStatuses = async () => {
    setIsSourceStatusLoading(true);
    setSourceStatusError('');
    try {
      const data = await api.getSourcesStatus();
      data.sort((a, b) => a.name.localeCompare(b.name));
      setSourceStatuses(data);
      const failed = data.filter(item => item.status === 'error' && item.enabled);
      if (failed.length > 0) {
        await Promise.all(
          failed.map(item =>
            api.updateSource(item.id, { enabled: false }).catch(() => null)
          )
        );
        updateSourceStatuses(prev =>
          prev.map(item =>
            item.status === 'error'
              ? {
                  ...item,
                  enabled: false
                }
              : item
          )
        );
      } else {
        persistSourceStatuses(data);
      }
    } catch (error) {
      console.error('Failed to load source status', error);
      setSourceStatusError('加载信息源状态失败，请稍后重试。');
    } finally {
      setIsSourceStatusLoading(false);
    }
  };

  const openSourcesDialog = () => {
    setIsSourcesDialogOpen(true);
    setActiveSourcePanelTab('rss');
    const cached = loadCachedSourceStatuses();
    if (cached.length > 0) {
      setSourceStatuses(
        cached.map(item => ({
          ...item,
          status: item.status === 'checking' ? 'unknown' : item.status || 'unknown'
        }))
      );
    }
    loadSourcesList();
    loadDemoChannels();
  };

  const closeSourcesDialog = () => {
    persistSourceStatuses(sourceStatuses);
    setIsSourcesDialogOpen(false);
  };

  const toggleSourceEnabled = async (source: SourceStatus) => {
    if (source.enabled) {
      updateSourceStatuses(prev =>
        prev.map(item =>
          item.id === source.id
            ? {
                ...item,
                enabled: false
              }
            : item
        )
      );
      try {
        await api.updateSource(source.id, { enabled: false });
      } catch (error) {
        console.error('Failed to update source', error);
        setSourceStatusError('更新信息源失败，请稍后重试。');
        loadSourcesList();
      }
      return;
    }

    setSourceStatusError('');
    try {
      updateSourceStatuses(prev =>
        prev.map(item =>
          item.id === source.id
            ? {
                ...item,
                status: 'checking'
              }
            : item
        )
      );
      const status = await api.getSourceStatus(source.id);
      if (status.status === 'ok') {
        await api.updateSource(source.id, { enabled: true });
        updateSourceStatuses(prev =>
          prev.map(item =>
            item.id === source.id
              ? {
                  ...status,
                  enabled: true
                }
              : item
          )
        );
      } else {
        updateSourceStatuses(prev =>
          prev.map(item =>
            item.id === source.id
              ? {
                  ...status,
                  enabled: false
                }
              : item
          )
        );
      }
    } catch (error) {
      console.error('Failed to update source', error);
      setSourceStatusError('更新信息源失败，请稍后重试。');
      loadSourcesList();
    } finally {
    }
  };

  const openEditStockDialog = (keyword: Keyword) => {
    const stock = keyword.stock ?? null;
    setStockDialogMode('edit');
    setStockEditingKeywordId(keyword.id);
    setStockDraftFolderId(null);
    setStockDraft({
      symbol: stock?.symbol || '',
      name: stock?.name || keyword.text || '',
      exchange: stock?.exchange || ''
    });
    setStockDraftError('');
    setIsStockDialogOpen(true);
  };

  const closeStockDialog = () => {
    setIsStockDialogOpen(false);
    setStockDialogMode('create');
    setStockEditingKeywordId(null);
  };

  const handleAddStockKeyword = (folderId?: string | null) => {
    openStockDialog(folderId);
  };

  const submitStockKeyword = async () => {
    const symbol = stockDraft.symbol.trim().toUpperCase();
    if (!symbol) {
      setStockDraftError('请输入股票代码。');
      return;
    }
    const name = stockDraft.name.trim() || symbol;
    const exchange = stockDraft.exchange.trim();

    try {
      if (stockDialogMode === 'edit' && stockEditingKeywordId) {
        const updated = await api.updateKeyword(stockEditingKeywordId, {
          text: name,
          kind: 'stock',
          stock: {
            symbol,
            name,
            exchange,
            market: '',
            currency: ''
          }
        });
        setKeywords(prev => prev.map(item => (item.id === updated.id ? updated : item)));
        if (selectedKeywordId === updated.id) {
          setArticles([]);
          setSelectedArticleId(null);
          setIsRefreshing(true);
          const stockRefreshTask = loadStockQuote(updated).catch((error) => {
            if (isAbortError(error)) return;
            console.error('Failed to refresh stock quote after keyword update', error);
          });
          try {
            await api.refreshKeyword(updated.id);
            await loadArticles(updated.id);
            void stockRefreshTask;
          } finally {
            setIsRefreshing(false);
          }
        }
        closeStockDialog();
        return;
      }

      const created = await api.createKeyword({
        text: name,
        aliases: [],
        frequencyMinutes: 360,
        enabled: true,
        kind: 'stock',
        stock: {
          symbol,
          name,
          exchange,
          market: '',
          currency: ''
        }
      });
      setKeywords(prev => [...prev, created]);
      setSelection({
        kind: stockDraftFolderId ? 'keyword-folder' : 'keyword-global',
        id: created.id
      });
      if (stockDraftFolderId) {
        await api.linkKeywordToFolder(stockDraftFolderId, created.id);
        setFolderLinks(prev => [...prev, { folderId: stockDraftFolderId, keywordId: created.id }]);
      }
      closeStockDialog();
    } catch (error) {
      console.error('Failed to create stock keyword', error);
      setStockDraftError('创建股票关键词失败，请稍后重试。');
    }
  };

  const handleAddFolder = async () => {
    try {
      const created = await api.createFolder({ name: '新文件夹' });
      setFolders(prev => [...prev, created]);
    } catch (error) {
      console.error('Failed to create folder', error);
    }
  };

  const handleRenameFolder = async (id: string, name: string) => {
    try {
      const updated = await api.updateFolder(id, { name });
      setFolders(prev => prev.map(item => (item.id === id ? updated : item)));
    } catch (error) {
      console.error('Failed to rename folder', error);
    }
  };

  const handleDeleteFolder = async (id: string) => {
    try {
      await api.deleteFolder(id);
      setFolders(prev => prev.filter(item => item.id !== id));
      setFolderLinks(prev => prev.filter(link => link.folderId !== id));
      if (selectedFolderId === id) {
        setSelection(null);
      }
    } catch (error) {
      console.error('Failed to delete folder', error);
    }
  };

  const handleRenameKeyword = async (id: string, text: string) => {
    try {
      const updated = await api.updateKeyword(id, { text });
      setKeywords(prev => prev.map(item => (item.id === id ? updated : item)));
      if (selectedKeywordId === id && updated.kind === 'stock') {
        loadStockQuote(updated);
      }
      if (selectedKeywordId === id) {
        setArticles([]);
        setSelectedArticleId(null);
        setIsRefreshing(true);
        try {
          await api.refreshKeyword(id);
          await loadArticles(id);
        } finally {
          setIsRefreshing(false);
        }
      }
    } catch (error) {
      console.error('Failed to rename keyword', error);
    }
  };

  const handleDeleteKeyword = async (id: string) => {
    try {
      await api.deleteKeyword(id);
      setKeywords(prev => prev.filter(item => item.id !== id));
      setFolderLinks(prev => prev.filter(link => link.keywordId !== id));
      if (selectedKeywordId === id) {
        setSelection(null);
        setStockQuote(null);
        setIsStockQuoteLoading(false);
      }
    } catch (error) {
      console.error('Failed to delete keyword', error);
    }
  };

  const handleMoveKeyword = async (keywordId: string, folderId: string | null) => {
    if (!folderId) return;
    const exists = folderLinks.some(link => link.folderId === folderId && link.keywordId === keywordId);
    if (exists) return;
    try {
      await api.linkKeywordToFolder(folderId, keywordId);
      setFolderLinks(prev => [...prev, { folderId, keywordId }]);
    } catch (error) {
      console.error('Failed to link keyword', error);
    }
  };

  const handleRefresh = async () => {
    if (selectedFolderId) {
      setIsRefreshing(true);
      refreshRequestControllerRef.current?.abort();
      const controller = new AbortController();
      refreshRequestControllerRef.current = controller;
      try {
        await api.refreshFolder(selectedFolderId, controller.signal);
        await loadArticlesForFolder(selectedFolderId);
      } catch (error) {
        if (isAbortError(error)) return;
        console.error('Failed to refresh folder', error);
      } finally {
        setIsRefreshing(false);
      }
      return;
    }
    if (!selectedKeywordId) return;
    setIsRefreshing(true);
    refreshRequestControllerRef.current?.abort();
    const controller = new AbortController();
    refreshRequestControllerRef.current = controller;
    const isStockKeyword = selectedKeyword?.kind === 'stock';
    const stockRefreshTask = (isStockKeyword && selectedKeyword)
      ? loadStockQuote(selectedKeyword).catch((error) => {
        if (isAbortError(error)) return;
        console.error('Failed to refresh stock quote', error);
      })
      : Promise.resolve();
    try {
      await api.refreshKeyword(selectedKeywordId, controller.signal);
      await loadArticles(selectedKeywordId);
      void stockRefreshTask;
    } catch (error) {
      if (isAbortError(error)) return;
      console.error('Failed to refresh keyword', error);
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleMarkIrrelevant = async (articleId: string) => {
    if (selectedFolderId) {
      try {
        await api.markIrrelevantForFolder(selectedFolderId, articleId);
        await loadArticlesForFolder(selectedFolderId);
        setSelectedArticleId(null);
      } catch (error) {
        console.error('Failed to mark irrelevant for folder', error);
      }
      return;
    }
    if (!selectedKeywordId) return;
    try {
      await api.markIrrelevant(selectedKeywordId, articleId);
      await loadArticles(selectedKeywordId);
      setSelectedArticleId(null);
    } catch (error) {
      console.error('Failed to mark irrelevant', error);
    }
  };

  const demoSections = useMemo(
    () => DEMO_SECTIONS.map((section) => {
      const channel = section.channelCandidates
        .map(name => demoChannels.find(item => item.name === name) || null)
        .find(Boolean) || null;
      return {
        ...section,
        channel
      };
    }),
    [demoChannels]
  );

  const activeDemoSectionId: DemoSectionId | null = activeSourcePanelTab === 'settings'
    ? null
    : activeSourcePanelTab;
  const activeDemoSectionConfig = activeDemoSectionId
    ? (demoSections.find(item => item.id === activeDemoSectionId) || null)
    : null;
  const activeDemoMeta = activeDemoSectionConfig?.channel || null;
  const activeDemoResponse = activeDemoSectionId ? demoResponses[activeDemoSectionId] : undefined;
  const activeDemoSources = useMemo(() => {
    if (!activeDemoSectionConfig) return [];
    return sourceStatuses.filter((source) => (
      activeDemoSectionConfig.channelCandidates.includes(String(source.channelName || ''))
    ));
  }, [activeDemoSectionConfig, sourceStatuses]);
  const hasUnavailableSource = activeDemoSources.some((source) => source.status === 'error');
  const getDemoHint = () => {
    if (!activeDemoSectionConfig) return '当前没有可用通道';
    if (!activeDemoMeta) return `${activeDemoSectionConfig.hint}（当前未发现可用通道）`;
    return activeDemoSectionConfig.hint;
  };
  const getDemoPlaceholder = () => activeDemoSectionConfig?.placeholder || '请输入查询内容';
  const formatDemoTime = (value?: string) => {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return new Intl.DateTimeFormat('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    }).format(date);
  };

  return (
    <div ref={containerRef} className="flex h-screen w-screen bg-white text-gray-900 font-sans overflow-hidden">
      <div
        className="hidden md:flex h-full flex-shrink-0"
        style={isDesktop ? { width: leftWidth } : undefined}
      >
        <SidebarFolders
          folders={folders}
          folderLinks={folderLinks}
          keywords={keywords}
          selectedKind={selection?.kind ?? null}
          selectedId={selection?.id ?? null}
          onSelectFolder={(id) => setSelection({ kind: 'folder', id })}
          onSelectFolderKeyword={(id) => setSelection({ kind: 'keyword-folder', id })}
          onSelectGlobalKeyword={(id) => setSelection({ kind: 'keyword-global', id })}
          onAddKeyword={handleAddKeyword}
          onAddStockKeyword={handleAddStockKeyword}
          onAddFolder={handleAddFolder}
          onRenameFolder={handleRenameFolder}
          onDeleteFolder={handleDeleteFolder}
          onRenameKeyword={handleRenameKeyword}
          onEditStockKeyword={openEditStockDialog}
          onDeleteKeyword={handleDeleteKeyword}
          onMoveKeyword={handleMoveKeyword}
          onOpenSettings={openSourcesDialog}
        />
      </div>

      <div
        className="hidden md:flex h-full w-1.5 flex-shrink-0 cursor-col-resize items-stretch bg-transparent hover:bg-gray-100/70 active:bg-gray-200/80"
        onMouseDown={(event) => startDragging('left', event)}
        role="separator"
        aria-orientation="vertical"
        aria-label="调整关键词栏宽度"
      />

      <div
        className="flex h-full relative min-w-0 w-full md:w-auto shrink md:shrink-0"
        style={isDesktop ? { width: middleWidth } : undefined}
      >
        <SidebarNotes
          articles={articles}
          selectedArticleId={selectedArticleId}
          onSelectArticle={setSelectedArticleId}
          searchTerm={searchTerm}
          onSearchChange={setSearchTerm}
          onRefresh={handleRefresh}
          isRefreshing={isRefreshing}
          canRefresh={canRefresh}
          stockQuote={stockQuote}
          stockQuoteLoading={isStockQuoteLoading}
          showStockCard={showStockCard}
        />
      </div>

      <div
        className="hidden md:flex h-full w-1.5 flex-shrink-0 cursor-col-resize items-stretch bg-transparent hover:bg-gray-100/70 active:bg-gray-200/80"
        onMouseDown={(event) => startDragging('middle', event)}
        role="separator"
        aria-orientation="vertical"
        aria-label="调整新闻摘要栏宽度"
      />

      <div className="flex-1 h-full flex flex-col min-w-0 min-h-0">
        <div className="flex-1 relative min-h-0">
          <MainEditor article={selectedArticle} onMarkIrrelevant={handleMarkIrrelevant} />
        </div>
      </div>

      {isStockDialogOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
          onClick={closeStockDialog}
        >
          <div
            className="w-full max-w-sm rounded-2xl border border-gray-200 bg-white p-4 shadow-xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold text-gray-900">
                {stockDialogMode === 'edit' ? '编辑股票关键词' : '新建股票关键词'}
              </div>
              <button
                type="button"
                className="h-7 w-7 rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-100"
                onClick={closeStockDialog}
                aria-label="关闭"
              >
                x
              </button>
            </div>

            <form
              className="mt-3 space-y-3"
              onSubmit={(event) => {
                event.preventDefault();
                submitStockKeyword();
              }}
              onKeyDown={(event) => {
                if (event.key === 'Escape') {
                  closeStockDialog();
                }
              }}
            >
              <label className="block">
                <span className="text-xs font-medium text-gray-500">股票代码</span>
                <input
                  value={stockDraft.symbol}
                  onChange={(event) => {
                    setStockDraft(prev => ({ ...prev, symbol: event.target.value }));
                    setStockDraftError('');
                  }}
                  placeholder="例如 600690"
                  className="mt-1 w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-note-yellow/50"
                  autoFocus
                />
              </label>

              <label className="block">
                <span className="text-xs font-medium text-gray-500">股票名称（可选）</span>
                <input
                  value={stockDraft.name}
                  onChange={(event) => {
                    setStockDraft(prev => ({ ...prev, name: event.target.value }));
                    setStockDraftError('');
                  }}
                  placeholder="例如 海尔智家"
                  className="mt-1 w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-note-yellow/50"
                />
              </label>

              <label className="block">
                <span className="text-xs font-medium text-gray-500">交易所（可选）</span>
                <input
                  value={stockDraft.exchange}
                  onChange={(event) => {
                    setStockDraft(prev => ({ ...prev, exchange: event.target.value }));
                    setStockDraftError('');
                  }}
                  placeholder="例如 上交所"
                  className="mt-1 w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-note-yellow/50"
                />
              </label>

              {stockDraftError ? (
                <div className="text-xs text-red-600">{stockDraftError}</div>
              ) : null}

              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  className="rounded-md border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50"
                  onClick={closeStockDialog}
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="rounded-md bg-note-yellow px-3 py-1.5 text-xs font-semibold text-gray-900 hover:bg-note-yellow/90"
                >
                  {stockDialogMode === 'edit' ? '保存' : '创建'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {isSourcesDialogOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
          onClick={closeSourcesDialog}
        >
          <div
            className="w-full max-w-2xl rounded-2xl border border-gray-200 bg-white p-4 shadow-xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold text-gray-900">信息源设置</div>
              <button
                type="button"
                className="h-7 w-7 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100 flex items-center justify-center"
                onClick={closeSourcesDialog}
                aria-label="关闭"
              >
                <X size={14} strokeWidth={1.6} />
              </button>
            </div>

            <div className="mt-3">
              <div className="inline-flex items-center gap-1 rounded-xl border border-gray-200 bg-gray-100/90 p-1 shadow-inner">
                {SOURCE_PANEL_TABS.map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                      activeSourcePanelTab === tab.id
                        ? 'border border-gray-200 bg-white text-gray-900 shadow-sm'
                        : 'text-gray-500 hover:text-gray-700'
                    }`}
                    onClick={() => setActiveSourcePanelTab(tab.id)}
                  >
                    {tab.title}
                  </button>
                ))}
              </div>
            </div>

            {activeSourcePanelTab !== 'settings' && activeDemoSectionId ? (
              <>
                <div className="mt-4 flex items-center justify-between">
                  <div className="text-xs text-gray-400">
                    信息源列表
                  </div>
                  <button
                    type="button"
                    className="rounded-md border border-gray-200 px-2.5 py-1 text-xs text-gray-600 hover:bg-gray-50"
                    onClick={refreshSourceStatuses}
                    disabled={isSourceStatusLoading}
                  >
                    {isSourceStatusLoading ? '检测中...' : '重新检测'}
                  </button>
                </div>

                {sourceStatusError ? (
                  <div className="mt-3 text-xs text-red-600">{sourceStatusError}</div>
                ) : null}

                {hasUnavailableSource ? (
                  <div className="mt-3 rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-xs text-red-600">
                    当前板块存在不可用信息源，请检查网络或切换为“不启用”。
                  </div>
                ) : null}

                <div className="mt-3 max-h-48 overflow-y-auto divide-y divide-gray-100 rounded-xl border border-gray-200 bg-gray-50/70">
                  {isSourceStatusLoading && activeDemoSources.length === 0 ? (
                    <div className="space-y-3 py-3">
                      {Array.from({ length: 3 }).map((_, index) => (
                        <div key={`panel-source-skeleton-${index}`} className="flex items-center justify-between px-3">
                          <div className="h-4 w-36 rounded bg-gray-200 animate-pulse" />
                          <div className="h-7 w-16 rounded bg-gray-200 animate-pulse" />
                        </div>
                      ))}
                    </div>
                  ) : activeDemoSources.length > 0 ? (
                    activeDemoSources.map((source) => {
                      const statusLabel = source.status === 'ok'
                        ? '可访问'
                        : source.status === 'error'
                          ? '不可用'
                          : source.status === 'disabled'
                            ? '已禁用'
                            : source.status === 'checking'
                              ? '检测中'
                              : '未检测';
                      const statusStyles = source.status === 'ok'
                        ? 'bg-emerald-50 text-emerald-700'
                        : source.status === 'error'
                          ? 'bg-red-50 text-red-600'
                          : source.status === 'disabled'
                            ? 'bg-gray-100 text-gray-500'
                            : source.status === 'checking'
                              ? 'bg-sky-50 text-sky-700'
                              : 'bg-amber-50 text-amber-700';
                      return (
                        <div key={`panel-source-${source.id}`} className="px-3 py-2.5">
                          <div className="flex items-center justify-between gap-3">
                            <div className="min-w-0">
                              <div className="text-sm text-gray-800 truncate">{source.name}</div>
                              <div className="text-[11px] text-gray-400 break-all">{source.url}</div>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium ${statusStyles}`}>
                                {statusLabel}
                              </span>
                              <button
                                type="button"
                                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                                  source.enabled ? 'bg-emerald-400' : 'bg-gray-200'
                                } ${source.status === 'checking' ? 'opacity-50 cursor-not-allowed' : ''}`}
                                onClick={() => toggleSourceEnabled(source)}
                                aria-pressed={source.enabled}
                                title={source.enabled ? '停用信息源' : '启用信息源'}
                                disabled={source.status === 'checking'}
                              >
                                <span
                                  className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                                    source.enabled ? 'translate-x-4' : 'translate-x-1'
                                  }`}
                                />
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div className="px-3 py-6 text-center text-xs text-gray-400">当前板块暂无可配置信息源</div>
                  )}
                </div>

                <div className="mt-4 rounded-xl border border-gray-200 bg-white">
                <div className="p-3">
                  <div className="text-xs text-gray-400">{getDemoHint()}</div>
                  <div className="mt-3 flex items-center gap-2">
                    <input
                      value={demoQueries[activeDemoSectionId] || ''}
                      onChange={(event) => {
                        const value = event.target.value;
                        setDemoQueries(prev => ({
                          ...prev,
                          [activeDemoSectionId]: value
                        }));
                      }}
                      placeholder={getDemoPlaceholder()}
                      className="flex-1 rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-note-yellow/50"
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          event.preventDefault();
                          runSourceDemo(activeDemoSectionId);
                        }
                      }}
                    />
                    <button
                      type="button"
                      className="rounded-md bg-note-yellow px-3 py-2 text-xs font-semibold text-gray-900 hover:bg-note-yellow/90 disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-gray-500"
                      onClick={() => runSourceDemo(activeDemoSectionId)}
                      disabled={!activeDemoMeta || demoLoadingSection === activeDemoSectionId}
                    >
                      {demoLoadingSection === activeDemoSectionId ? '搜索中...' : '搜索'}
                    </button>
                  </div>

                  <div className="mt-3 max-h-64 overflow-y-auto rounded-lg border border-gray-100 bg-gray-50/70">
                    {activeDemoResponse?.errors && activeDemoResponse.errors.length > 0 ? (
                      <div className="border-b border-red-100 bg-red-50/70 px-3 py-2 text-xs text-red-600">
                        {activeDemoResponse.errors.map((error, index) => (
                          <div key={`${activeDemoSectionId}-error-${index}`}>{error}</div>
                        ))}
                      </div>
                    ) : null}

                    {activeDemoResponse?.results && activeDemoResponse.results.length > 0 ? (
                      <div className="divide-y divide-gray-100">
                        {activeDemoResponse.results.map((item, index) => (
                          <div key={`${activeDemoSectionId}-result-${index}`} className="px-3 py-2.5">
                            <div className="text-sm font-medium text-gray-800">{item.title}</div>
                            {item.subtitle ? (
                              <div className="mt-1 text-xs text-gray-500">{item.subtitle}</div>
                            ) : null}
                            {item.description ? (
                              <div className="mt-1 text-xs text-gray-400 break-all">{item.description}</div>
                            ) : null}
                            <div className="mt-1 flex items-center gap-2 text-[11px] text-gray-400">
                              {item.publishTime ? <span>{formatDemoTime(item.publishTime)}</span> : null}
                              {item.source ? (
                                <>
                                  {item.publishTime ? <span>•</span> : null}
                                  <span>{item.source}</span>
                                </>
                              ) : null}
                              {item.url ? (
                                <>
                                  {(item.publishTime || item.source) ? <span>•</span> : null}
                                  <a
                                    href={item.url}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="truncate text-gray-500 hover:text-gray-700"
                                  >
                                    打开链接
                                  </a>
                                </>
                              ) : null}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="px-3 py-6 text-center text-xs text-gray-400">
                        {demoLoadingSection === activeDemoSectionId ? '正在查询...' : '输入内容后点击搜索，结果会显示在这里'}
                      </div>
                    )}
                  </div>
                </div>
                </div>
              </>
            ) : (
              <>
                <div className="mt-4 flex items-center justify-between">
                  <div className="text-xs text-gray-400">
                    信息源列表
                  </div>
                  <button
                    type="button"
                    className="rounded-md border border-gray-200 px-2.5 py-1 text-xs text-gray-600 hover:bg-gray-50"
                    onClick={refreshSourceStatuses}
                    disabled={isSourceStatusLoading}
                  >
                    {isSourceStatusLoading ? '检测中...' : '重新检测'}
                  </button>
                </div>

                {sourceStatusError ? (
                  <div className="mt-3 text-xs text-red-600">{sourceStatusError}</div>
                ) : null}

                <div className="mt-4 rounded-xl border border-gray-200 bg-gray-50/70 p-3">
                  <div className="text-xs font-medium text-gray-500">自动刷新</div>
                  <div className="mt-3 space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="text-sm text-gray-800">打开软件时自动刷新关键词</div>
                        <div className="text-[11px] text-gray-400">首次进入应用后，自动刷新当前选中的关键词</div>
                      </div>
                      <button
                        type="button"
                        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                          autoRefreshSettings.onAppOpen ? 'bg-emerald-400' : 'bg-gray-200'
                        }`}
                        onClick={() => updateAutoRefreshSettings({ onAppOpen: !autoRefreshSettings.onAppOpen })}
                        aria-pressed={autoRefreshSettings.onAppOpen}
                        title={autoRefreshSettings.onAppOpen ? '关闭启动自动刷新' : '开启启动自动刷新'}
                      >
                        <span
                          className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                            autoRefreshSettings.onAppOpen ? 'translate-x-4' : 'translate-x-1'
                          }`}
                        />
                      </button>
                    </div>

                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="text-sm text-gray-800">打开关键词时自动刷新</div>
                        <div className="text-[11px] text-gray-400">切换到任意关键词后，自动拉取该关键词最新内容</div>
                      </div>
                      <button
                        type="button"
                        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                          autoRefreshSettings.onKeywordOpen ? 'bg-emerald-400' : 'bg-gray-200'
                        }`}
                        onClick={() => updateAutoRefreshSettings({ onKeywordOpen: !autoRefreshSettings.onKeywordOpen })}
                        aria-pressed={autoRefreshSettings.onKeywordOpen}
                        title={autoRefreshSettings.onKeywordOpen ? '关闭关键词自动刷新' : '开启关键词自动刷新'}
                      >
                        <span
                          className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                            autoRefreshSettings.onKeywordOpen ? 'translate-x-4' : 'translate-x-1'
                          }`}
                        />
                      </button>
                    </div>
                  </div>
                </div>

                <div className="mt-3 max-h-[60vh] overflow-y-auto divide-y divide-gray-100">
                  {isSourceStatusLoading && sourceStatuses.length === 0 ? (
                    <div className="space-y-3 py-2">
                      {Array.from({ length: 6 }).map((_, index) => (
                        <div key={`source-skeleton-${index}`} className="flex items-center justify-between px-2">
                          <div className="h-4 w-44 rounded bg-gray-200 animate-pulse" />
                          <div className="h-3 w-20 rounded bg-gray-200 animate-pulse" />
                        </div>
                      ))}
                    </div>
                  ) : (
                    sourceStatuses.map((source) => {
                      const statusStyles = source.status === 'ok'
                        ? 'bg-emerald-50 text-emerald-700'
                        : source.status === 'disabled'
                          ? 'bg-gray-100 text-gray-500'
                          : source.status === 'checking'
                            ? 'bg-sky-50 text-sky-700'
                            : source.status === 'unknown'
                              ? 'bg-amber-50 text-amber-700'
                              : 'bg-red-50 text-red-600';
                      const statusLabel = source.status === 'ok'
                        ? '可访问'
                        : source.status === 'disabled'
                          ? '已禁用'
                          : source.status === 'checking'
                            ? '检测中'
                            : source.status === 'unknown'
                              ? '未检测'
                              : '不可访问';
                      return (
                        <div key={source.id} className="py-3 px-2">
                          <div className="flex items-center justify-between gap-3">
                            <div className="min-w-0">
                              <div className="text-sm text-gray-800 truncate">{source.name}</div>
                              <div className="text-[11px] text-gray-400 break-all">{source.url}</div>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className={`flex-shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-medium ${statusStyles}`}>
                                {statusLabel}
                              </span>
                              <button
                                type="button"
                                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                                  source.enabled ? 'bg-emerald-400' : 'bg-gray-200'
                                } ${source.status === 'checking' ? 'opacity-50 cursor-not-allowed' : ''}`}
                                onClick={() => toggleSourceEnabled(source)}
                                aria-pressed={source.enabled}
                                title={source.enabled ? '停用信息源' : '启用信息源'}
                                disabled={source.status === 'checking'}
                              >
                                <span
                                  className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                                    source.enabled ? 'translate-x-4' : 'translate-x-1'
                                  }`}
                                />
                              </button>
                            </div>
                          </div>
                          {source.message ? (
                            <div className="mt-1 text-[11px] text-gray-400 break-all">{source.message}</div>
                          ) : null}
                        </div>
                      );
                    })
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default App;
