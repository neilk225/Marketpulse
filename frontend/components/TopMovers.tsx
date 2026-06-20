"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { Skeleton } from "@/components/LoadingSkeleton";
import { getMovers } from "@/lib/api";
import type { Mover, MoversResponse } from "@/lib/types";
import { cx, formatPrice, formatSignedPct, timeAgo } from "@/lib/utils";

type Tab = "stocks" | "crypto" | "commodities";
const TABS: { key: Tab; label: string }[] = [
  { key: "stocks", label: "Stocks" },
  { key: "crypto", label: "Crypto" },
  { key: "commodities", label: "Commodities" },
];

function MoverRow({ m }: { m: Mover }) {
  const up = m.change_pct >= 0;
  return (
    <Link
      href={`/ticker/${encodeURIComponent(m.symbol)}`}
      className="flex items-center gap-3 border-b border-terminal-border px-4 py-2.5 last:border-0 hover:bg-terminal-hover"
    >
      <div className="min-w-0 flex-1">
        <div className="tabular text-sm font-medium text-ink">{m.symbol}</div>
        <div className="truncate text-[11px] text-ink-faint">{m.name}</div>
      </div>
      <div className="shrink-0 text-right">
        <div className="tabular text-sm text-ink-muted">
          {formatPrice(m.price)}
        </div>
        <div
          className={cx(
            "tabular text-[11px] font-medium",
            up ? "text-bull" : "text-bear",
          )}
        >
          {formatSignedPct(m.change_pct)}
        </div>
      </div>
    </Link>
  );
}

function MoverColumn({ rows }: { rows: Mover[] }) {
  return (
    <div className="min-w-0">
      {rows.length > 0 ? (
        rows.map((m) => <MoverRow key={m.symbol} m={m} />)
      ) : (
        <div className="px-4 py-3 text-xs text-ink-faint">No data.</div>
      )}
    </div>
  );
}

function ColumnSkeleton() {
  return (
    <div className="space-y-2 px-4 py-3">
      {Array.from({ length: 5 }).map((_, i) => (
        <Skeleton key={i} className="h-9 w-full" />
      ))}
    </div>
  );
}

export default function TopMovers({ stacked = false }: { stacked?: boolean }) {
  const [tab, setTab] = useState<Tab>("stocks");
  const [data, setData] = useState<MoversResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  // Cache each tab's payload so re-selecting a tab doesn't refetch.
  const cache = useRef<Partial<Record<Tab, MoversResponse>>>({});

  useEffect(() => {
    let cancelled = false;
    const cached = cache.current[tab];
    if (cached) {
      setData(cached);
      setLoading(false);
      setError(false);
      return;
    }
    setLoading(true);
    setError(false);
    getMovers(tab)
      .then((d) => {
        if (cancelled) return;
        cache.current[tab] = d;
        setData(d);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [tab]);

  return (
    <section className="rounded-lg border border-terminal-border bg-terminal-panel">
      <div className="flex items-center justify-between border-b border-terminal-border px-2">
        <div className="flex">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={cx(
                "border-b-2 px-3 py-2.5 text-xs font-medium transition-colors",
                tab === t.key
                  ? "border-ink text-ink"
                  : "border-transparent text-ink-faint hover:text-ink-muted",
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
        {data?.cached_at && !loading && !error && (
          <span className="px-2 text-[10px] text-ink-faint">
            {timeAgo(data.cached_at)}
          </span>
        )}
      </div>

      {(() => {
        // Right rail (stacked): gainers above losers, single column. Home/wide
        // (split): two columns side by side. Color (green/red %) marks each side.
        const cols = stacked
          ? "grid grid-cols-1 divide-y divide-terminal-border"
          : "grid grid-cols-1 divide-y divide-terminal-border sm:grid-cols-2 sm:divide-x sm:divide-y-0";
        if (loading)
          return (
            <div className={cols}>
              <ColumnSkeleton />
              <ColumnSkeleton />
            </div>
          );
        if (error)
          return (
            <div className="px-4 py-8 text-center text-sm text-ink-muted">
              Market data temporarily unavailable.
            </div>
          );
        return (
          <div className={cols}>
            <MoverColumn rows={data?.gainers ?? []} />
            <MoverColumn rows={data?.losers ?? []} />
          </div>
        );
      })()}
    </section>
  );
}
