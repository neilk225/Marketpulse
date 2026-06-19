"""Market-data fetchers for the top-movers endpoints.

Three asset classes, three sources (all market data — no LLM cost):
  - stocks      : yfinance predefined screeners (day_gainers / day_losers)
  - commodities : yfinance fast_info over the hardcoded futures list
  - crypto      : CoinGecko /coins/markets (top by market cap), sorted locally

Every fetcher returns ``{"gainers": [...], "losers": [...]}`` where each item is
``{"symbol", "name", "price", "change_pct"}``. yfinance is blocking, so its
calls are offloaded to a thread to keep the event loop free.
"""
from __future__ import annotations

import asyncio
import logging

import httpx
import yfinance as yf

from config import settings

logger = logging.getLogger("marketpulse.market_data")

MOVERS_PER_SIDE = 5

# Same futures list the seeder uses; movers are computed over these.
COMMODITY_TICKERS: list[tuple[str, str]] = [
    ("GC=F", "Gold Futures"),
    ("SI=F", "Silver Futures"),
    ("CL=F", "Crude Oil Futures"),
    ("NG=F", "Natural Gas Futures"),
    ("ZW=F", "Wheat Futures"),
    ("ZC=F", "Corn Futures"),
    ("HG=F", "Copper Futures"),
    ("PL=F", "Platinum Futures"),
]

COINGECKO_MARKETS = "https://api.coingecko.com/api/v3/coins/markets"


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
# Stocks — yfinance predefined screeners
# --------------------------------------------------------------------------- #
def _screen_side(screen: str) -> list[dict]:
    res = yf.screen(screen, count=MOVERS_PER_SIDE)
    quotes = (res or {}).get("quotes", []) if isinstance(res, dict) else []
    rows: list[dict] = []
    for q in quotes:
        m = _mover(
            q.get("symbol", ""),
            q.get("shortName") or q.get("longName") or q.get("symbol", ""),
            q.get("regularMarketPrice"),
            q.get("regularMarketChangePercent"),
        )
        if m:
            rows.append(m)
    return rows


def _fetch_stock_movers_sync() -> dict:
    return {
        "gainers": _screen_side("day_gainers"),
        "losers": _screen_side("day_losers"),
    }


async def fetch_stock_movers() -> dict:
    try:
        return await asyncio.to_thread(_fetch_stock_movers_sync)
    except Exception as exc:  # noqa: BLE001 — any yfinance/network error
        logger.warning("stock movers fetch failed: %s", exc)
        raise MoversUnavailable(str(exc)) from exc


# --------------------------------------------------------------------------- #
# Commodities — yfinance fast_info over the futures list
# --------------------------------------------------------------------------- #
def _fetch_commodity_movers_sync() -> dict:
    symbols = [s for s, _ in COMMODITY_TICKERS]
    names = dict(COMMODITY_TICKERS)
    tickers = yf.Tickers(" ".join(symbols))
    rows: list[dict] = []
    for sym in symbols:
        try:
            fi = tickers.tickers[sym].fast_info
            last = fi.last_price
            prev = fi.previous_close
        except Exception as exc:  # noqa: BLE001
            logger.debug("commodity %s skipped: %s", sym, exc)
            continue
        if not last or not prev:
            continue
        change_pct = (last - prev) / prev * 100.0
        m = _mover(sym, names[sym], last, change_pct)
        if m:
            rows.append(m)
    return _split_by_sign(rows)


async def fetch_commodity_movers() -> dict:
    try:
        return await asyncio.to_thread(_fetch_commodity_movers_sync)
    except Exception as exc:  # noqa: BLE001
        logger.warning("commodity movers fetch failed: %s", exc)
        raise MoversUnavailable(str(exc)) from exc


# --------------------------------------------------------------------------- #
# Crypto — CoinGecko top-by-market-cap, sorted locally
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
        async with httpx.AsyncClient(timeout=15.0) as client:
            r = await client.get(COINGECKO_MARKETS, params=params, headers=headers)
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
# On-demand symbol resolution (for tickers outside the seeded universe)
# --------------------------------------------------------------------------- #
_QUOTE_TYPE_TO_ASSET = {
    "EQUITY": "stock",
    "ETF": "stock",
    "FUTURE": "commodity",
    "CRYPTOCURRENCY": "crypto",
}


def _resolve_symbol_sync(symbol: str) -> dict | None:
    t = yf.Ticker(symbol)
    fi = t.fast_info
    try:
        quote_type = fi.quote_type
        last = fi.last_price
    except Exception:  # noqa: BLE001 — yfinance raises on unknown symbols
        return None
    if not last:
        return None
    asset_class = _QUOTE_TYPE_TO_ASSET.get((quote_type or "").upper())
    if not asset_class:
        return None
    name = symbol.upper()
    try:
        info = t.info
        name = info.get("shortName") or info.get("longName") or name
    except Exception:  # noqa: BLE001 — .info is best-effort
        pass
    return {"symbol": symbol.upper(), "name": name, "asset_class": asset_class}


# US equity/ETF exchanges we surface in autocomplete (skip foreign listings,
# options, and other noise that Yahoo's search returns).
_US_EQUITY_EXCH = {"NMS", "NGM", "NCM", "NYQ", "PCX", "ASE", "BTS", "PNK"}


def _search_symbols_sync(term: str) -> list[dict]:
    results = yf.Search(term, max_results=10).quotes
    out: list[dict] = []
    for q in results:
        sym = (q.get("symbol") or "").strip()
        if not sym:
            continue
        quote_type = (q.get("quoteType") or "").upper()
        exch = (q.get("exchange") or "").upper()
        name = q.get("shortname") or q.get("longname") or sym
        if quote_type in ("EQUITY", "ETF") and exch in _US_EQUITY_EXCH:
            asset_class = "stock"
        elif quote_type == "CRYPTOCURRENCY" and exch == "CCC":
            asset_class = "crypto"
            if sym.endswith("-USD"):
                sym = sym[:-4]  # display BTC, not BTC-USD
        elif quote_type == "FUTURE" and sym.endswith("=F"):
            asset_class = "commodity"
        else:
            continue
        out.append(
            {"symbol": sym.upper(), "name": name.strip(), "asset_class": asset_class}
        )
    return out


async def search_symbols(term: str) -> list[dict]:
    """Live symbol search via Yahoo, filtered to US equities/ETFs, crypto and
    futures. Used to augment local autocomplete so unseeded tickers (RIOT, ASTS…)
    are discoverable. Returns [] on any error — autocomplete falls back to local."""
    try:
        return await asyncio.to_thread(_search_symbols_sync, term)
    except Exception as exc:  # noqa: BLE001
        logger.warning("symbol search failed for %r: %s", term, exc)
        return []


async def resolve_symbol(symbol: str) -> dict | None:
    """Resolve an unseeded symbol to {symbol, name, asset_class} via yfinance.

    Returns None if the symbol isn't a real equity/ETF/future/crypto, so the
    caller can 404. Only equities, ETFs, futures and crypto are accepted —
    indices/currencies/funds are rejected to keep the news pipeline meaningful.
    """
    try:
        return await asyncio.to_thread(_resolve_symbol_sync, symbol)
    except Exception as exc:  # noqa: BLE001
        logger.warning("symbol resolve failed for %s: %s", symbol, exc)
        return None


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
