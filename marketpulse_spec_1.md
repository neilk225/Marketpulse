# MarketPulse — Technical Specification v1.1

## Project Overview

MarketPulse is a financial sentiment dashboard that aggregates news headlines
from multiple sources, runs sentiment analysis via a frontier LLM, and presents
results alongside real-time price charts. Supports stocks, crypto, and commodities.

Goal: deployed, polished portfolio project demonstrating full-stack engineering,
ML pipeline integration, and production deployment practices.

---

## Stack

| Layer        | Technology                                          |
|---|---|
| Frontend     | Next.js 14 (App Router) + TypeScript                |
| Styling      | Tailwind CSS                                        |
| Charts       | TradingView Lightweight Charts                      |
| Backend      | FastAPI (Python 3.11+)                              |
| Database     | PostgreSQL 15 (Railway managed)                     |
| Sentiment    | DeepSeek V3 via OpenRouter (free tier + fallback)   |
| News         | Finnhub (stocks) + feedparser/RSS (all classes) — see below |
| Market data  | yfinance (stocks/commodities) + CoinGecko (crypto)  |
| Deployment   | Vercel (frontend) + Railway (backend + DB)          |
| CI/CD        | GitHub Actions                                      |

Monthly cost: ~$10–15 (Railway Hobby only)

---

## Environment Variables

### Backend (.env)
```
DATABASE_URL=postgresql://...
OPENROUTER_API_KEY=sk-or-...
COINGECKO_API_KEY=...
FINNHUB_API_KEY=...
APP_ENV=development
```

### Frontend (.env.local)
```
NEXT_PUBLIC_API_URL=https://your-app.up.railway.app
```

Production secrets set in Railway and Vercel dashboards. Never committed to git.
`.env` and `.env.local` in `.gitignore`.

---

## CORS Configuration

The frontend (vercel.app) and backend (railway.app) are on different domains.
Browsers block cross-domain requests unless the server explicitly allows them.

FastAPI CORS setup — add this to `main.py` before any routes:

```python
from fastapi.middleware.cors import CORSMiddleware

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://marketpulse.vercel.app",
        "http://localhost:3000",          # local dev
    ],
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)
```

Without this, every API call from the frontend fails silently in the browser.

---

## Database Schema

### tickers
```sql
CREATE TABLE tickers (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol          VARCHAR(20)  UNIQUE NOT NULL,
  name            VARCHAR(255) NOT NULL,
  asset_class     VARCHAR(20)  NOT NULL
                  CHECK (asset_class IN ('stock','crypto','commodity')),
  last_fetched_at TIMESTAMPTZ,
  created_at      TIMESTAMPTZ  DEFAULT NOW()
);
CREATE INDEX idx_tickers_symbol     ON tickers(symbol);
CREATE INDEX idx_tickers_asset_class ON tickers(asset_class);
```

### sentiment_scores
```sql
CREATE TABLE sentiment_scores (
  id             UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  ticker_id      UUID    NOT NULL REFERENCES tickers(id) ON DELETE CASCADE,
  score          FLOAT   NOT NULL,   -- 0.0 (bearish) → 1.0 (bullish)
  positive_pct   FLOAT   NOT NULL,   -- % of headlines scored positive
  negative_pct   FLOAT   NOT NULL,   -- % of headlines scored negative
  neutral_pct    FLOAT   NOT NULL,   -- % of headlines scored neutral
  headline_count INTEGER NOT NULL,   -- number of headlines used
  model_used     VARCHAR(100) NOT NULL,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_sentiment_ticker_id  ON sentiment_scores(ticker_id);
CREATE INDEX idx_sentiment_created_at ON sentiment_scores(created_at DESC);
```

`positive_pct / negative_pct / neutral_pct` explanation: if 20 headlines are
scored and 14 are positive, 4 negative, 2 neutral, then positive_pct = 70.0,
negative_pct = 20.0, neutral_pct = 10.0. These drive the breakdown bar in the UI.
`headline_count` tells the user how many articles backed the score — "based on 3
articles" is less reliable than "based on 24 articles".

### headlines
```sql
CREATE TABLE headlines (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticker_id           UUID NOT NULL REFERENCES tickers(id) ON DELETE CASCADE,
  sentiment_score_id  UUID NOT NULL REFERENCES sentiment_scores(id) ON DELETE CASCADE,
  title               TEXT NOT NULL,
  url                 TEXT NOT NULL,
  source              VARCHAR(50) NOT NULL
                      CHECK (source IN (
                        'finnhub','yahoo_finance','marketwatch','seeking_alpha',
                        'investing_com','wsj','google_news','coingecko'
                      )),
  individual_sentiment VARCHAR(10) NOT NULL
                      CHECK (individual_sentiment IN ('positive','negative','neutral')),
  individual_score    FLOAT NOT NULL,
  confidence          VARCHAR(10) NOT NULL
                      CHECK (confidence IN ('high','medium','low')),
  published_at        TIMESTAMPTZ,
  created_at          TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_headlines_ticker_id         ON headlines(ticker_id);
CREATE INDEX idx_headlines_sentiment_score_id ON headlines(sentiment_score_id);
CREATE INDEX idx_headlines_published_at      ON headlines(published_at DESC);
```

### market_movers
```sql
CREATE TABLE market_movers (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_class VARCHAR(20) NOT NULL
              CHECK (asset_class IN ('stock','crypto','commodity')),
  direction   VARCHAR(10) NOT NULL
              CHECK (direction IN ('gainer','loser')),
  symbol      VARCHAR(20) NOT NULL,
  name        VARCHAR(255) NOT NULL,
  price       FLOAT NOT NULL,
  change_pct  FLOAT NOT NULL,
  fetched_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_movers_asset_class ON market_movers(asset_class);
CREATE INDEX idx_movers_fetched_at  ON market_movers(fetched_at DESC);
```

Cache check: before fetching movers, query the latest `fetched_at` for that
`asset_class`. If < 10 minutes ago, return the stored rows. Otherwise fetch
fresh and insert new rows.

### Ticker Seeding

Seed `tickers` table on first deploy via `backend/scripts/seed_tickers.py`:

- S&P 500 stocks: fetch CSV from
  `https://raw.githubusercontent.com/datasets/s-and-p-500-companies/main/data/constituents.csv`
- Top 100 crypto: call CoinGecko `/coins/markets?vs_currency=usd&per_page=100`
- Commodities: hardcode the list below

```python
COMMODITY_TICKERS = [
    ("GC=F", "Gold Futures"),
    ("SI=F", "Silver Futures"),
    ("CL=F", "Crude Oil Futures"),
    ("NG=F", "Natural Gas Futures"),
    ("ZW=F", "Wheat Futures"),
    ("ZC=F", "Corn Futures"),
    ("HG=F", "Copper Futures"),
    ("PL=F", "Platinum Futures"),
]
```

---

## Asset Class Detection

```python
KNOWN_CRYPTO_SYMBOLS = set()  # populated from DB at startup

def detect_asset_class(symbol: str) -> str:
    symbol = symbol.upper().strip()
    if symbol.endswith("=F"):
        return "commodity"
    if symbol.endswith(("-USD", "-USDT", "-BTC")):
        return "crypto"
    if symbol in KNOWN_CRYPTO_SYMBOLS:
        return "crypto"
    return "stock"
```

`KNOWN_CRYPTO_SYMBOLS` is loaded from the `tickers` table at FastAPI startup.
This means any ticker seeded as crypto (BTC, ETH, SOL, LINK, UNI, etc.) is
correctly detected even without the `-USD` suffix.

---

## News Layer — Finnhub (stocks) + feedparser/RSS (all classes)

Do NOT use FinNews. Do NOT use Alpha Vantage — its free tier is capped at
25 requests/day, which is unusable for a dashboard (confirmed via research,
cut from 500/day historically).

**Finnhub is the primary source for stocks.** Free tier allows 60 requests/minute
(86,400/day) with a dedicated company-news endpoint — structured JSON,
ticker-filtered, not a keyword search like RSS/Google News. Sign up for a free
API key at finnhub.io, no credit card required.

Finnhub's free tier does NOT cover crypto or commodity news, so those asset
classes stay on the RSS-based approach below.

```python
import asyncio
import feedparser
import httpx
from datetime import datetime, timedelta, UTC

FINNHUB_BASE = "https://finnhub.io/api/v1"

async def fetch_finnhub_news(symbol: str) -> list[dict]:
    today = datetime.now(UTC).date()
    week_ago = today - timedelta(days=7)
    url = (
        f"{FINNHUB_BASE}/company-news"
        f"?symbol={symbol}&from={week_ago}&to={today}"
        f"&token={settings.FINNHUB_API_KEY}"
    )
    async with httpx.AsyncClient(timeout=5.0) as client:
        try:
            r = await client.get(url)
            r.raise_for_status()
        except Exception:
            return []
    return [
        {
            "title":        item["headline"],
            "url":          item["url"],
            "source":       "finnhub",
            "published_at": datetime.fromtimestamp(item["datetime"], UTC),
        }
        for item in r.json()[:15]
    ]

RSS_FEEDS = {
    "stock": [
        # Yahoo Finance per-ticker feed
        "https://finance.yahoo.com/rss/headline?s={symbol}",
        # Google News per-ticker (aggregates Reuters, AP, Bloomberg, etc.)
        "https://news.google.com/rss/search?q={symbol}+stock&hl=en-US&gl=US&ceid=US:en",
    ],
    "crypto": [
        "https://finance.yahoo.com/rss/headline?s={symbol}",
        "https://news.google.com/rss/search?q={symbol}+crypto&hl=en-US&gl=US&ceid=US:en",
    ],
    "commodity": [
        "https://finance.yahoo.com/rss/headline?s={symbol}",
        "https://news.google.com/rss/search?q={symbol}+commodity&hl=en-US&gl=US&ceid=US:en",
        "https://www.investing.com/rss/news_301.rss",
    ],
}

SOURCE_MAP = {
    "finance.yahoo.com": "yahoo_finance",
    "marketwatch.com":   "marketwatch",
    "news.google.com":   "google_news",
    "investing.com":     "investing_com",
}

def get_source(url: str, entry=None) -> str:
    # Google News entries carry the real publisher name in entry.source.title —
    # prefer that over guessing from the (redirect) URL domain.
    if entry is not None and hasattr(entry, "source") and entry.source.get("title"):
        return "google_news"
    for domain, name in SOURCE_MAP.items():
        if domain in url:
            return name
    return "yahoo_finance"

async def fetch_feed(url: str) -> list[dict]:
    # feedparser is synchronous — run it in a thread so it never blocks
    # the FastAPI event loop. 5s timeout prevents one dead feed from
    # hanging the whole pipeline.
    def _parse():
        return feedparser.parse(url, request_headers={"timeout": 5})
    try:
        parsed = await asyncio.to_thread(_parse)
    except Exception:
        return []
    results = []
    for entry in parsed.entries[:10]:
        results.append({
            "title":        entry.get("title", ""),
            "url":          entry.get("link", ""),
            "source":       get_source(url, entry),
            "published_at": entry.get("published", None),
        })
    return results

async def fetch_headlines(symbol: str, asset_class: str) -> list[dict]:
    headlines = []

    if asset_class == "stock":
        headlines += await fetch_finnhub_news(symbol)

    for feed_url in RSS_FEEDS[asset_class]:
        url = feed_url.format(symbol=symbol)
        headlines += await fetch_feed(url)

    # Deduplicate by title, cap at 30
    seen, unique = set(), []
    for h in headlines:
        if h["title"] and h["title"] not in seen:
            seen.add(h["title"])
            unique.append(h)
    return unique[:30]
```

Updated source routing summary:

```
stock     → Finnhub (primary, ticker-filtered) + Yahoo Finance RSS + Google News RSS
crypto    → Yahoo Finance RSS + Google News RSS
commodity → Yahoo Finance RSS + Google News RSS + Investing.com RSS
```

CoinGecko is NOT used for news — its news endpoint requires the paid Analyst
plan and above, not available on the free Demo tier (verified). CoinGecko is
used only for crypto market data (prices, top movers) via `/coins/markets`,
which IS available on Demo.

Finnhub is the highest-quality source available — structured, ticker-specific,
not a keyword match — so stocks (your highest-traffic asset class) get the best
data. Crypto and commodities lean on RSS since neither Finnhub nor CoinGecko's
free tiers cover news for those classes.

---

## Sentiment Pipeline

### Cache check
```python
def is_cache_fresh(ticker: Ticker) -> bool:
    if not ticker.last_fetched_at:
        return False
    return (datetime.now(UTC) - ticker.last_fetched_at).total_seconds() < 600
```

### OpenRouter call

Model: `deepseek/deepseek-chat:free`
Fallback: `meta-llama/llama-3.1-8b-instruct:free`
Temperature: `0.1` — do not change; low temperature produces consistent
classification output. Higher values introduce noise.

```python
SYSTEM_PROMPT = """You are a financial sentiment analyst specializing in \
{asset_class} markets.
You will be given a list of news headlines about {symbol} ({name}).

For each headline, analyze the sentiment from the perspective of a {asset_class}
investor holding {symbol}. Return ONLY a valid JSON array — no preamble, no
markdown fences, no explanation. Each object must have exactly these fields:
  - "title": the original headline text (string)
  - "sentiment": one of "positive", "negative", "neutral" (string)
  - "score": float 0.0–1.0 where:
      0.0 = catastrophic / extremely bearish
      0.5 = neutral
      1.0 = major bullish catalyst
  - "confidence": one of "high", "medium", "low" (string)

If a headline is unrelated to {symbol} or too ambiguous to score,
set sentiment="neutral", score=0.5, confidence="low"."""

USER_PROMPT = """Analyze sentiment for {symbol} ({asset_class}) — {name}:
{numbered_headlines}"""

async def score_headlines(
    headlines: list[dict], symbol: str, name: str, asset_class: str
) -> list[dict]:
    numbered = "\n".join(
        f"{i+1}. {h['title']}" for i, h in enumerate(headlines)
    )
    payload = {
        "models": [
            "deepseek/deepseek-chat:free",
            "meta-llama/llama-3.1-8b-instruct:free",
        ],
        "route": "fallback",
        "messages": [
            {
                "role": "system",
                "content": SYSTEM_PROMPT.format(
                    asset_class=asset_class, symbol=symbol, name=name
                ),
            },
            {
                "role": "user",
                "content": USER_PROMPT.format(
                    symbol=symbol,
                    asset_class=asset_class,
                    name=name,
                    numbered_headlines=numbered,
                ),
            },
        ],
        "max_tokens": 2000,
        "temperature": 0.1,
    }
    async with httpx.AsyncClient() as client:
        r = await client.post(
            "https://openrouter.ai/api/v1/chat/completions",
            headers={
                "Authorization": f"Bearer {settings.OPENROUTER_API_KEY}",
                "Content-Type": "application/json",
            },
            json=payload,
            timeout=30.0,
        )
    raw = r.json()["choices"][0]["message"]["content"]
    clean = raw.strip().removeprefix("```json").removesuffix("```").strip()
    return json.loads(clean)
```

### Aggregate score calculation
```python
def compute_aggregate(scored: list[dict]) -> dict:
    if not scored:
        return {
            "score": 0.5, "positive_pct": 0.0,
            "negative_pct": 0.0, "neutral_pct": 0.0,
            "headline_count": 0,
        }
    weights = {"high": 1.0, "medium": 0.75, "low": 0.4}
    weighted = [
        s["score"] * weights.get(s["confidence"], 0.75)
        + 0.5 * (1 - weights.get(s["confidence"], 0.75))
        for s in scored
    ]
    total = len(scored)
    pos = sum(1 for s in scored if s["sentiment"] == "positive")
    neg = sum(1 for s in scored if s["sentiment"] == "negative")
    neu = sum(1 for s in scored if s["sentiment"] == "neutral")
    return {
        "score":         round(sum(weighted) / total, 4),
        "positive_pct":  round(pos / total * 100, 1),
        "negative_pct":  round(neg / total * 100, 1),
        "neutral_pct":   round(neu / total * 100, 1),
        "headline_count": total,
    }
```

---

## API Endpoints

Base URL: `https://{railway-app}.up.railway.app`

### GET /api/ticker/{symbol}
Main endpoint. Checks cache, runs pipeline if stale, returns full payload.

Response:
```json
{
  "symbol": "AAPL",
  "name": "Apple Inc.",
  "asset_class": "stock",
  "stale": false,
  "sentiment": {
    "score": 0.72,
    "positive_pct": 65.0,
    "negative_pct": 20.0,
    "neutral_pct": 15.0,
    "headline_count": 20,
    "model_used": "deepseek/deepseek-chat:free",
    "computed_at": "2026-06-11T14:23:00Z"
  },
  "headlines": [
    {
      "title": "Apple reports record Q2 revenue",
      "url": "https://...",
      "source": "yahoo_finance",
      "sentiment": "positive",
      "score": 0.91,
      "confidence": "high",
      "published_at": "2026-06-11T10:00:00Z"
    }
  ]
}
```

Error responses:
- `404` ticker not found
- `422` invalid symbol format
- `503` all models unavailable — returns last stored score with `"stale": true`

### GET /api/ticker/{symbol}/history?days=7
Sentiment trend for chart. Default 7 days, max 30.

Response:
```json
{
  "symbol": "AAPL",
  "history": [
    {"score": 0.65, "computed_at": "2026-06-05T14:00:00Z"},
    {"score": 0.71, "computed_at": "2026-06-06T14:00:00Z"}
  ]
}
```

## Charts — TradingView Embedded Widget

Using the free TradingView widget (iframe), not Lightweight Charts. This means:
- No price data API key or cost — TradingView serves its own data.
- No `/price-history` endpoint needed — the widget is self-contained.
- The widget and your sentiment data live in separate DOM contexts. There is
  no way to overlay sentiment on the TradingView price chart (this is why the
  sentiment-vs-price correlation feature is cut — see V2 section).
- Embed via TradingView's free widget script, passing the detected ticker
  symbol in their format (e.g. `NASDAQ:AAPL`, `BINANCE:BTCUSDT`,
  `COMEX:GC1!` for gold futures). Symbol mapping per asset class needs testing
  during build — TradingView's symbol format doesn't always match yfinance's.


### POST /api/ticker/{symbol}/refresh
Force bypasses 10-minute cache. Same response shape as GET /api/ticker/{symbol}.

### GET /api/movers/stocks
Top 5 gainers and 5 losers. Checks `market_movers` table — if latest
`fetched_at` for `asset_class='stock'` is < 10 min, return stored rows.
Otherwise fetch fresh via yfinance screener and insert.

Response:
```json
{
  "gainers": [
    {"symbol": "NVDA", "name": "NVIDIA Corp", "change_pct": 4.2, "price": 875.30}
  ],
  "losers": [
    {"symbol": "INTC", "name": "Intel Corp", "change_pct": -3.1, "price": 28.40}
  ],
  "cached_at": "2026-06-11T14:20:00Z"
}
```

### GET /api/movers/crypto
Same shape. Fetched via CoinGecko `/coins/markets?order=price_change_percentage_24h_desc`.

### GET /api/movers/commodities
Same shape. Fetched via yfinance for the hardcoded commodity futures list.

### GET /api/search?q={query}
Queries local `tickers` table. Searches symbol and name fields. Max 10 results.
No external API call.

Response:
```json
{
  "results": [
    {"symbol": "AAPL", "name": "Apple Inc.", "asset_class": "stock"},
    {"symbol": "AAPLX", "name": "Apple Growth Fund", "asset_class": "stock"}
  ]
}
```

### GET /api/ticker/{symbol}/headlines?page=1&source=yahoo_finance
Paginated headline list. `source` filter optional.

Response:
```json
{
  "symbol": "AAPL",
  "page": 1,
  "total": 47,
  "headlines": [...]
}
```

---

## Error Handling

### Sentiment model unavailable
If OpenRouter returns non-200 or JSON parse fails:
- Return last stored `sentiment_scores` row for that ticker
- Set `"stale": true` in response
- Frontend `<StaleBadge>`: "Last updated X min ago — live scoring unavailable"

### Ticker not found
Symbol not in DB and cannot be resolved:
- Return `404` with `{"error": "Ticker not found", "symbol": "XYZ"}`
- Frontend `<ErrorState>`: "We couldn't find XYZ. Try a different symbol."

### No news available
All feeds return empty for a ticker:
- Return score `0.5`, `headline_count: 0`
- Frontend message: "Insufficient news data for sentiment analysis"

### Partial feed failure
Some feeds fail, some succeed — use whatever was fetched.
Log the failure server-side. Don't surface it to the user.

---

## Frontend Structure

```
/app
  /page.tsx                        # Home: search bar + top movers
  /ticker/[symbol]/page.tsx        # Ticker detail page
  /components
    /SearchBar.tsx                 # Debounced, autocomplete dropdown
    /SentimentGauge.tsx            # Circular arc gauge (signature element)
    /SentimentBreakdown.tsx        # Pos/neg/neu percentage bars
    /SentimentTrendChart.tsx       # Lightweight Charts line (sentiment over time)
    /PriceChart.tsx                # TradingView embedded widget (iframe)
    /HeadlineList.tsx              # Scrollable, source badges, sentiment tags
    /TopMovers.tsx                 # Tabbed: Stocks | Crypto | Commodities
    /Watchlist.tsx                 # localStorage sidebar
    /RefreshButton.tsx             # POST /refresh trigger
    /LoadingSkeleton.tsx           # Skeleton for all data components
    /ErrorState.tsx                # Error UI with retry
    /StaleBadge.tsx                # Stale data indicator
  /lib
    /api.ts                        # All fetch calls to FastAPI
    /watchlist.ts                  # localStorage helpers
    /utils.ts                      # Score→color, formatting
```

### Score color mapping
```
0.00–0.35  →  red     (bearish)
0.35–0.55  →  yellow  (neutral)
0.55–1.00  →  green   (bullish)
```

### Watchlist (localStorage)
```typescript
const KEY = 'marketpulse_watchlist'
export const getWatchlist = (): string[] =>
  JSON.parse(localStorage.getItem(KEY) ?? '[]')
export const addToWatchlist = (symbol: string) => {
  const list = getWatchlist()
  if (!list.includes(symbol))
    localStorage.setItem(KEY, JSON.stringify([...list, symbol]))
}
export const removeFromWatchlist = (symbol: string) =>
  localStorage.setItem(KEY, JSON.stringify(getWatchlist().filter(s => s !== symbol)))
```

---

## UI Design Direction

Dark theme. Financial terminal aesthetic: high contrast, data-dense, monospace
for all numbers and scores, color used only for signal (green/yellow/red carry
meaning and appear nowhere else decoratively).

Layout: left sidebar (watchlist), center main content, right panel (top movers).
Mobile: single column, top movers collapse to horizontal scrollable strip.

Signature element: sentiment score rendered as a circular arc gauge — the arc
fills from red through yellow to green. First thing the eye lands on when
viewing a ticker. Not a number, not a bar chart — a gauge.

Skeleton states on every data-dependent component. No blank screens at any point.

---

## V1 and V2 Feature Split

### V1 — ship first
- Ticker search with autocomplete
- Asset class auto-detection
- Sentiment circular gauge
- Sentiment breakdown (pos/neg/neu %)
- Headline list with source badges + individual sentiment tags
- TradingView embedded price chart widget
- Sentiment trend chart (7-day line)
- Score color coding
- "Last updated" timestamp + stale badge
- Loading skeletons + error states
- Top movers panel (Stocks / Crypto / Commodities tabs)
- Watchlist (localStorage)
- Manual refresh button

### V2 — after V1 is live
- ~~Sentiment vs price correlation overlay~~ — CUT. Not possible with the free
  TradingView widget, since it's an iframe with no data API. Would require
  paying for a price data feed (e.g. Lightweight Charts + a paid data source),
  which is out of budget for this project.
- ~~CoinGecko news vs RSS news split for crypto~~ — CUT. CoinGecko's news
  endpoint requires the paid Analyst plan and above; not available on the
  free Demo tier (verified). No replacement V2 feature defined yet —
  revisit after V1 ships.
  Display as two small score pills beneath the main gauge on crypto tickers.

---

## Deployment

### Railway (backend + DB)
- Service: FastAPI via `uvicorn main:app --host 0.0.0.0 --port $PORT`
- Database: Railway managed PostgreSQL (one-click add)
- No Dockerfile needed — Railway Nixpacks auto-detects FastAPI from
  `requirements.txt`
- Environment variables: set in Railway dashboard
- Deploy trigger: push to `main`

### Vercel (frontend)
- Connect GitHub repo, Vercel auto-detects Next.js
- Set `NEXT_PUBLIC_API_URL` in Vercel environment variables
- Deploy trigger: push to `main`

### GitHub Actions
```yaml
name: Deploy
on:
  push:
    branches: [main]
jobs:
  deploy-backend:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: railway up --service backend
        env:
          RAILWAY_TOKEN: ${{ secrets.RAILWAY_TOKEN }}
  deploy-frontend:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: vercel --prod --token ${{ secrets.VERCEL_TOKEN }}
```

### Seed script (run once after first deploy)
```bash
railway run python backend/scripts/seed_tickers.py
```

---

## Project Directory Structure

```
marketpulse/
├── frontend/
│   ├── app/
│   │   ├── page.tsx
│   │   └── ticker/[symbol]/page.tsx
│   ├── components/
│   ├── lib/
│   ├── public/
│   ├── next.config.ts
│   ├── tailwind.config.ts
│   └── package.json
├── backend/
│   ├── main.py                 # FastAPI entry + CORS middleware
│   ├── routers/
│   │   ├── ticker.py
│   │   ├── movers.py
│   │   └── search.py
│   ├── services/
│   │   ├── sentiment.py        # OpenRouter pipeline
│   │   ├── news.py             # feedparser + RSS aggregation
│   │   ├── market_data.py      # yfinance + CoinGecko
│   │   └── cache.py            # cache check logic
│   ├── models/
│   │   └── db.py               # SQLAlchemy models
│   ├── scripts/
│   │   └── seed_tickers.py
│   └── requirements.txt
├── .github/
│   └── workflows/
│       └── deploy.yml
├── .gitignore
└── README.md
```

