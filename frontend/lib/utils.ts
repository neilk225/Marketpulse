// Score -> color/signal mapping and small formatting helpers.
import type { AssetClass, Confidence, SentimentLabel } from "./types";

export type Signal = "bull" | "neutral" | "bear";

/**
 * Spec score -> color bands:
 *   0.00–0.35 -> red    (bearish)
 *   0.35–0.55 -> yellow (neutral)
 *   0.55–1.00 -> green  (bullish)
 */
export function scoreSignal(score: number): Signal {
  if (score < 0.35) return "bear";
  if (score < 0.55) return "neutral";
  return "bull";
}

// Hex values match tailwind.config signal colors (for SVG/canvas drawing).
export const SIGNAL_HEX: Record<Signal, string> = {
  bull: "#22c55e",
  neutral: "#eab308",
  bear: "#ef4444",
};

export function scoreHex(score: number): string {
  return SIGNAL_HEX[scoreSignal(score)];
}

// Tailwind text-color class for a signal (used on numeric values).
export const SIGNAL_TEXT: Record<Signal, string> = {
  bull: "text-bull",
  neutral: "text-neutral",
  bear: "text-bear",
};

export const SENTIMENT_SIGNAL: Record<SentimentLabel, Signal> = {
  positive: "bull",
  negative: "bear",
  neutral: "neutral",
};

export const SIGNAL_LABEL: Record<Signal, string> = {
  bull: "BULLISH",
  neutral: "NEUTRAL",
  bear: "BEARISH",
};

export function scoreLabel(score: number): string {
  return SIGNAL_LABEL[scoreSignal(score)];
}

export function formatScore(score: number): string {
  return score.toFixed(2);
}

export function formatPct(pct: number): string {
  return `${pct.toFixed(1)}%`;
}

export function formatSignedPct(pct: number): string {
  const sign = pct > 0 ? "+" : "";
  return `${sign}${pct.toFixed(2)}%`;
}

export function formatPrice(price: number): string {
  return price.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: price < 1 ? 6 : 2,
  });
}

// "5m ago", "2h ago", "3d ago" — for the "last updated" timestamp.
export function timeAgo(iso: string | null): string {
  if (!iso) return "—";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "—";
  const secs = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export const ASSET_LABEL: Record<AssetClass, string> = {
  stock: "STOCK",
  crypto: "CRYPTO",
  commodity: "COMMODITY",
};

export const CONFIDENCE_LABEL: Record<Confidence, string> = {
  high: "HIGH",
  medium: "MED",
  low: "LOW",
};

// Human-readable source labels for the headline badges.
export const SOURCE_LABEL: Record<string, string> = {
  finnhub: "Finnhub",
  yahoo_finance: "Yahoo Finance",
  marketwatch: "MarketWatch",
  seeking_alpha: "Seeking Alpha",
  investing_com: "Investing.com",
  wsj: "WSJ",
  google_news: "Google News",
  coingecko: "CoinGecko",
};

export function sourceLabel(source: string): string {
  return SOURCE_LABEL[source] ?? source;
}

export function cx(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(" ");
}
