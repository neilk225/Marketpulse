"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import WatchlistStar from "@/components/WatchlistStar";
import { searchTickers } from "@/lib/api";
import type { SearchResult } from "@/lib/types";
import { ASSET_LABEL, cx } from "@/lib/utils";

const DEBOUNCE_MS = 200;

export default function SearchBar({
  autoFocus = false,
  size = "md",
}: {
  autoFocus?: boolean;
  size?: "md" | "lg";
}) {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(-1);

  const boxRef = useRef<HTMLDivElement>(null);
  const reqId = useRef(0);

  // Debounced autocomplete against /api/search.
  useEffect(() => {
    const q = value.trim();
    if (!q) {
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const id = ++reqId.current;
    const t = setTimeout(async () => {
      try {
        const r = await searchTickers(q);
        if (id === reqId.current) {
          setResults(r);
          setActive(-1);
        }
      } catch {
        if (id === reqId.current) setResults([]);
      } finally {
        if (id === reqId.current) setLoading(false);
      }
    }, DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [value]);

  // Close the dropdown on outside click.
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  function go(symbol: string) {
    const sym = symbol.trim().toUpperCase();
    if (!sym) return;
    setOpen(false);
    router.push(`/ticker/${encodeURIComponent(sym)}`);
  }

  // A symbol-shaped query gets a direct "look up" row (covers unseeded tickers).
  const trimmed = value.trim();
  const lookupSymbol = /^[A-Za-z0-9.\-=^]{1,15}$/.test(trimmed)
    ? trimmed.toUpperCase()
    : "";
  // Items in the dropdown = results, plus the lookup row when present.
  const itemCount = results.length + (lookupSymbol ? 1 : 0);

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") {
      setOpen(false);
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      if (active >= 0 && active < results.length) go(results[active].symbol);
      else go(lookupSymbol || value);
      return;
    }
    if (!open || itemCount === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => (a + 1) % itemCount);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => (a <= 0 ? itemCount - 1 : a - 1));
    }
  }

  const showDropdown = open && value.trim().length > 0;

  return (
    <div ref={boxRef} className="relative w-full">
      <input
        autoFocus={autoFocus}
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        placeholder="Search a symbol or name — AAPL, Bitcoin, Gold…"
        className={cx(
          "w-full rounded-lg border border-terminal-border bg-terminal-panel outline-none placeholder:text-ink-faint focus:border-ink-faint",
          size === "lg" ? "px-5 py-4 text-base" : "px-4 py-3 text-sm",
        )}
        role="combobox"
        aria-expanded={showDropdown}
        aria-controls="search-listbox"
        autoComplete="off"
      />

      <AnimatePresence>
        {showDropdown && (
          <motion.div
            id="search-listbox"
            role="listbox"
            className="absolute z-20 mt-1 max-h-80 w-full overflow-y-auto rounded-lg border border-terminal-border bg-terminal-panel shadow-xl"
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
          >
          {loading && results.length === 0 && (
            <div className="px-4 py-3 text-sm text-ink-faint">Searching…</div>
          )}
          {results.map((r, i) => (
            <div
              key={r.symbol}
              role="option"
              aria-selected={i === active}
              onMouseEnter={() => setActive(i)}
              className={cx(
                "flex w-full items-center gap-3 px-4 py-2.5",
                i === active ? "bg-terminal-hover" : "hover:bg-terminal-hover",
              )}
            >
              <button
                onClick={() => go(r.symbol)}
                className="flex min-w-0 flex-1 items-center gap-3 text-left"
              >
                <span className="tabular w-20 shrink-0 text-sm font-medium text-ink">
                  {r.symbol}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm text-ink-muted">
                  {r.name}
                </span>
                <span className="shrink-0 rounded border border-terminal-border px-1.5 py-0.5 text-[10px] tracking-widest text-ink-faint">
                  {ASSET_LABEL[r.asset_class]}
                </span>
              </button>
              <WatchlistStar symbol={r.symbol} className="text-base" />
            </div>
          ))}

          {/* Always offer a direct lookup of the typed symbol — covers tickers
              outside the seeded set (e.g. ASTS); the ticker page resolves it. */}
          {lookupSymbol && (
            <button
              role="option"
              aria-selected={active === results.length}
              onMouseEnter={() => setActive(results.length)}
              onClick={() => go(lookupSymbol)}
              className={cx(
                "flex w-full items-center gap-2 border-t border-terminal-border px-4 py-2.5 text-left text-sm",
                active === results.length
                  ? "bg-terminal-hover"
                  : "hover:bg-terminal-hover",
              )}
            >
              <span className="text-ink-muted">
                {results.length === 0 && !loading ? "Look up" : "Go to"}
              </span>
              <span className="tabular font-medium text-ink">{lookupSymbol}</span>
              <span className="ml-auto text-ink-faint">↵</span>
            </button>
          )}

          {loading && results.length === 0 && !lookupSymbol && (
            <div className="px-4 py-3 text-sm text-ink-faint">Searching…</div>
          )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
