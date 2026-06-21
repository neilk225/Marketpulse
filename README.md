# MarketPulse

**News-driven sentiment analysis for stocks, crypto, and commodities.**

MarketPulse pulls recent headlines for any ticker, scores each one by its likely
**impact on the share price** (not just tone) with an LLM, and rolls them into a
single confidence-weighted sentiment reading — presented as a terminal-styled
dashboard with live market movers, a watchlist, and price charts.

<!-- Add a screenshot here once deployed:
![MarketPulse](docs/screenshot.png)
-->

> **Live demo:** _add your deployed URL here_

---

## Features

- **Per-ticker sentiment** — a 5-band gauge (bearish → bullish), a plain-English
  analysis summary, a positive/neutral/negative breakdown, and the scored
  headlines behind it.
- **Impact-based scoring** — each headline is graded by its forward price impact
  and a confidence level; the aggregate is a confidence-weighted mean, so
  market-wide noise barely moves the needle while company-specific news does.
- **Live market movers** — top gainers/losers across stocks, crypto, and
  commodities, each one clickable through to its sentiment.
- **Search anything** — autocomplete over a seeded universe plus live lookup, so
  tickers beyond the seed resolve on demand.
- **Watchlist & recents** — pin tickers and see their latest cached sentiment at
  a glance (stored locally, no account needed).
- **Price charts** — embedded TradingView advanced chart per ticker.
- **Built-in cost controls** — sentiment is cached and re-scored at most hourly,
  with a hard daily ceiling on fresh LLM calls.

## How the sentiment pipeline works

```
ticker ─▶ fetch headlines (Finnhub + Yahoo/Google RSS, concurrently)
       ─▶ score each headline via OpenRouter (Claude Haiku 4.5, free fallback)
              · sentiment: positive / neutral / negative
              · score 0–1 by forward price impact
              · confidence: high / medium / low
       ─▶ confidence-weighted aggregate + summary
       ─▶ cache (re-score at most once per hour, on visit)
```

A score is only computed when a ticker is actually opened (lazy, visit-driven —
no background jobs), and results are cached, so repeat views are free and fast.

## Tech stack

**Backend** — FastAPI (async), SQLAlchemy + asyncpg on PostgreSQL, httpx,
feedparser. Sentiment via OpenRouter. Market data from keyed HTTP APIs
(Finnhub, Financial Modeling Prep, CoinGecko) — no scraping, so it runs from any
host IP.

**Frontend** — Next.js 14 (App Router) + TypeScript, Tailwind CSS, Framer Motion.
Dark "terminal" aesthetic where color is used only as signal.

## Getting started (local)

### Prerequisites
- Python 3.13, Node 18+
- A PostgreSQL database (local, or a hosted one e.g. Railway/Neon/Supabase)
- API keys: [OpenRouter](https://openrouter.ai), [Finnhub](https://finnhub.io),
  [Financial Modeling Prep](https://financialmodelingprep.com),
  [CoinGecko](https://www.coingecko.com/en/api) (Demo tier)

### Backend
```bash
cd backend
python -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env        # then fill in your values
python scripts/seed_tickers.py        # one-time: load the ticker universe
python -m uvicorn main:app --host 127.0.0.1 --port 8000
```

### Frontend
```bash
cd frontend
npm install
echo "NEXT_PUBLIC_API_URL=http://127.0.0.1:8000" > .env.local
npm run dev      # http://localhost:3000
```

### Environment variables

**Backend** (`backend/.env`)

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `OPENROUTER_API_KEY` | LLM sentiment scoring |
| `FINNHUB_API_KEY` | search, quotes, company news |
| `FMP_API_KEY` | stock movers |
| `COINGECKO_API_KEY` | crypto movers (Demo tier) |
| `SCORING_DAILY_CAP` | max fresh LLM scorings per day (default 300) |
| `ALLOWED_ORIGINS` | comma-separated CORS origins |

**Frontend** (`frontend/.env.local`)

| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_API_URL` | base URL of the backend API |

## API

| Endpoint | Description |
|---|---|
| `GET /api/search?q=` | Ticker autocomplete (local + live) |
| `GET /api/ticker/{symbol}` | Sentiment, summary, and headlines for a ticker |
| `GET /api/movers/{stocks\|crypto\|commodities}` | Top gainers/losers |
| `GET /api/sentiment/batch?symbols=` | Latest cached sentiment for many symbols |
| `GET /health` | Health check |

## Project structure

```
backend/          FastAPI app
  routers/        search, ticker, movers endpoints
  services/       news, sentiment, market data, http client, cache
  models/         SQLAlchemy models + async engine
  scripts/        ticker seeder
frontend/         Next.js app
  app/            routes (home, ticker page)
  components/     gauge, breakdown, headlines, movers, watchlist, search…
  lib/            api client, types, utils, local storage helpers
```

## Notes

- **Market data is all keyed HTTP APIs**, chosen so the app works from a cloud
  host (no IP-reputation blocking from scraping).
- **Cost is bounded** by the hourly re-score cache and the daily scoring cap —
  important since on-visit scoring is otherwise an open-ended LLM cost on a
  public URL.
