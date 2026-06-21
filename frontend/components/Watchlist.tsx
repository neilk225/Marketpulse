"use client";

import { AnimatePresence, motion } from "framer-motion";
import Link from "next/link";
import { useEffect, useState } from "react";

import {
  getWatchlist,
  removeFromWatchlist,
  WATCHLIST_EVENT,
} from "@/lib/watchlist";
import { getCachedSentiments } from "@/lib/api";
import { pushRecent } from "@/lib/recents";
import { Skeleton } from "@/components/LoadingSkeleton";
import type { CachedSentiment } from "@/lib/types";
import { EASE_OUT, formatScore, scoreHex } from "@/lib/utils";

/** localStorage watchlist sidebar. `active` highlights the ticker currently
 *  being viewed. Re-reads on same-tab mutations (WATCHLIST_EVENT) and cross-tab
 *  changes (native storage event). Empty (with a hint) until the user stars one.
 *  Each row shows its latest STORED sentiment (read-only batch fetch — never
 *  triggers scoring, so it's free). */
export default function Watchlist({ active }: { active?: string }) {
  const [items, setItems] = useState<string[]>([]);
  const [itemsLoaded, setItemsLoaded] = useState(false);
  const [sentiments, setSentiments] = useState<
    Record<string, CachedSentiment>
  >({});
  const [sentLoading, setSentLoading] = useState(false);

  useEffect(() => {
    const read = () => {
      setItems(getWatchlist());
      setItemsLoaded(true);
    };
    read();
    window.addEventListener(WATCHLIST_EVENT, read);
    window.addEventListener("storage", read);
    return () => {
      window.removeEventListener(WATCHLIST_EVENT, read);
      window.removeEventListener("storage", read);
    };
  }, []);

  // Pull cached sentiment whenever the set of symbols changes.
  const symbolsKey = items.join(",");
  useEffect(() => {
    if (!symbolsKey) {
      setSentiments({});
      setSentLoading(false);
      return;
    }
    let cancelled = false;
    setSentLoading(true);
    getCachedSentiments(symbolsKey.split(","))
      .then((s) => {
        if (!cancelled) setSentiments(s);
      })
      .catch(() => {
        /* leave readings blank on failure — the list still works */
      })
      .finally(() => {
        if (!cancelled) setSentLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [symbolsKey]);

  const activeSym = active?.toUpperCase();

  return (
    <section className="rounded-lg border border-terminal-border bg-terminal-panel">
      <h2 className="border-b border-terminal-border px-4 py-2.5 text-[11px] font-medium uppercase tracking-widest text-ink-faint">
        Watchlist
      </h2>
      {!itemsLoaded ? (
        <ul>
          {Array.from({ length: 3 }).map((_, i) => (
            <li
              key={i}
              className="flex items-center justify-between border-b border-terminal-border px-4 py-2.5 last:border-0"
            >
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-3 w-8" />
            </li>
          ))}
        </ul>
      ) : items.length === 0 ? (
        <p className="px-4 py-4 text-xs leading-relaxed text-ink-faint">
          No tickers yet. Star a ticker to pin it here.
        </p>
      ) : (
        <ul>
          <AnimatePresence initial={false}>
            {items.map((sym) => (
              <motion.li
                key={sym}
                layout
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                // Exit faster than enter — the system responding should feel
                // snappier than the user-initiated add.
                exit={{ opacity: 0, height: 0, transition: { duration: 0.18, ease: EASE_OUT } }}
                transition={{ duration: 0.25, ease: EASE_OUT }}
                className="flex items-center overflow-hidden border-b border-terminal-border last:border-0"
              >
              <Link
                href={`/ticker/${encodeURIComponent(sym)}`}
                onClick={() => pushRecent(sym)}
                className={`press flex flex-1 items-center gap-2 px-4 py-2 text-sm hover:bg-terminal-hover active:scale-[0.99] ${
                  sym === activeSym ? "text-ink" : "text-ink-muted"
                }`}
              >
                <span className="tabular">{sym}</span>
                {/* Fixed-width slot so number / shimmer / dash all occupy the
                    same space — the row never resizes as the reading resolves. */}
                <span className="ml-auto flex w-9 justify-end text-xs">
                  {sentiments[sym] ? (
                    <span
                      className="tabular"
                      style={{
                        color: scoreHex(sentiments[sym].score),
                        opacity: sentiments[sym].stale ? 0.6 : 1,
                      }}
                      title={
                        sentiments[sym].stale
                          ? "Last reading (may be stale)"
                          : "Current sentiment"
                      }
                    >
                      {formatScore(sentiments[sym].score)}
                    </span>
                  ) : sentLoading ? (
                    <Skeleton className="h-3 w-8" />
                  ) : (
                    <span
                      className="text-ink-faint"
                      title="Not scored yet — open it to generate a reading"
                    >
                      —
                    </span>
                  )}
                </span>
              </Link>
              <button
                onClick={() => removeFromWatchlist(sym)}
                aria-label={`Remove ${sym} from watchlist`}
                className="press px-3 py-2 text-ink-faint hover:text-bear active:scale-90"
              >
                ×
              </button>
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      )}
    </section>
  );
}
