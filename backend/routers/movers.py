"""GET /api/movers/{stocks,crypto,commodities} — top gainers/losers.

Cache-aware (spec): before fetching, check the latest ``fetched_at`` for the
asset_class in ``market_movers``. If < 10 min old, return the stored rows.
Otherwise fetch fresh, replace that asset_class's rows, and return.

All sources are market data only — no OpenRouter / LLM cost.
"""
from __future__ import annotations

import logging
from datetime import datetime, timedelta, UTC

from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse
from sqlalchemy import delete, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from models import MarketMover, Ticker, get_session
from services.dates import iso
from services.market_data import (
    MoversUnavailable,
    fetch_commodity_movers,
    fetch_crypto_movers,
    fetch_stock_movers,
)

logger = logging.getLogger("marketpulse.movers")

router = APIRouter(prefix="/api/movers", tags=["movers"])

CACHE_TTL = timedelta(minutes=10)

# asset_class -> fetcher
_FETCHERS = {
    "stock": fetch_stock_movers,
    "crypto": fetch_crypto_movers,
    "commodity": fetch_commodity_movers,
}


async def _latest_fetched_at(
    session: AsyncSession, asset_class: str
) -> datetime | None:
    result = await session.execute(
        select(MarketMover.fetched_at)
        .where(MarketMover.asset_class == asset_class)
        .order_by(MarketMover.fetched_at.desc())
        .limit(1)
    )
    return result.scalar_one_or_none()


def _is_fresh(fetched_at: datetime | None) -> bool:
    if fetched_at is None:
        return False
    if fetched_at.tzinfo is None:
        fetched_at = fetched_at.replace(tzinfo=UTC)
    return datetime.now(UTC) - fetched_at < CACHE_TTL


async def _read_cached(session: AsyncSession, asset_class: str) -> dict:
    result = await session.execute(
        select(MarketMover)
        .where(MarketMover.asset_class == asset_class)
        .order_by(MarketMover.change_pct.desc())
    )
    rows = list(result.scalars().all())
    # If two concurrent fresh fetches ever raced, the table can hold more than
    # one batch — keep only the most recent fetched_at so we never show dupes.
    cached_at = max((r.fetched_at for r in rows), default=None)
    if cached_at is not None:
        rows = [r for r in rows if r.fetched_at == cached_at]
    return {
        "gainers": [_row_dict(r) for r in rows if r.direction == "gainer"],
        "losers": [_row_dict(r) for r in rows if r.direction == "loser"][::-1],
        "cached_at": iso(cached_at),
    }


def _row_dict(r: MarketMover) -> dict:
    return {
        "symbol": r.symbol,
        "name": r.name,
        "price": r.price,
        "change_pct": r.change_pct,
    }


async def _replace_cache(
    session: AsyncSession, asset_class: str, data: dict, fetched_at: datetime
) -> None:
    await session.execute(
        delete(MarketMover).where(MarketMover.asset_class == asset_class)
    )
    for direction in ("gainer", "loser"):
        key = "gainers" if direction == "gainer" else "losers"
        for m in data.get(key, []):
            session.add(
                MarketMover(
                    asset_class=asset_class,
                    direction=direction,
                    symbol=m["symbol"],
                    name=m["name"],
                    price=m["price"],
                    change_pct=m["change_pct"],
                    fetched_at=fetched_at,
                )
            )
    await session.commit()


async def _upsert_tickers(
    session: AsyncSession, asset_class: str, data: dict
) -> None:
    """Make movers clickable: ensure every mover symbol exists in `tickers`.

    Screener/CoinGecko movers routinely fall outside the seeded universe (S&P
    500 + top-100 crypto), so without this they'd 404 on click. We already have
    symbol/name/asset_class from the fetch — no extra upstream calls. Conflicts
    on an existing symbol are ignored (keep the seeded row)."""
    rows = {}
    for m in [*data.get("gainers", []), *data.get("losers", [])]:
        sym = (m.get("symbol") or "").upper().strip()
        if sym and sym not in rows:
            rows[sym] = {
                "symbol": sym,
                "name": m.get("name") or sym,
                "asset_class": asset_class,
            }
    if not rows:
        return
    stmt = pg_insert(Ticker).values(list(rows.values()))
    stmt = stmt.on_conflict_do_nothing(index_elements=["symbol"])
    await session.execute(stmt)
    await session.commit()


async def _movers(session: AsyncSession, asset_class: str) -> JSONResponse | dict:
    latest = await _latest_fetched_at(session, asset_class)
    if _is_fresh(latest):
        return await _read_cached(session, asset_class)

    try:
        data = await _FETCHERS[asset_class]()
    except MoversUnavailable:
        # Upstream down — serve stale rows if we have any, else 503.
        if latest is not None:
            cached = await _read_cached(session, asset_class)
            cached["stale"] = True
            return JSONResponse(status_code=503, content=cached)
        return JSONResponse(
            status_code=503,
            content={"error": "Market data temporarily unavailable"},
        )

    fetched_at = datetime.now(UTC)
    await _replace_cache(session, asset_class, data, fetched_at)
    await _upsert_tickers(session, asset_class, data)
    return {
        "gainers": data["gainers"],
        "losers": data["losers"],
        "cached_at": iso(fetched_at),
    }


@router.get("/stocks")
async def movers_stocks(session: AsyncSession = Depends(get_session)):
    return await _movers(session, "stock")


@router.get("/crypto")
async def movers_crypto(session: AsyncSession = Depends(get_session)):
    return await _movers(session, "crypto")


@router.get("/commodities")
async def movers_commodities(session: AsyncSession = Depends(get_session)):
    return await _movers(session, "commodity")
