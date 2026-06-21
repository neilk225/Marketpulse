import type { Metadata } from "next";

import PulseMark from "@/components/PulseMark";
import RecentTickers from "@/components/RecentTickers";
import SearchBar from "@/components/SearchBar";
import { Reveal } from "@/components/Motion";

export const metadata: Metadata = { title: "MarketPulse" };

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center px-4 py-12">
      <Reveal className="text-center">
        <div className="flex items-center justify-center gap-4">
          <PulseMark size={96} />
          <h1 className="text-5xl font-semibold tracking-tight md:text-6xl">
            MarketPulse
          </h1>
        </div>
        <p className="mt-4 text-lg text-ink-muted">
          News-driven sentiment for stocks, crypto &amp; commodities.
        </p>
      </Reveal>

      <Reveal delay={0.08} className="mx-auto mt-10 w-full max-w-2xl">
        <SearchBar autoFocus size="lg" />
        <RecentTickers align="center" className="mt-8" />
      </Reveal>
    </main>
  );
}
