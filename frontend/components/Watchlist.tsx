"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import {
  getWatchlist,
  removeFromWatchlist,
  WATCHLIST_EVENT,
} from "@/lib/watchlist";

/** localStorage watchlist sidebar. `active` highlights the ticker currently
 *  being viewed. Re-reads on same-tab mutations (WATCHLIST_EVENT) and cross-tab
 *  changes (native storage event). Empty (with a hint) until the user stars one. */
export default function Watchlist({ active }: { active?: string }) {
  const [items, setItems] = useState<string[]>([]);

  useEffect(() => {
    const read = () => setItems(getWatchlist());
    read();
    window.addEventListener(WATCHLIST_EVENT, read);
    window.addEventListener("storage", read);
    return () => {
      window.removeEventListener(WATCHLIST_EVENT, read);
      window.removeEventListener("storage", read);
    };
  }, []);

  const activeSym = active?.toUpperCase();

  return (
    <section className="rounded-lg border border-terminal-border bg-terminal-panel">
      <h2 className="border-b border-terminal-border px-4 py-2.5 text-[11px] font-medium uppercase tracking-widest text-ink-faint">
        Watchlist
      </h2>
      {items.length === 0 ? (
        <p className="px-4 py-4 text-xs leading-relaxed text-ink-faint">
          No tickers yet. Star a ticker to pin it here.
        </p>
      ) : (
        <ul>
          {items.map((sym) => (
            <li
              key={sym}
              className="flex items-center border-b border-terminal-border last:border-0"
            >
              <Link
                href={`/ticker/${encodeURIComponent(sym)}`}
                className={`tabular flex-1 px-4 py-2 text-sm hover:bg-terminal-hover ${
                  sym === activeSym ? "text-ink" : "text-ink-muted"
                }`}
              >
                {sym}
              </Link>
              <button
                onClick={() => removeFromWatchlist(sym)}
                aria-label={`Remove ${sym} from watchlist`}
                className="px-3 py-2 text-ink-faint hover:text-bear"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
