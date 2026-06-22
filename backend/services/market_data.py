"""Market-data fetchers for the top-movers endpoints and on-demand symbol lookup.

Three asset classes, three sources (all market data — no LLM cost):
  - stocks      : FMP biggest-gainers / biggest-losers (ready-made screeners)
  - commodities : Finnhub quotes over liquid commodity ETFs, sorted locally
                  (FMP's free tier only prices a few commodities; the ETFs are
                  free, fully covered, and clickable/scoreable as real tickers)
  - crypto      : CoinGecko /coins/markets (top by market cap), sorted locally

Symbol search and on-demand resolution use Finnhub (/search, /quote, profile2).

All sources are keyed HTTP APIs called over httpx — no web scraping — so they
work from any IP (the cloud-deploy reason we moved off yfinance, which Yahoo
rate-limits/blocks by datacenter-IP reputation).

Every mover fetcher returns ``{"gainers": [...], "losers": [...]}`` where each
item is ``{"symbol", "name", "price", "change_pct"}``.
"""
from __future__ import annotations

import asyncio
import logging
import re
import time

import httpx  # used for the AsyncClient type hint on _commodity_quote

from config import FINNHUB_BASE, settings
from services.http import get_client

logger = logging.getLogger("marketpulse.market_data")

MOVERS_PER_SIDE = 5

FMP_BASE = "https://financialmodelingprep.com/stable"
COINGECKO_MARKETS = "https://api.coingecko.com/api/v3/coins/markets"

# Commodities are tracked via liquid, exchange-traded commodity ETFs. FMP's free
# tier only prices a handful of commodity futures; these ETFs quote freely on
# Finnhub, track their underlying closely, and are real US tickers — so a
# commodity mover is clickable and scoreable like any other. (symbol, name)
COMMODITY_TICKERS: list[tuple[str, str]] = [
    ("GLD", "Gold"),
    ("SLV", "Silver"),
    ("USO", "Crude Oil"),
    ("UNG", "Natural Gas"),
    ("CPER", "Copper"),
    ("PPLT", "Platinum"),
    ("WEAT", "Wheat"),
    ("CORN", "Corn"),
]


class MoversUnavailable(Exception):
    """Raised when an upstream market-data source can't be reached."""


def _round(v: float | None) -> float | None:
    return round(float(v), 4) if v is not None else None


def _mover(symbol: str, name: str, price, change_pct) -> dict | None:
    """Build a mover row, dropping entries with missing price/change."""
    if price is None or change_pct is None:
        return None
    return {
        "symbol": symbol,
        "name": name or symbol,
        "price": _round(price),
        "change_pct": _round(change_pct),
    }


# --------------------------------------------------------------------------- #
# Stocks — FMP biggest-gainers / biggest-losers
# --------------------------------------------------------------------------- #
def _stock_rows(payload, limit: int) -> list[dict]:
    rows: list[dict] = []
    for q in payload if isinstance(payload, list) else []:
        m = _mover(
            (q.get("symbol") or "").upper(),
            q.get("name") or q.get("symbol", ""),
            q.get("price"),
            q.get("changesPercentage"),  # gainers/losers field (note the 's')
        )
        if m:
            rows.append(m)
        if len(rows) >= limit:
            break
    return rows


async def fetch_stock_movers() -> dict:
    try:
        client = get_client()
        gainers, losers = await asyncio.gather(
            client.get(
                f"{FMP_BASE}/biggest-gainers",
                params={"apikey": settings.FMP_API_KEY},
                timeout=15.0,
            ),
            client.get(
                f"{FMP_BASE}/biggest-losers",
                params={"apikey": settings.FMP_API_KEY},
                timeout=15.0,
            ),
        )
        gainers.raise_for_status()
        losers.raise_for_status()
    except Exception as exc:  # noqa: BLE001 — any FMP/network error
        logger.warning("stock movers fetch failed: %s", exc)
        raise MoversUnavailable(str(exc)) from exc

    return {
        "gainers": _stock_rows(gainers.json(), MOVERS_PER_SIDE),
        "losers": _stock_rows(losers.json(), MOVERS_PER_SIDE),
    }


# --------------------------------------------------------------------------- #
# Commodities — Finnhub quotes over commodity ETFs, sorted locally
# --------------------------------------------------------------------------- #
async def _commodity_quote(client: httpx.AsyncClient, symbol, name) -> dict | None:
    try:
        r = await client.get(
            f"{FINNHUB_BASE}/quote",
            params={"symbol": symbol, "token": settings.FINNHUB_API_KEY},
            timeout=15.0,
        )
        r.raise_for_status()
        q = r.json()
    except Exception as exc:  # noqa: BLE001
        logger.debug("commodity %s skipped: %s", symbol, exc)
        return None
    if not q or not q.get("c"):  # unknown symbol → all-zero quote
        return None
    # Finnhub quote: c = current price, dp = daily change percent.
    return _mover(symbol, name, q.get("c"), q.get("dp"))


async def fetch_commodity_movers() -> dict:
    try:
        client = get_client()
        results = await asyncio.gather(
            *(
                _commodity_quote(client, symbol, name)
                for symbol, name in COMMODITY_TICKERS
            )
        )
    except Exception as exc:  # noqa: BLE001
        logger.warning("commodity movers fetch failed: %s", exc)
        raise MoversUnavailable(str(exc)) from exc

    rows = [r for r in results if r]
    if not rows:
        raise MoversUnavailable("no commodity quotes returned")
    return _split_by_sign(rows)


# --------------------------------------------------------------------------- #
# Crypto — CoinGecko top-by-market-cap, sorted locally (unchanged)
# --------------------------------------------------------------------------- #
async def fetch_crypto_movers() -> dict:
    params = {
        "vs_currency": "usd",
        "order": "market_cap_desc",
        "per_page": 100,
        "page": 1,
        "price_change_percentage": "24h",
    }
    headers = {}
    if settings.COINGECKO_API_KEY:
        headers["x-cg-demo-api-key"] = settings.COINGECKO_API_KEY
    try:
        r = await get_client().get(
            COINGECKO_MARKETS, params=params, headers=headers, timeout=15.0
        )
        r.raise_for_status()
        coins = r.json()
    except Exception as exc:  # noqa: BLE001
        logger.warning("crypto movers fetch failed: %s", exc)
        raise MoversUnavailable(str(exc)) from exc

    rows: list[dict] = []
    for c in coins:
        m = _mover(
            (c.get("symbol") or "").upper(),
            c.get("name", ""),
            c.get("current_price"),
            c.get("price_change_percentage_24h"),
        )
        if m:
            rows.append(m)
    return _split_by_sign(rows)


# --------------------------------------------------------------------------- #
# Live quote for the sentiment prompt
# --------------------------------------------------------------------------- #
async def fetch_quote(symbol: str, asset_class: str) -> dict | None:
    """Latest price snapshot fed into the sentiment prompt so the model can
    reconcile headline tone against the market's actual reaction (e.g. broadly
    bullish headlines under a -60% day). Stocks/commodities use Finnhub /quote
    (regular-session price + today's move — extended hours is a paid feature);
    crypto uses CoinGecko's 24h figures. Best-effort: returns None on any failure
    and scoring just proceeds without the price context."""
    try:
        client = get_client()
        if asset_class == "crypto":
            headers = {}
            if settings.COINGECKO_API_KEY:
                headers["x-cg-demo-api-key"] = settings.COINGECKO_API_KEY
            r = await client.get(
                COINGECKO_MARKETS,
                params={"vs_currency": "usd", "symbols": symbol.lower()},
                headers=headers,
                timeout=8.0,
            )
            r.raise_for_status()
            arr = r.json()
            if not arr or arr[0].get("current_price") is None:
                return None
            c = arr[0]
            return {
                "price": c.get("current_price"),
                "change_pct": c.get("price_change_percentage_24h"),
                "day_high": c.get("high_24h"),
                "day_low": c.get("low_24h"),
                "prev_close": None,
                "window": "24h",
            }
        # stock / commodity -> Finnhub quote (c=current, dp=%chg, h/l=day, pc=prev)
        r = await client.get(
            f"{FINNHUB_BASE}/quote",
            params={"symbol": symbol, "token": settings.FINNHUB_API_KEY},
            timeout=8.0,
        )
        r.raise_for_status()
        q = r.json()
        if not q or not q.get("c"):
            return None
        return {
            "price": q.get("c"),
            "change_pct": q.get("dp"),
            "day_high": q.get("h"),
            "day_low": q.get("l"),
            "prev_close": q.get("pc"),
            "window": "today",
        }
    except Exception as exc:  # noqa: BLE001
        logger.warning("quote fetch failed for %s: %s", symbol, exc)
        return None


# --------------------------------------------------------------------------- #
# On-demand symbol resolution + live search (Finnhub)
# --------------------------------------------------------------------------- #
# Finnhub free tier is US equities/ETFs; resolved/searched symbols are surfaced
# as "stock". Crypto and commodities live in the seeded universe already.
_US_SYMBOL = re.compile(r"^[A-Z]{1,6}$")
_EQUITY_TYPES = {"COMMON STOCK", "ETP", "ETF", "ADR", "REIT", "STOCK"}


async def resolve_symbol(symbol: str) -> dict | None:
    """Resolve an unseeded symbol to {symbol, name, asset_class} via Finnhub.

    Returns None if the symbol isn't a real, tradeable US equity/ETF, so the
    caller can 404. (Crypto/commodities are pre-seeded, so this only needs to
    cover stocks beyond the S&P 500 seed.)
    """
    sym = symbol.strip().upper()
    if not _US_SYMBOL.match(sym):
        return None
    try:
        client = get_client()
        quote, profile = await asyncio.gather(
            client.get(
                f"{FINNHUB_BASE}/quote",
                params={"symbol": sym, "token": settings.FINNHUB_API_KEY},
                timeout=10.0,
            ),
            client.get(
                f"{FINNHUB_BASE}/stock/profile2",
                params={"symbol": sym, "token": settings.FINNHUB_API_KEY},
                timeout=10.0,
            ),
        )
        quote.raise_for_status()
        profile.raise_for_status()
        q = quote.json()
        p = profile.json()
    except Exception as exc:  # noqa: BLE001
        logger.warning("symbol resolve failed for %s: %s", sym, exc)
        return None

    # An unknown symbol returns an all-zero quote and an empty profile.
    if not q or not q.get("c") or not isinstance(p, dict) or not p.get("name"):
        return None
    return {"symbol": sym, "name": p["name"], "asset_class": "stock"}


# Autocomplete fires one search per debounced keystroke, but the result for a
# given term is stable for minutes. A small TTL cache collapses repeat terms
# (backspacing, re-typing, two users on the same query) to a single Finnhub call.
_SEARCH_TTL = 300.0  # seconds
_SEARCH_CACHE: dict[str, tuple[float, list[dict]]] = {}
_SEARCH_CACHE_MAX = 500


async def search_symbols(term: str) -> list[dict]:
    """Live symbol search via Finnhub, filtered to US equities/ETFs. Augments
    local autocomplete so unseeded tickers (RIOT, ASTS…) are discoverable
    WITHOUT scoring them. Returns [] on any error — autocomplete then falls back
    to local DB results."""
    term = term.strip()
    # A single character is too noisy to be worth a remote call — local DB
    # prefix matching covers it, and Finnhub returns mostly junk for 1 char.
    if len(term) < 2:
        return []

    key = term.lower()
    hit = _SEARCH_CACHE.get(key)
    if hit is not None and time.monotonic() - hit[0] < _SEARCH_TTL:
        return hit[1]

    try:
        r = await get_client().get(
            f"{FINNHUB_BASE}/search",
            params={"q": term, "token": settings.FINNHUB_API_KEY},
            timeout=8.0,
        )
        r.raise_for_status()
        results = r.json().get("result", [])
    except Exception as exc:  # noqa: BLE001
        logger.warning("symbol search failed for %r: %s", term, exc)
        return []

    out: list[dict] = []
    seen: set[str] = set()
    for q in results:
        sym = (q.get("symbol") or "").strip().upper()
        sec_type = (q.get("type") or "").strip().upper()
        # Skip foreign listings (ASTS.MX, 300183.SZ), options, and crypto pairs
        # (BINANCE:BTCUSDT) — keep clean US tickers only.
        if not _US_SYMBOL.match(sym) or sym in seen:
            continue
        if sec_type and sec_type not in _EQUITY_TYPES:
            continue
        seen.add(sym)
        name = (q.get("description") or sym).strip().title()
        out.append({"symbol": sym, "name": name, "asset_class": "stock"})

    # Cache only successful responses (errors return [] above, uncached, so a
    # transient failure self-heals on the next keystroke). Bound the dict size
    # with a coarse clear — terms churn, so a precise LRU isn't worth it.
    if len(_SEARCH_CACHE) >= _SEARCH_CACHE_MAX:
        _SEARCH_CACHE.clear()
    _SEARCH_CACHE[key] = (time.monotonic(), out)
    return out


# --------------------------------------------------------------------------- #
# Shared: split a single ranked list into gainers / losers
# --------------------------------------------------------------------------- #
def _split_by_sign(rows: list[dict]) -> dict:
    """Sort by change_pct and split into positive (gainers) and negative
    (losers), capping each side. Avoids overlap when fewer than 10 items."""
    ranked = sorted(rows, key=lambda r: r["change_pct"], reverse=True)
    gainers = [r for r in ranked if r["change_pct"] > 0][:MOVERS_PER_SIDE]
    losers = [r for r in ranked if r["change_pct"] < 0]
    losers = losers[-MOVERS_PER_SIDE:][::-1]  # most-negative first
    return {"gainers": gainers, "losers": losers}
