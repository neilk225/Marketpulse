# MarketPulse

**Real-time, news-driven sentiment analysis for stocks, crypto, and commodities.**

[![Live Demo](https://img.shields.io/badge/▶_Live_Demo-marketpulse.fyi-22c55e?style=for-the-badge)](https://marketpulse.fyi)

MarketPulse reads the latest headlines for any ticker, uses an LLM to score each
one by its likely **impact on the share price** — not just whether it "sounds"
positive — and distills them into a single, confidence-weighted sentiment
reading. Wrapped in a fast, animated dark-terminal interface with live market
movers, watchlists, and price charts.

👉 **Try it live at [marketpulse.fyi](https://marketpulse.fyi)** — no signup, just search a ticker.

<!-- Highest-impact addition: screenshot the live app, save it to docs/screenshot.png,
     then uncomment the line below so it renders here.
![MarketPulse dashboard](docs/screenshot.png)
-->

---

## What makes it interesting

- **Impact-based LLM scoring, not vibe-based.** Each headline is graded on its
  forward price impact *and* a confidence level (high/medium/low). The ticker's
  sentiment is a **confidence-weighted mean**, so a market-wide selloff that
  merely name-drops the company barely moves the gauge, while company-specific
  catalysts do. The model also writes a short analyst-style summary.

- **Engineered to be cheap to run on a public URL.** On-visit LLM scoring is an
  open-ended cost vector, so scoring is **lazy and visit-driven** (no background
  jobs), **cached** and re-scored at most hourly, and capped by a **hard daily
  ceiling** on fresh LLM calls. Repeat views are free and instant.

- **Cloud-reliable data, by design.** All market data comes from **keyed HTTP
  APIs** (Finnhub, Financial Modeling Prep, CoinGecko) rather than scraping —
  chosen specifically so the app isn't IP-blocked when deployed from a data
  center, a failure mode that quietly breaks a lot of finance side-projects.

- **Fast where it counts.** The backend is fully async (FastAPI + asyncpg);
  multi-source news is fetched **concurrently** and outbound calls share a
  **pooled HTTP client**, cutting a cache-miss from ~20s of serial waiting down
  to the slowest single source.

- **A UI with craft.** Dark "terminal" aesthetic where color is used only as
  signal, with orchestrated Framer Motion animations (an animated sentiment
  gauge, staggered reveals, layout-stable loading) — and full `prefers-reduced-motion`
  support so it stays tasteful and accessible.

## How the sentiment engine works

```
ticker ─▶ fetch headlines  (Finnhub + Yahoo/Google RSS, all sources concurrently)
       ─▶ score each one    (OpenRouter · Claude Haiku 4.5, free model fallback)
              · sentiment:  positive / neutral / negative
              · score 0–1:  by forward price impact
              · confidence: high / medium / low
       ─▶ aggregate         (confidence-weighted mean + plain-English summary)
       ─▶ cache             (re-score at most hourly, only when a ticker is opened)
```

## Tech stack

| Layer | Stack |
|---|---|
| **Frontend** | Next.js 14 (App Router), TypeScript, Tailwind CSS, Framer Motion |
| **Backend** | FastAPI (async), SQLAlchemy + asyncpg, PostgreSQL, httpx |
| **AI** | OpenRouter — Claude Haiku 4.5 (primary) + open-model fallback |
| **Data** | Finnhub, Financial Modeling Prep, CoinGecko, TradingView charts |
| **Infra** | Railway (API + Postgres), Vercel (frontend) |

## Architecture

```
┌─────────────┐      REST       ┌──────────────┐     ┌───────────────────────┐
│ Next.js UI  │ ───────────────▶│  FastAPI     │────▶│ Finnhub · FMP · Gecko │  market data
│ (Vercel)    │◀─────────────── │  (Railway)   │────▶│ OpenRouter (LLM)      │  sentiment
└─────────────┘    sentiment    └──────┬───────┘     └───────────────────────┘
                                       │
                                  PostgreSQL  (tickers, scores, headlines, movers cache)
```

## Highlights for the curious

- Confidence-weighted aggregation that shrinks low-confidence headlines toward
  neutral instead of letting noise dominate.
- A read-only batch endpoint powers at-a-glance sentiment on the watchlist
  without ever triggering (paid) scoring.
- On-demand ticker resolution: symbols beyond the seeded universe resolve live,
  get scored on first visit, and become searchable thereafter.
- Layout-stable async loading — content fades into reserved space, so nothing
  jumps as independent data sources arrive at different times.

---

<sub>Built by Neil Khetia · <a href="https://marketpulse.fyi">marketpulse.fyi</a></sub>
