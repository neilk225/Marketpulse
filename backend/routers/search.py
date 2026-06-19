"""GET /api/search — local ticker search, no external API call."""
from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from models import Ticker, get_session

router = APIRouter(prefix="/api", tags=["search"])


@router.get("/search")
async def search(
    q: str = Query(..., min_length=1, description="Search symbol or name"),
    session: AsyncSession = Depends(get_session),
):
    term = q.strip()
    pattern = f"%{term}%"
    # Exact / prefix symbol matches first, then name matches; cap at 10.
    stmt = (
        select(Ticker)
        .where(
            or_(
                Ticker.symbol.ilike(pattern),
                Ticker.name.ilike(pattern),
            )
        )
        .order_by(
            (Ticker.symbol.ilike(term)).desc(),          # exact symbol
            (Ticker.symbol.ilike(f"{term}%")).desc(),    # symbol prefix
            Ticker.symbol.asc(),
        )
        .limit(10)
    )
    result = await session.execute(stmt)
    rows = result.scalars().all()
    return {
        "results": [
            {"symbol": t.symbol, "name": t.name, "asset_class": t.asset_class}
            for t in rows
        ]
    }
