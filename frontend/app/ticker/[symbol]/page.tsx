"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import ErrorState from "@/components/ErrorState";
import HeadlineList from "@/components/HeadlineList";
import { TickerSkeleton } from "@/components/LoadingSkeleton";
import SentimentBreakdown from "@/components/SentimentBreakdown";
import SentimentGauge from "@/components/SentimentGauge";
import StaleBadge from "@/components/StaleBadge";
import { ApiError, getTicker } from "@/lib/api";
import type { TickerResponse } from "@/lib/types";
import { ASSET_LABEL, timeAgo } from "@/lib/utils";

function Panel({
  title,
  children,
  className,
}: {
  title?: string;
  children: React.ReactNode;
  className?: string;
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
      {children}
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
      setData(await getTicker(symbol));
    } catch (e) {
      setError(
        e instanceof ApiError ? e : new ApiError(0, "Unexpected error"),
      );
    } finally {
      setLoading(false);
    }
  }, [symbol]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <main className="mx-auto max-w-6xl px-4 py-6 md:py-10">
      <Link
        href="/"
        className="mb-6 inline-block text-sm text-ink-muted hover:text-ink"
      >
        ← MarketPulse
      </Link>

      {loading && <TickerSkeleton />}

      {!loading && error && (
        <ErrorState
          title={error.status === 404 ? "Ticker not found" : "Couldn't load ticker"}
          message={
            error.status === 404
              ? `We couldn't find ${symbol}. Try a different symbol.`
              : error.status === 422
                ? `"${symbol}" isn't a valid symbol format.`
                : error.message
          }
          onRetry={error.status === 404 || error.status === 422 ? undefined : load}
        />
      )}

      {!loading && !error && data && (
        <div className="space-y-6">
          {/* Header */}
          <header className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-3">
                <h1 className="tabular text-3xl font-semibold tracking-tight">
                  {data.symbol}
                </h1>
                <span className="rounded border border-terminal-border px-1.5 py-0.5 text-[10px] tracking-widest text-ink-muted">
                  {ASSET_LABEL[data.asset_class]}
                </span>
              </div>
              <p className="mt-1 text-sm text-ink-muted">{data.name}</p>
            </div>
            <div className="flex flex-col items-end gap-2">
              {data.stale && data.sentiment && (
                <StaleBadge computedAt={data.sentiment.computed_at} />
              )}
              {data.sentiment && !data.stale && (
                <span className="text-[11px] text-ink-faint">
                  Updated{" "}
                  <span className="tabular">
                    {timeAgo(data.sentiment.computed_at)}
                  </span>
                </span>
              )}
            </div>
          </header>

          {/* Gauge + analysis/breakdown */}
          <div className="grid gap-6 lg:grid-cols-3">
            <Panel
              title="Sentiment"
              className="flex flex-col items-center justify-center p-6 lg:col-span-1"
            >
              {data.sentiment ? (
                <SentimentGauge
                  score={data.sentiment.score}
                  headlineCount={data.sentiment.headline_count}
                />
              ) : (
                <p className="py-10 text-center text-sm text-ink-muted">
                  Live scoring unavailable and no prior score on record.
                </p>
              )}
            </Panel>

            <div className="space-y-6 lg:col-span-2">
              <Panel title="Analysis" className="p-5">
                {data.sentiment?.summary ? (
                  <p className="text-sm leading-relaxed text-ink">
                    {data.sentiment.summary}
                  </p>
                ) : (
                  <p className="text-sm text-ink-muted">
                    {data.sentiment && data.sentiment.headline_count > 0
                      ? "No written analysis available for this score."
                      : "Insufficient news data for sentiment analysis."}
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

              <Panel title="Breakdown" className="p-5">
                {data.sentiment && data.sentiment.headline_count > 0 ? (
                  <SentimentBreakdown
                    positivePct={data.sentiment.positive_pct}
                    negativePct={data.sentiment.negative_pct}
                    neutralPct={data.sentiment.neutral_pct}
                  />
                ) : (
                  <p className="py-2 text-sm text-ink-muted">
                    No breakdown — insufficient news data.
                  </p>
                )}
              </Panel>
            </div>
          </div>

          {/* Headlines */}
          <Panel title={`Headlines (${data.headlines.length})`}>
            <HeadlineList headlines={data.headlines} />
          </Panel>
        </div>
      )}
    </main>
  );
}
