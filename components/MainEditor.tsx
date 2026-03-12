import React from 'react';
import { ExternalLink, Newspaper, Slash } from 'lucide-react';
import { Article } from '../types';

interface MainEditorProps {
  article: Article | null;
  onMarkIrrelevant: (id: string) => void;
}

const MainEditor: React.FC<MainEditorProps> = ({ article, onMarkIrrelevant }) => {
  const isPdfUrl = (value: string) => {
    const normalized = String(value || '').trim().toLowerCase();
    return normalized.endsWith('.pdf') || normalized.includes('.pdf?');
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return new Intl.DateTimeFormat('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    }).format(date);
  };

  const pdfUrl = article && isPdfUrl(article.url) ? article.url : '';

  if (!article) {
    return (
      <div className="flex-1 flex flex-col h-full bg-white">
        <div className="h-14 flex items-center gap-2 px-6 border-b border-gray-100 text-sm text-gray-500">
          <Newspaper size={16} />
          新闻详情
        </div>
        <div className="flex-1 flex items-center justify-center text-sm text-gray-400">
          请选择一条新闻摘要查看详情
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-full bg-white min-h-0">
      <div className="h-14 flex items-center justify-between px-6 border-b border-gray-100 text-sm text-gray-500">
        <div className="flex items-center gap-2">
          <Newspaper size={16} />
          新闻详情
        </div>
        <div className="flex items-center gap-2">
          <a
            href={article.url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-gray-500 hover:text-gray-700"
          >
            <ExternalLink size={14} />
            原文
          </a>
          <button
            onClick={() => onMarkIrrelevant(article.id)}
            className="inline-flex items-center gap-1 text-gray-500 hover:text-red-500"
          >
            <Slash size={14} />
            不相关
          </button>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-8 py-6">
        <div className="max-w-3xl">
          <h2 className="text-2xl font-semibold text-gray-900 mb-3">{article.title}</h2>
          <div className="text-xs text-gray-400 flex items-center gap-2 mb-6">
            <span>{formatDate(article.publishTime)}</span>
            <span className="text-gray-300">•</span>
            <span>{article.source}</span>
            <span className="text-gray-300">•</span>
            <span>相关度 {(article.relevanceScore ?? 0).toFixed(2)}</span>
          </div>
          <div className="text-sm text-gray-700 leading-relaxed whitespace-pre-line">
            {article.content}
          </div>
          {pdfUrl ? (
            <div className="mt-8">
              <div className="mb-3 text-sm font-medium text-gray-900">PDF 预览</div>
              <div className="overflow-hidden rounded-2xl border border-gray-200 bg-gray-50">
                <iframe
                  src={pdfUrl}
                  title={article.title}
                  className="h-[720px] w-full bg-white"
                />
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
};

export default MainEditor;
