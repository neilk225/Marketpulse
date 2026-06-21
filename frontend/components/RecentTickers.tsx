"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { useEffect, useState } from "react";

import { getRecents } from "@/lib/recents";
import { getCachedSentiments } from "@/lib/api";
import ScoreValue from "@/components/ScoreValue";
import type { CachedSentiment } from "@/lib/types";
import { EASE_OUT } from "@/lib/utils";

const MotionLink = motion.create(Link);

/** Recently viewed tickers from localStorage. Empty (renders nothing) until the
 *  user has opened at least one ticker. `exclude` drops the given symbol (e.g.
 *  the ticker currently being viewed) and doubles as a re-read trigger when the
 *  user navigates between tickers. `align` controls chip justification and
 *  `showLabel` toggles the "Recent" caption. */
export default function RecentTickers({
  exclude,
  align = "center",
  showLabel = true,
  className = "mt-4",
}: {
  exclude?: string;
  align?: "left" | "center" | "right";
  showLabel?: boolean;
  className?: string;
}) {
  const [recents, setRecents] = useState<string[]>([]);
  const [sentiments, setSentiments] = useState<
    Record<string, CachedSentiment>
  >({});

  useEffect(() => {
    setRecents(getRecents());
  }, [exclude]);

  const ex = exclude?.toUpperCase();
  const shown = ex ? recents.filter((s) => s !== ex) : recents;

  // Cached sentiment for the shown chips (read-only — no scoring triggered).
  const shownKey = shown.join(",");
  useEffect(() => {
    if (!shownKey) {
      setSentiments({});
      return;
    }
    let cancelled = false;
    getCachedSentiments(shownKey.split(","))
      .then((s) => {
        if (!cancelled) setSentiments(s);
      })
      .catch(() => {
        /* chips still work without readings */
      });
    return () => {
      cancelled = true;
    };
  }, [shownKey]);

  if (shown.length === 0) return null;

  return (
    <div className={className}>
      {showLabel && (
        <div
          className={`mb-1.5 text-[10px] font-medium uppercase tracking-widest text-ink-faint ${
            align === "right"
              ? "text-right"
              : align === "left"
                ? "text-left"
                : "text-center"
          }`}
        >
          Recently searched
        </div>
      )}
      <div
        className={`flex flex-wrap gap-2 ${
          align === "right"
            ? "justify-end"
            : align === "left"
              ? "justify-start"
              : "justify-center"
        }`}
      >
        {shown.map((s, i) => (
          <MotionLink
            key={s}
            href={`/ticker/${encodeURIComponent(s)}`}
            className="tabular flex items-center gap-1.5 rounded border border-terminal-border px-2 py-0.5 text-xs text-ink-muted hover:bg-terminal-hover hover:text-ink"
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            whileTap={{ scale: 0.96 }}
            transition={{ duration: 0.25, ease: EASE_OUT, delay: i * 0.04 }}
          >
            <span>{s}</span>
            {/* Fixed-width slot: the score fades in here without widening the
                chip, so a late reading never reflows the row. */}
            <span className="w-7 text-right">
              {sentiments[s] && (
                <ScoreValue
                  score={sentiments[s].score}
                  stale={sentiments[s].stale}
                />
              )}
            </span>
          </MotionLink>
        ))}
      </div>
    </div>
  );
}
