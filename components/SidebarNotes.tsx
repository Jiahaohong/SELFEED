import React from 'react';
import { Newspaper, RefreshCw } from 'lucide-react';
import { Article, StockQuote } from '../types';

interface SidebarNotesProps {
  articles: Article[];
  selectedArticleId: string | null;
  onSelectArticle: (id: string) => void;
  searchTerm: string;
  onSearchChange: (term: string) => void;
  onRefresh: () => void;
  isRefreshing: boolean;
  canRefresh: boolean;
  stockQuote: StockQuote | null;
}

const SidebarNotes: React.FC<SidebarNotesProps> = ({
  articles,
  selectedArticleId,
  onSelectArticle,
  searchTerm,
  onSearchChange,
  onRefresh,
  isRefreshing,
  canRefresh,
  stockQuote
}) => {
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    }).format(date);
  };

  const formatCurrency = (value: number, currency: string) => {
    try {
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: currency || 'USD',
        maximumFractionDigits: 2
      }).format(value);
    } catch {
      return value.toFixed(2);
    }
  };

  const renderSparkline = (series: number[], isUp: boolean) => {
    if (!series || series.length < 2) return null;
    const width = 120;
    const height = 32;
    const padding = 2;
    const min = Math.min(...series);
    const max = Math.max(...series);
    const range = max - min || 1;
    const points = series.map((value, index) => {
      const x = padding + (index / (series.length - 1)) * (width - padding * 2);
      const y = padding + (1 - (value - min) / range) * (height - padding * 2);
      return `${x},${y}`;
    });
    const path = `M ${points[0]} L ${points.slice(1).join(' ')}`;
    return (
      <svg viewBox={`0 0 ${width} ${height}`} className="h-8 w-full">
        <path
          d={path}
          fill="none"
          stroke={isUp ? '#10b981' : '#ef4444'}
          strokeWidth="1.6"
          strokeLinecap="round"
        />
      </svg>
    );
  };

  const filteredArticles = articles.filter(item => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return true;
    return (
      item.title.toLowerCase().includes(term) ||
      item.summary.toLowerCase().includes(term) ||
      item.source.toLowerCase().includes(term)
    );
  });

  const hasContent = filteredArticles.length > 0 || Boolean(stockQuote);

  return (
    <div className="flex flex-col h-full bg-white border-r border-gray-200 w-[300px] flex-shrink-0 z-10">
      <div className="h-14 flex items-center px-4 border-b border-gray-100 flex-shrink-0">
        <div className="flex items-center gap-2 w-full">
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <Newspaper size={14} />
            News Summaries
          </div>
          <div className="relative flex-1">
            <input
              type="text"
              placeholder="Search news"
              value={searchTerm}
              onChange={(e) => onSearchChange(e.target.value)}
              className="w-full bg-gray-100 text-gray-800 text-sm rounded-md px-8 py-1.5 focus:outline-none focus:ring-2 focus:ring-note-yellow/50 transition-all placeholder-gray-400"
            />
            <svg className="absolute left-2.5 top-2 text-gray-400" width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
          </div>
          <button
            onClick={onRefresh}
            disabled={!canRefresh || isRefreshing}
            className="h-8 w-8 flex items-center justify-center rounded-md text-gray-500 hover:text-gray-700 hover:bg-gray-100 transition-colors disabled:text-gray-300 disabled:hover:text-gray-300 disabled:hover:bg-transparent"
            title="Refresh"
          >
            <RefreshCw size={14} className={isRefreshing ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {!hasContent ? (
          <div className="flex flex-col items-center justify-center h-40 text-gray-400">
            <span className="text-sm">No summaries found</span>
          </div>
        ) : (
          <div className="p-3 space-y-2">
            {stockQuote ? (
              <div className="rounded-xl border border-gray-200 bg-white px-3 py-2 shadow-sm">
                <div className="flex items-center gap-3">
                  <div className="min-w-[78px]">
                    <div className="text-[11px] uppercase tracking-wide text-gray-400">
                      {stockQuote.symbol}
                    </div>
                    <div className="text-sm font-semibold text-gray-900 truncate">
                      {stockQuote.name}
                    </div>
                  </div>
                  <div className="flex-1">
                    {renderSparkline(stockQuote.series, stockQuote.change >= 0)}
                  </div>
                  <div className="min-w-[90px] text-right">
                    <div className="text-sm font-semibold text-gray-900">
                      {formatCurrency(stockQuote.price, stockQuote.currency)}
                    </div>
                    <div className={`text-xs font-medium ${stockQuote.change >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                      {stockQuote.change >= 0 ? '+' : ''}
                      {stockQuote.change.toFixed(2)} ({stockQuote.change >= 0 ? '+' : ''}
                      {stockQuote.changePercent.toFixed(2)}%)
                    </div>
                  </div>
                </div>
              </div>
            ) : null}
            {filteredArticles.map(item => (
              <div
                key={item.id}
                onClick={() => onSelectArticle(item.id)}
                className={`group flex flex-col p-3 rounded-lg cursor-pointer transition-all duration-200 border ${
                  selectedArticleId === item.id
                    ? 'bg-gray-100 border-transparent'
                    : 'bg-white border-transparent hover:bg-gray-100 hover:border-gray-200'
                }`}
              >
                <div className="flex justify-between items-baseline mb-1">
                  <h3 className={`text-sm font-bold truncate ${selectedArticleId === item.id ? 'text-black' : 'text-gray-800'}`}>
                    {item.title}
                  </h3>
                </div>

                <p className="text-xs text-gray-500 leading-relaxed mb-2">
                  {item.summary}
                </p>

                <div className="flex gap-2 items-baseline text-xs text-gray-400">
                  <span className="font-medium flex-shrink-0">
                    {formatDate(item.publishTime)}
                  </span>
                  <span className="text-gray-300">•</span>
                  <span className="truncate">{item.source}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default SidebarNotes;
