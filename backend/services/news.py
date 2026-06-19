"""News aggregation layer.

Per spec:
  stock     -> Finnhub (primary, ticker-filtered) + Yahoo RSS + Google News RSS
  crypto    -> Yahoo RSS + Google News RSS
  commodity -> Yahoo RSS + Google News RSS + Investing.com RSS

CoinGecko is NOT a news source — its news endpoint requires the paid Analyst
plan and is unavailable on the free Demo tier (CoinGecko is used only for crypto
market data elsewhere). Finnhub is the only structured/ticker-filtered source
and its free tier doesn't cover crypto/commodities, so those stay on RSS. All
network calls are wrapped so a single dead feed returns [] rather than breaking
the pipeline.
"""
from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timedelta, UTC
from urllib.parse import quote_plus

import feedparser
import httpx

from config import settings

logger = logging.getLogger("marketpulse.news")

FINNHUB_BASE = "https://finnhub.io/api/v1"

YAHOO_RSS = "https://finance.yahoo.com/rss/headline?s={symbol}"
GOOGLE_RSS = "https://news.google.com/rss/search?q={q}&hl=en-US&gl=US&ceid=US:en"
INVESTING_COMMODITIES_RSS = "https://www.investing.com/rss/news_301.rss"


def _google(query: str) -> str:
    return GOOGLE_RSS.format(q=quote_plus(query))


def _feed_urls(symbol: str, asset_class: str, name: str) -> list[str]:
    """Build the RSS feed URLs for a ticker.

    Crypto symbols are the weak spot: Yahoo's quote feed needs the ``-USD``
    suffix, and a bare ticker like "HBAR" is a poor Google News query. Using the
    coin's full name ("Hedera") dramatically improves coverage for less popular
    coins, so crypto queries lead with the name.
    """
    if asset_class == "crypto":
        # Yahoo's crypto quote RSS (e.g. HBAR-USD) returns nothing now, so crypto
        # leans entirely on Google News, queried by full coin name (best coverage
        # for less popular coins) plus the ticker.
        return [
            _google(f"{name} crypto"),
            _google(f"{symbol} crypto price"),
        ]
    if asset_class == "commodity":
        return [
            YAHOO_RSS.format(symbol=symbol),
            _google(f"{name}"),
            INVESTING_COMMODITIES_RSS,
        ]
    # stock
    return [
        YAHOO_RSS.format(symbol=symbol),
        _google(f"{symbol} stock"),
    ]

SOURCE_MAP = {
    "finance.yahoo.com": "yahoo_finance",
    "marketwatch.com": "marketwatch",
    "news.google.com": "google_news",
    "investing.com": "investing_com",
}


def get_source(url: str, entry=None) -> str:
    # Google News entries carry the real publisher name in entry.source.title —
    # prefer that over guessing from the (redirect) URL domain.
    if entry is not None and hasattr(entry, "source"):
        try:
            if entry.source.get("title"):
                return "google_news"
        except AttributeError:
            pass
    for domain, name in SOURCE_MAP.items():
        if domain in url:
            return name
    return "yahoo_finance"


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
        except Exception as exc:  # noqa: BLE001 — partial failure tolerated
            logger.warning("Finnhub news failed for %s: %s", symbol, exc)
            return []
    return [
        {
            "title": item["headline"],
            "url": item["url"],
            "source": "finnhub",
            "published_at": datetime.fromtimestamp(item["datetime"], UTC),
        }
        for item in r.json()[:15]
    ]


# feedparser's built-in fetcher uses its own user-agent, which Google News
# intermittently throttles to an empty response. Fetching the XML ourselves with
# a browser UA (and a real timeout) is far more reliable, then we hand the raw
# bytes to feedparser for parsing only.
BROWSER_UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0 Safari/537.36"
)


async def fetch_feed(url: str) -> list[dict]:
    try:
        async with httpx.AsyncClient(
            timeout=6.0,
            follow_redirects=True,
            headers={"User-Agent": BROWSER_UA},
        ) as client:
            r = await client.get(url)
            r.raise_for_status()
        # Parsing is synchronous CPU work — keep it off the event loop.
        parsed = await asyncio.to_thread(feedparser.parse, r.content)
    except Exception as exc:  # noqa: BLE001
        logger.warning("RSS feed failed %s: %s", url, exc)
        return []
    results = []
    for entry in parsed.entries[:10]:
        results.append(
            {
                "title": entry.get("title", ""),
                "url": entry.get("link", ""),
                "source": get_source(url, entry),
                "published_at": entry.get("published", None),
            }
        )
    return results


async def fetch_headlines(
    symbol: str, asset_class: str, name: str = ""
) -> list[dict]:
    headlines: list[dict] = []

    if asset_class == "stock":
        headlines += await fetch_finnhub_news(symbol)

    for url in _feed_urls(symbol, asset_class, name):
        headlines += await fetch_feed(url)

    # Deduplicate by title, cap at 30
    seen: set[str] = set()
    unique: list[dict] = []
    for h in headlines:
        if h["title"] and h["title"] not in seen:
            seen.add(h["title"])
            unique.append(h)
    return unique[:30]
