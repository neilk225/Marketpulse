// Shared types mirroring the FastAPI response shapes.

export type AssetClass = "stock" | "crypto" | "commodity";
export type SentimentLabel = "positive" | "negative" | "neutral";
export type Confidence = "high" | "medium" | "low";

export interface Sentiment {
  score: number;
  positive_pct: number;
  negative_pct: number;
  neutral_pct: number;
  headline_count: number;
  model_used: string;
  summary: string | null;
  computed_at: string;
}

export interface Headline {
  title: string;
  url: string;
  source: string;
  // Null until the score stage runs — the preview returns headline text only.
  sentiment: SentimentLabel | null;
  score: number | null;
  confidence: Confidence | null;
  published_at: string | null;
}

export interface TickerResponse {
  symbol: string;
  name: string;
  asset_class: AssetClass;
  stale: boolean;
  // True for a preview shell whose sentiment is still being scored; the client
  // follows up with a score request to fill it in.
  pending?: boolean;
  sentiment: Sentiment | null;
  headlines: Headline[];
}

export interface SearchResult {
  symbol: string;
  name: string;
  asset_class: AssetClass;
}

// Latest stored sentiment for a symbol, from the read-only batch endpoint
// (no scoring triggered). Used for at-a-glance lists like the watchlist.
export interface CachedSentiment {
  score: number;
  headline_count: number;
  stale: boolean;
  computed_at: string;
}

export interface Mover {
  symbol: string;
  name: string;
  price: number;
  change_pct: number;
}

export interface MoversResponse {
  gainers: Mover[];
  losers: Mover[];
  cached_at: string;
}
