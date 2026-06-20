"""GET /api/search — ticker autocomplete.

Local seeded tickers (instant) merged with a live Finnhub symbol search so any
real ticker is discoverable, not just the seeded ~610. This is autocomplete
only — no sentiment scoring happens here; a ticker is scored only when the user
actually opens its page.
"""
from __future__ import annotations

import re

from fastapi import APIRouter, Depends, Query
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from models import Ticker, get_session
from services.market_data import search_symbols

router = APIRouter(prefix="/api", tags=["search"])


def _rank_key(term: str):
    tl = term.lower()

    def key(r: dict) -> int:
        sym = r["symbol"].lower()
        if sym == tl:
            return 0
        if sym.startswith(tl):
            return 1
        if r["name"].lower().startswith(tl):
            return 2
        if tl in sym:
            return 3
        return 4

    return key


@router.get("/search")
async def search(
    q: str = Query(..., min_length=1, description="Search symbol or name"),
    session: AsyncSession = Depends(get_session),
):
    term = q.strip()
    # Symbol: substring is fine (symbols are short). Name: match only at a word
    # boundary so "RIOT" hits "Riot Platforms" but NOT "Mar(riot)t".
    sym_pattern = f"%{term}%"
    name_regex = r"\m" + re.escape(term)
    stmt = (
        select(Ticker)
        .where(
            or_(Ticker.symbol.ilike(sym_pattern), Ticker.name.op("~*")(name_regex))
        )
        .limit(10)
    )
    result = await session.execute(stmt)
    local = [
        {"symbol": t.symbol, "name": t.name, "asset_class": t.asset_class}
        for t in result.scalars().all()
    ]

    # Augment with live results; local (seeded) entries win on symbol collision.
    seen = {r["symbol"] for r in local}
    remote = [r for r in await search_symbols(term) if r["symbol"] not in seen]

    # Stable sort by relevance keeps local entries ahead of remote within a tier.
    merged = sorted(local + remote, key=_rank_key(term))
    return {"results": merged[:10]}
