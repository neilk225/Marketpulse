"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

// Minimal placeholder home for Phase 2a — full SearchBar autocomplete + Top
// Movers panel land in Phase 2b. This just lets us reach ticker pages to test.
const SAMPLES = ["AAPL", "TTWO", "BTC", "HBAR"];

export default function Home() {
  const router = useRouter();
  const [value, setValue] = useState("");

  const go = (e: React.FormEvent) => {
    e.preventDefault();
    const sym = value.trim().toUpperCase();
    if (sym) router.push(`/ticker/${encodeURIComponent(sym)}`);
  };

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center px-4">
      <h1 className="text-2xl font-semibold tracking-tight">MarketPulse</h1>
      <p className="mt-1 text-sm text-ink-muted">
        News-driven sentiment for stocks, crypto &amp; commodities.
      </p>

      <form onSubmit={go} className="mt-6 flex gap-2">
        <input
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Enter a symbol (e.g. AAPL)"
          className="tabular flex-1 rounded border border-terminal-border bg-terminal-panel px-3 py-2 text-sm outline-none placeholder:text-ink-faint focus:border-ink-faint"
        />
        <button
          type="submit"
          className="rounded border border-terminal-border px-4 py-2 text-sm text-ink-muted hover:bg-terminal-hover hover:text-ink"
        >
          View
        </button>
      </form>

      <div className="mt-4 flex flex-wrap gap-2">
        {SAMPLES.map((s) => (
          <Link
            key={s}
            href={`/ticker/${s}`}
            className="tabular rounded border border-terminal-border px-2.5 py-1 text-xs text-ink-muted hover:bg-terminal-hover hover:text-ink"
          >
            {s}
          </Link>
        ))}
      </div>
    </main>
  );
}
