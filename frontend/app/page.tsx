import type { Metadata } from "next";

import RecentTickers from "@/components/RecentTickers";
import SearchBar from "@/components/SearchBar";
import TopMovers from "@/components/TopMovers";

export const metadata: Metadata = { title: "MarketPulse" };

export default function Home() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-12 md:py-20">
      <header className="text-center">
        <h1 className="text-3xl font-semibold tracking-tight">MarketPulse</h1>
        <p className="mt-2 text-sm text-ink-muted">
          News-driven sentiment for stocks, crypto &amp; commodities.
        </p>
      </header>

      <div className="mx-auto mt-8 max-w-xl">
        <SearchBar autoFocus />
        <RecentTickers align="center" showLabel={false} />
      </div>

      <section className="mt-12">
        <h2 className="mb-3 text-[11px] font-medium uppercase tracking-widest text-ink-faint">
          Top Movers
        </h2>
        <TopMovers />
      </section>
    </main>
  );
}
