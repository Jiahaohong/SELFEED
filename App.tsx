import React, { useEffect, useMemo, useState } from 'react';
import SidebarFolders from './components/SidebarFolders';
import SidebarNotes from './components/SidebarNotes';
import MainEditor from './components/MainEditor';
import { Article, Folder, FolderKeywordLink, Keyword, StockQuote } from './types';
import { api } from './services/api';

const App: React.FC = () => {
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
  const selectedFolderId = selection?.kind === 'folder' ? selection.id : null;
  const selectedKeywordId = selection && selection.kind !== 'folder' ? selection.id : null;
  const canRefresh = Boolean(selectedKeywordId || selectedFolderId);

  const selectedArticle = useMemo(
    () => articles.find(article => article.id === selectedArticleId) || null,
    [articles, selectedArticleId]
  );

  const selectedKeyword = useMemo(
    () => keywords.find(keyword => keyword.id === selectedKeywordId) || null,
    [keywords, selectedKeywordId]
  );

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
      if (!selection && data.length > 0) {
        setSelection({ kind: 'keyword-global', id: data[0].id });
      }
    } catch (error) {
      console.error('Failed to load keywords', error);
    }
  };

  const loadArticles = async (keywordId: string) => {
    try {
      const data = await api.getArticles(keywordId);
      setArticles(data);
      setSelectedArticleId(prev => (data.some(item => item.id === prev) ? prev : null));
    } catch (error) {
      console.error('Failed to load articles', error);
      setArticles([]);
      setSelectedArticleId(null);
    }
  };

  const loadArticlesForFolder = async (folderId: string) => {
    try {
      const data = await api.getFolderArticles(folderId);
      setArticles(data);
      setSelectedArticleId(prev => (data.some(item => item.id === prev) ? prev : null));
    } catch (error) {
      console.error('Failed to load folder articles', error);
      setArticles([]);
      setSelectedArticleId(null);
    }
  };

  const loadStockQuote = async (keyword: Keyword) => {
    if (keyword.kind !== 'stock') {
      setStockQuote(null);
      return;
    }
    try {
      const quote = await api.getStockQuote(keyword.id);
      setStockQuote(quote);
    } catch (error) {
      console.error('Failed to load stock quote', error);
      setStockQuote(null);
    }
  };

  useEffect(() => {
    loadFolders();
    loadFolderLinks();
    loadKeywords();
  }, []);

  useEffect(() => {
    if (selectedFolderId) {
      loadArticlesForFolder(selectedFolderId);
      setStockQuote(null);
      return;
    }
    if (!selectedKeywordId) {
      setArticles([]);
      setSelectedArticleId(null);
      setStockQuote(null);
      return;
    }
    loadArticles(selectedKeywordId);
  }, [selectedKeywordId, selectedFolderId]);

  useEffect(() => {
    if (!selectedKeyword || selectedFolderId) {
      setStockQuote(null);
      return;
    }
    loadStockQuote(selectedKeyword);
  }, [selectedKeyword, selectedFolderId]);

  const handleAddKeyword = async (folderId?: string | null) => {
    try {
      const created = await api.createKeyword({
        text: 'New Keyword',
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

  const handleAddStockKeyword = async (folderId?: string | null) => {
    const symbolInput = window.prompt('Stock symbol (e.g. AAPL)');
    if (!symbolInput) return;
    const symbol = symbolInput.trim().toUpperCase();
    if (!symbol) return;
    const nameInput = window.prompt('Company name (e.g. Apple Inc.)');
    if (!nameInput) return;
    const name = nameInput.trim();
    if (!name) return;
    const exchangeInput = window.prompt('Exchange/Board (e.g. NASDAQ, HKEX, SSE)');
    if (!exchangeInput) return;
    const exchange = exchangeInput.trim();
    if (!exchange) return;

    try {
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
      setSelection({ kind: folderId ? 'keyword-folder' : 'keyword-global', id: created.id });
      if (folderId) {
        await api.linkKeywordToFolder(folderId, created.id);
        setFolderLinks(prev => [...prev, { folderId, keywordId: created.id }]);
      }
    } catch (error) {
      console.error('Failed to create stock keyword', error);
    }
  };

  const handleAddFolder = async () => {
    try {
      const created = await api.createFolder({ name: 'New Folder' });
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
      try {
        await api.refreshFolder(selectedFolderId);
        await loadArticlesForFolder(selectedFolderId);
      } catch (error) {
        console.error('Failed to refresh folder', error);
      } finally {
        setIsRefreshing(false);
      }
      return;
    }
    if (!selectedKeywordId) return;
    setIsRefreshing(true);
    try {
      await api.refreshKeyword(selectedKeywordId);
      await loadArticles(selectedKeywordId);
      if (selectedKeyword?.kind === 'stock') {
        await loadStockQuote(selectedKeyword);
      }
    } catch (error) {
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

  return (
    <div className="flex h-screen w-screen bg-white text-gray-900 font-sans overflow-hidden">
      <div className="hidden md:flex h-full">
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
          onDeleteKeyword={handleDeleteKeyword}
          onMoveKeyword={handleMoveKeyword}
        />
      </div>

      <div className="flex h-full relative">
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
        />
      </div>

      <div className="flex-1 h-full flex flex-col min-w-0 min-h-0">
        <div className="flex-1 relative min-h-0">
          <MainEditor article={selectedArticle} onMarkIrrelevant={handleMarkIrrelevant} />
        </div>
      </div>
    </div>
  );
};

export default App;
