import type { Metadata } from "next";

import PulseMark from "@/components/PulseMark";
import RecentTickers from "@/components/RecentTickers";
import SearchBar from "@/components/SearchBar";
import { Reveal } from "@/components/Motion";

export const metadata: Metadata = { title: "MarketPulse" };

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center px-4 py-8">
      <Reveal className="text-center">
        <div className="flex items-center justify-center gap-3 md:gap-4">
          <PulseMark size={96} className="h-14 w-14 md:h-24 md:w-24" />
          <h1 className="text-4xl font-semibold tracking-tight md:text-6xl">
            MarketPulse
          </h1>
        </div>
        <p className="mt-3 text-base text-ink-muted md:mt-4 md:text-lg">
          News-driven sentiment for stocks, crypto &amp; commodities.
        </p>
      </Reveal>

      <Reveal delay={0.08} className="mx-auto mt-8 w-full max-w-2xl md:mt-10">
        <SearchBar autoFocus size="lg" />
        <RecentTickers align="center" className="mt-6 md:mt-8" />
      </Reveal>
    </main>
  );
}
