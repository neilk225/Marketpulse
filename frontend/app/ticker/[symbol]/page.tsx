"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import ErrorState from "@/components/ErrorState";
import HeadlineList from "@/components/HeadlineList";
import { Reveal } from "@/components/Motion";
import { TickerHeaderSkeleton, TickerSkeleton } from "@/components/LoadingSkeleton";
import PriceChart from "@/components/PriceChart";
import RecentTickers from "@/components/RecentTickers";
import SearchBar from "@/components/SearchBar";
import SentimentBreakdown from "@/components/SentimentBreakdown";
import SentimentGauge from "@/components/SentimentGauge";
import StaleBadge from "@/components/StaleBadge";
import TopMovers from "@/components/TopMovers";
import Watchlist from "@/components/Watchlist";
import WatchlistStar from "@/components/WatchlistStar";
import { ApiError, getTicker } from "@/lib/api";
import { pushRecent } from "@/lib/recents";
import type { TickerResponse } from "@/lib/types";
import { ASSET_LABEL, timeAgo } from "@/lib/utils";

function Panel({
  title,
  children,
  className,
  bodyClassName = "p-4",
}: {
  title?: string;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section
      className={`rounded-lg border border-terminal-border bg-terminal-panel ${className ?? ""}`}
    >
      {title && (
        <h2 className="border-b border-terminal-border px-4 py-2.5 text-[11px] font-medium uppercase tracking-widest text-ink-faint">
          {title}
        </h2>
      )}
      <div className={bodyClassName}>{children}</div>
    </section>
  );
}

export default function TickerPage({
  params,
}: {
  params: { symbol: string };
}) {
  const symbol = decodeURIComponent(params.symbol).toUpperCase();
  const [data, setData] = useState<TickerResponse | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await getTicker(symbol);
      setData(result);
      pushRecent(result.symbol); // record only on a successful load
    } catch (e) {
      setError(
        e instanceof ApiError
          ? e
          : new ApiError(
              0,
              "Couldn't reach the server. Check your connection and try again.",
            ),
      );
    } finally {
      setLoading(false);
    }
  }, [symbol]);

  useEffect(() => {
    load();
  }, [load]);

  // Browser tab title: "{SYMBOL} Sentiment".
  useEffect(() => {
    document.title = `${symbol} Sentiment`;
  }, [symbol]);

  return (
    <main className="mx-auto max-w-7xl px-4 py-6 md:py-10">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start">
        <Link
          href="/"
          className="shrink-0 pt-2.5 text-sm text-ink-muted hover:text-ink"
        >
          ← Home
        </Link>
        <div className="sm:ml-auto sm:w-80">
          <SearchBar />
          <RecentTickers exclude={symbol} align="right" />
        </div>
      </div>

      {/* Ticker header — full width above the grid so the content (Sentiment/
          Analysis) and the right sidebar (Watchlist) start on the same line.
          A matching skeleton reserves the same space while loading, so the grid
          and sidebar don't jump when the data resolves. */}
      {loading && <TickerHeaderSkeleton />}
      {!loading && !error && data && (
        <Reveal className="mb-6">
          <div className="flex items-center gap-3">
            <h1 className="tabular text-3xl font-semibold tracking-tight">
              {data.symbol}
            </h1>
            <span className="rounded border border-terminal-border px-1.5 py-0.5 text-[10px] tracking-widest text-ink-muted">
              {ASSET_LABEL[data.asset_class]}
            </span>
            <WatchlistStar symbol={data.symbol} />
          </div>
          <p className="mt-1 text-sm text-ink-muted">{data.name}</p>
          {data.stale && data.sentiment && (
            <div className="mt-2">
              <StaleBadge computedAt={data.sentiment.computed_at} />
            </div>
          )}
          {data.sentiment && !data.stale && (
            <p className="mt-1 text-[11px] text-ink-faint">
              Updated {timeAgo(data.sentiment.computed_at)}
            </p>
          )}
        </Reveal>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        {/* Main content — left on desktop, first on mobile */}
        <div className="min-w-0">
          {loading && <TickerSkeleton />}

          {!loading && error && (
            <ErrorState
              title={
                error.status === 404 ? "Ticker not found" : "Couldn't load ticker"
              }
              message={
                error.status === 404
                  ? `We couldn't find ${symbol}. Try a different symbol.`
                  : error.status === 422
                    ? `"${symbol}" isn't a valid symbol. Try something like AAPL or BTC.`
                    : error.message
              }
              onRetry={
                error.status === 404 || error.status === 422 ? undefined : load
              }
            />
          )}

          {!loading && !error && data && (
            <div className="space-y-6">
              {/* Gauge + analysis/breakdown */}
              <Reveal className="grid gap-6 lg:grid-cols-3">
                <Panel
                  title="Sentiment"
                  className="flex flex-col lg:col-span-1"
                  bodyClassName="flex flex-1 flex-col items-center justify-center p-6"
                >
                  {data.sentiment ? (
                    <SentimentGauge
                      score={data.sentiment.score}
                      headlineCount={data.sentiment.headline_count}
                    />
                  ) : (
                    <p className="py-10 text-center text-sm text-ink-muted">
                      Scoring is temporarily unavailable, and there&apos;s no
                      earlier reading for this ticker.
                    </p>
                  )}
                </Panel>

                <div className="space-y-6 lg:col-span-2">
                  <Panel title="Analysis">
                    {data.sentiment?.summary ? (
                      <p className="text-sm leading-relaxed text-ink">
                        {data.sentiment.summary}
                      </p>
                    ) : (
                      <p className="text-sm text-ink-muted">
                        {data.sentiment && data.sentiment.headline_count > 0
                          ? "No written summary for this reading."
                          : "Not enough recent news to score this ticker yet."}
                      </p>
                    )}
                    {data.sentiment && (
                      <p className="mt-4 text-[11px] text-ink-faint">
                        Model:{" "}
                        <span className="tabular text-ink-muted">
                          {data.sentiment.model_used}
                        </span>
                      </p>
                    )}
                  </Panel>

                  <Panel title="Breakdown">
                    {data.sentiment && data.sentiment.headline_count > 0 ? (
                      <SentimentBreakdown
                        positivePct={data.sentiment.positive_pct}
                        negativePct={data.sentiment.negative_pct}
                        neutralPct={data.sentiment.neutral_pct}
                        total={data.sentiment.headline_count}
                      />
                    ) : (
                      <p className="py-2 text-sm text-ink-muted">
                        No breakdown — not enough recent news.
                      </p>
                    )}
                  </Panel>
                </div>
              </Reveal>

              {/* Price chart (TradingView widget) */}
              <Reveal delay={0.08}>
                <Panel title="Price" bodyClassName="p-0">
                  <PriceChart symbol={data.symbol} assetClass={data.asset_class} />
                </Panel>
              </Reveal>

              {/* Headlines */}
              <Reveal delay={0.16}>
                <Panel
                  title={`Headlines (${data.headlines.length})`}
                  bodyClassName=""
                >
                  <HeadlineList headlines={data.headlines} />
                </Panel>
              </Reveal>
            </div>
          )}
        </div>

        {/* Right sidebar: watchlist · top movers. Offset down on desktop so it
            lines up with the Analysis panel (past the ticker header). */}
        <aside className="flex flex-col gap-6">
          <Reveal delay={0.1}>
            <Watchlist active={symbol} />
          </Reveal>
          <Reveal delay={0.18}>
            <TopMovers stacked />
          </Reveal>
        </aside>
      </div>
    </main>
  );
}
