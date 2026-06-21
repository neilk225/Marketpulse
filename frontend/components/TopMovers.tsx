"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { Skeleton } from "@/components/LoadingSkeleton";
import { getMovers } from "@/lib/api";
import { pushRecent } from "@/lib/recents";
import type { Mover, MoversResponse } from "@/lib/types";
import { cx, EASE_OUT, formatPrice, formatSignedPct, timeAgo } from "@/lib/utils";

type Tab = "stocks" | "crypto" | "commodities";
const TABS: { key: Tab; label: string }[] = [
  { key: "stocks", label: "Stocks" },
  { key: "crypto", label: "Crypto" },
  { key: "commodities", label: "Commodities" },
];

const MotionLink = motion.create(Link);

function MoverRow({ m }: { m: Mover }) {
  const up = m.change_pct >= 0;
  return (
    <MotionLink
      href={`/ticker/${encodeURIComponent(m.symbol)}`}
      onClick={() => pushRecent(m.symbol)}
      className="flex items-center gap-3 border-b border-terminal-border px-4 py-2.5 last:border-0 hover:bg-terminal-hover"
      whileTap={{ scale: 0.985 }}
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
    </MotionLink>
  );
}

function MoverColumn({ rows }: { rows: Mover[] }) {
  return (
    <div className="min-w-0">
      {rows.length > 0 ? (
        rows.map((m) => <MoverRow key={m.symbol} m={m} />)
      ) : (
        <div className="px-4 py-3 text-xs text-ink-faint">
          No movers to show right now.
        </div>
      )}
    </div>
  );
}

/** Mirrors MoverRow's exact layout/height so the skeleton→data swap never
 *  changes the column's size — no jump when the fetch lands. */
function ColumnSkeleton() {
  return (
    <div>
      {Array.from({ length: 5 }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-3 border-b border-terminal-border px-4 py-2.5 last:border-0"
        >
          <div className="min-w-0 flex-1 space-y-1.5">
            <Skeleton className="h-3.5 w-16" />
            <Skeleton className="h-2.5 w-24" />
          </div>
          <div className="flex flex-col items-end space-y-1.5">
            <Skeleton className="h-3.5 w-12" />
            <Skeleton className="h-2.5 w-10" />
          </div>
        </div>
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
  // Direction of the last tab change (-1 left, +1 right). Frozen at click time
  // so the content panel slides toward the new category even though the data
  // arrives a render later (async). 0 = first load → fade only, no slide.
  const slideDir = useRef(0);

  function selectTab(next: Tab) {
    if (next === tab) return;
    const from = TABS.findIndex((t) => t.key === tab);
    const to = TABS.findIndex((t) => t.key === next);
    slideDir.current = Math.sign(to - from);
    setTab(next);
  }

  // Active-tab underline driven by the measured tab offset (not a shared
  // layoutId). layoutId measures absolute position, so on the centered home
  // page a tab-switch reflow made it slide vertically. Animating only left/width
  // off the button's own offset keeps the motion strictly horizontal. `animate`
  // is false on the first measure (and on resize) so it snaps instead of sliding.
  const tabRefs = useRef<Record<Tab, HTMLButtonElement | null>>({
    stocks: null,
    crypto: null,
    commodities: null,
  });
  const [underline, setUnderline] = useState({ left: 0, width: 0, animate: false });

  useEffect(() => {
    const el = tabRefs.current[tab];
    if (el) {
      setUnderline((u) => ({
        left: el.offsetLeft,
        width: el.offsetWidth,
        animate: u.width !== 0,
      }));
    }
  }, [tab]);

  useEffect(() => {
    function onResize() {
      const el = tabRefs.current[tab];
      if (el)
        setUnderline({ left: el.offsetLeft, width: el.offsetWidth, animate: false });
    }
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [tab]);

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
    <section className="overflow-hidden rounded-lg border border-terminal-border bg-terminal-panel">
      <h2 className="border-b border-terminal-border px-4 py-2.5 text-[11px] font-medium uppercase tracking-widest text-ink-faint">
        Top Movers
      </h2>
      <div className="flex items-center justify-between border-b border-terminal-border px-2">
        <div className="relative flex">
          {TABS.map((t) => (
            <button
              key={t.key}
              ref={(el) => {
                tabRefs.current[t.key] = el;
              }}
              onClick={() => selectTab(t.key)}
              className={cx(
                "press px-3 py-2.5 text-xs font-medium active:scale-[0.97]",
                tab === t.key ? "text-ink" : "text-ink-faint hover:text-ink-muted",
              )}
            >
              {t.label}
            </button>
          ))}
          <span
            aria-hidden
            className={cx(
              "absolute -bottom-px h-0.5 bg-ink",
              underline.animate &&
                "transition-[left,width] duration-300 ease-[cubic-bezier(0.23,1,0.32,1)]",
            )}
            style={{ left: underline.left, width: underline.width }}
          />
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
              Market data is temporarily unavailable. Try again in a moment.
            </div>
          );
        return (
          // Keyed by tab so it remounts on switch; slides side-to-side toward
          // the new category (no vertical motion). First load (dir 0) just fades.
          <motion.div
            className={cols}
            key={tab}
            initial={{ opacity: 0, x: slideDir.current * 14 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.2, ease: EASE_OUT }}
          >
            <MoverColumn rows={data?.gainers ?? []} />
            <MoverColumn rows={data?.losers ?? []} />
          </motion.div>
        );
      })()}
    </section>
  );
}
