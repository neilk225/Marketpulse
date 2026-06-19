"""Cache freshness helpers."""
from __future__ import annotations

from datetime import datetime, UTC

from models import Ticker

CACHE_TTL_SECONDS = 600  # 10 minutes


def is_cache_fresh(ticker: Ticker) -> bool:
    if not ticker.last_fetched_at:
        return False
    last = ticker.last_fetched_at
    # Stored as TIMESTAMPTZ; guard against a naive value just in case.
    if last.tzinfo is None:
        last = last.replace(tzinfo=UTC)
    return (datetime.now(UTC) - last).total_seconds() < CACHE_TTL_SECONDS
