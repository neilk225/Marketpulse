"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { getRecents } from "@/lib/recents";

/** Recently viewed tickers from localStorage. Empty (renders nothing) until the
 *  user has opened at least one ticker. `exclude` drops the given symbol (e.g.
 *  the ticker currently being viewed) and doubles as a re-read trigger when the
 *  user navigates between tickers. `align` controls chip justification and
 *  `showLabel` toggles the "Recent" caption. */
export default function RecentTickers({
  exclude,
  align = "center",
  showLabel = true,
}: {
  exclude?: string;
  align?: "left" | "center" | "right";
  showLabel?: boolean;
}) {
  const [recents, setRecents] = useState<string[]>([]);

  useEffect(() => {
    setRecents(getRecents());
  }, [exclude]);

  const ex = exclude?.toUpperCase();
  const shown = ex ? recents.filter((s) => s !== ex) : recents;
  if (shown.length === 0) return null;

  return (
    <div className="mt-4">
      {showLabel && (
        <div className="mb-1.5 text-[10px] font-medium uppercase tracking-widest text-ink-faint">
          Recent
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
        {shown.map((s) => (
          <Link
            key={s}
            href={`/ticker/${encodeURIComponent(s)}`}
            className="tabular rounded border border-terminal-border px-2 py-0.5 text-xs text-ink-muted hover:bg-terminal-hover hover:text-ink"
          >
            {s}
          </Link>
        ))}
      </div>
    </div>
  );
}
