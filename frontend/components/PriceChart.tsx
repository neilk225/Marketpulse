"use client";

import { useEffect, useRef } from "react";

import type { AssetClass } from "@/lib/types";
import { tvSymbol } from "@/lib/utils";

/**
 * TradingView "Advanced Chart" embedded widget (free, iframe-based — their data,
 * no API key or cost on our side). Re-injects the script when the symbol changes.
 * Sentiment can't be overlaid (separate DOM context) — that's a known spec cut.
 */
export default function PriceChart({
  symbol,
  assetClass,
  height = 500,
}: {
  symbol: string;
  assetClass: AssetClass;
  height?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = ref.current;
    if (!container) return;
    container.innerHTML = "";

    const widget = document.createElement("div");
    widget.className = "tradingview-widget-container__widget";
    container.appendChild(widget);

    const script = document.createElement("script");
    script.src =
      "https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js";
    script.async = true;
    // Explicit width/height — autosize was leaving the iframe collapsed.
    script.innerHTML = JSON.stringify({
      symbol: tvSymbol(symbol, assetClass),
      width: "100%",
      height,
      theme: "dark",
      style: "1", // candles
      locale: "en",
      hide_side_toolbar: true,
      allow_symbol_change: false,
      backgroundColor: "rgba(13, 15, 18, 1)",
      gridColor: "rgba(31, 35, 41, 0.6)",
    });
    container.appendChild(script);
  }, [symbol, assetClass]);

  return (
    <div
      ref={ref}
      className="tradingview-widget-container overflow-hidden rounded"
      style={{ width: "100%" }}
    />
  );
}
