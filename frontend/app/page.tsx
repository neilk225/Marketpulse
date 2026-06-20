import type { Metadata } from "next";

import RecentTickers from "@/components/RecentTickers";
import SearchBar from "@/components/SearchBar";
import TopMovers from "@/components/TopMovers";
import Watchlist from "@/components/Watchlist";

export const metadata: Metadata = { title: "MarketPulse" };

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center px-4 py-12">
      <header className="text-center">
        <h1 className="text-4xl font-semibold tracking-tight md:text-5xl">
          MarketPulse
        </h1>
        <p className="mt-3 text-base text-ink-muted">
          News-driven sentiment for stocks, crypto &amp; commodities.
        </p>
      </header>

      <div className="mx-auto mt-10 w-full max-w-2xl">
        <SearchBar autoFocus size="lg" />
        <RecentTickers align="center" showLabel={false} />
      </div>

      <section className="mt-14">
        <h2 className="mb-3 text-[11px] font-medium uppercase tracking-widest text-ink-faint">
          Top Movers
        </h2>
        <TopMovers />
      </section>

      <section className="mt-8">
        <Watchlist />
      </section>
    </main>
  );
}
