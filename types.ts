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
  source: string;
  series: number[];
  summary?: string;
  url?: string;
  rawTitle?: string;
  updatedAt: string;
}

export interface SourceStatus {
  id: string;
  name: string;
  url: string;
  channelName?: string;
  enabled: boolean;
  status: 'ok' | 'error' | 'disabled' | 'unknown' | 'checking';
  message?: string;
  checkedUrl?: string;
  checkedAt: string;
}

export interface SourceConfig {
  id: string;
  name: string;
  url: string;
  channelName?: string;
  channelParams?: Record<string, string>;
  enabled?: boolean;
}

export interface ChannelMetadata {
  name: string;
  description: string;
  input_schema?: Record<string, string>;
}

export interface SourceDemoItem {
  title: string;
  subtitle?: string;
  description?: string;
  url?: string;
  source?: string;
  publishTime?: string;
}

export interface SourceDemoResponse {
  results: SourceDemoItem[];
  errors: string[];
}
