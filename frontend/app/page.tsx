import type { Metadata } from "next";

import RecentTickers from "@/components/RecentTickers";
import SearchBar from "@/components/SearchBar";
import TopMovers from "@/components/TopMovers";
import Watchlist from "@/components/Watchlist";
import { Reveal } from "@/components/Motion";

export const metadata: Metadata = { title: "MarketPulse" };

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center px-4 py-12">
      <Reveal className="text-center">
        <h1 className="text-4xl font-semibold tracking-tight md:text-5xl">
          MarketPulse
        </h1>
        <p className="mt-3 text-base text-ink-muted">
          News-driven sentiment for stocks, crypto &amp; commodities.
        </p>
      </Reveal>

      <Reveal delay={0.08} className="mx-auto mt-10 w-full max-w-2xl">
        <SearchBar autoFocus size="lg" />
        <RecentTickers align="center" />
      </Reveal>

      <Reveal delay={0.16} className="mt-12">
        <TopMovers />
      </Reveal>

      <Reveal delay={0.24} className="mt-8">
        <Watchlist />
      </Reveal>
    </main>
  );
}
