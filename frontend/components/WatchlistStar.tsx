"use client";

import { useEffect, useState } from "react";

import { isInWatchlist, toggleWatchlist, WATCHLIST_EVENT } from "@/lib/watchlist";

/** Star toggle that adds/removes the current symbol from the watchlist. Stays in
 *  sync if the symbol is removed elsewhere (e.g. the sidebar ×). */
export default function WatchlistStar({
  symbol,
  className = "text-lg",
}: {
  symbol: string;
  className?: string;
}) {
  const [on, setOn] = useState(false);

  useEffect(() => {
    const read = () => setOn(isInWatchlist(symbol));
    read();
    window.addEventListener(WATCHLIST_EVENT, read);
    return () => window.removeEventListener(WATCHLIST_EVENT, read);
  }, [symbol]);

  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        setOn(toggleWatchlist(symbol));
      }}
      aria-label={on ? "Remove from watchlist" : "Add to watchlist"}
      aria-pressed={on}
      title={on ? "In watchlist" : "Add to watchlist"}
      className={`${className} press leading-none active:scale-90 ${
        on ? "text-neutral" : "text-ink-faint hover:text-ink-muted"
      }`}
    >
      {on ? "★" : "☆"}
    </button>
  );
}
