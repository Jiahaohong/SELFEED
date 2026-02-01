export interface Keyword {
  id: string;
  text: string;
  aliases: string[];
  frequencyMinutes: number;
  enabled: boolean;
  kind: 'normal' | 'stock';
  stock?: {
    symbol: string;
    name: string;
    exchange: string;
    market: string;
    currency: string;
  } | null;
}

export interface Folder {
  id: string;
  name: string;
}

export interface FolderKeywordLink {
  folderId: string;
  keywordId: string;
}

export interface Article {
  id: string;
  title: string;
  summary: string;
  source: string;
  publishTime: string;
  url: string;
  content: string;
  relevanceScore: number;
}

export interface KeywordArticle {
  keywordId: string;
  articleId: string;
  score: number;
  irrelevant: boolean;
}

export interface StockQuote {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
  currency: string;
  series: number[];
  updatedAt: string;
}
