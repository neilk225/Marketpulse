# [marketpulse.fyi](https://marketpulse.fyi)

**Real-time, news-driven sentiment analysis for stocks, crypto, and commodities.**

![MarketPulse dashboard](home.png)

MarketPulse reads the latest headlines for any ticker, uses a sentiment pipeline to score each
one by its likely impact on the share price and distills them into a single, confidence-weighted
reading. Wrapped in a fast, animated dark interface with live market
movers, watchlists, and price charts.


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
| **AI** | OpenRouter - Claude Haiku 4.5 (primary) + open-model fallback |
| **Data** | Finnhub, Financial Modeling Prep, CoinGecko, TradingView charts |
| **Infra** | Railway (API + Postgres), Vercel (frontend) |


<sub>Built by Neil Khetia</sub>
