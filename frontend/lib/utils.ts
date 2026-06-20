// Score -> color/signal mapping and small formatting helpers.
import type { AssetClass, Confidence, SentimentLabel } from "./types";

export type Signal = "bull" | "neutral" | "bear";

/**
 * Aggregate score → 5-band scale. The label and the color share ONE source of
 * truth (SCORE_BANDS) so they can never disagree — previously the label had 5
 * bands but the color only 3, so a 0.57 read "SLIGHTLY BULLISH" yet was painted
 * full green. The two "slightly" bands sit between the pure signals: orange
 * leaning bearish, yellow-green (lime) leaning bullish. Per-headline sentiment
 * stays 3-color and categorical (see SIGNAL_TEXT / SENTIMENT_SIGNAL below).
 */
const SCORE_BANDS = [
  { max: 0.3, label: "BEARISH", hex: "#ef4444" }, // red
  { max: 0.45, label: "SLIGHTLY BEARISH", hex: "#f97316" }, // orange
  { max: 0.55, label: "NEUTRAL", hex: "#eab308" }, // yellow
  { max: 0.7, label: "SLIGHTLY BULLISH", hex: "#84cc16" }, // yellow-green
  { max: Infinity, label: "BULLISH", hex: "#22c55e" }, // green
] as const;

function scoreBand(score: number): (typeof SCORE_BANDS)[number] {
  return (
    SCORE_BANDS.find((b) => score < b.max) ?? SCORE_BANDS[SCORE_BANDS.length - 1]
  );
}

export function scoreHex(score: number): string {
  return scoreBand(score).hex;
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

// 5-band label for the gauge — same source of truth (and thus same cut points)
// as the color, so the two always agree.
export function scoreLabel(score: number): string {
  return scoreBand(score).label;
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

/**
 * Map our symbol to a TradingView widget symbol. Stocks and commodity ETFs
 * (GLD, USO…) resolve as-is; crypto tickers (BTC, ETH) need a USD pair (BTCUSD).
 * TradingView auto-resolves the exchange, so no exchange prefix is needed.
 */
export function tvSymbol(symbol: string, assetClass: AssetClass): string {
  const s = symbol.toUpperCase();
  return assetClass === "crypto" ? `${s}USD` : s;
}

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
