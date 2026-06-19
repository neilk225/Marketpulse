"""Normalize the assorted published-at formats feeds hand us into datetimes.

Finnhub already gives a datetime, Yahoo/Google RSS give RFC-822 strings, and
CoinGecko gives either an ISO-8601 string or a unix timestamp. Anything we can't
parse becomes None (the column is nullable).
"""
from __future__ import annotations

from datetime import datetime, UTC

from dateutil import parser as date_parser


def parse_published(value) -> datetime | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=UTC)
    if isinstance(value, (int, float)):
        try:
            return datetime.fromtimestamp(value, UTC)
        except (ValueError, OSError, OverflowError):
            return None
    if isinstance(value, str):
        try:
            dt = date_parser.parse(value)
            return dt if dt.tzinfo else dt.replace(tzinfo=UTC)
        except (ValueError, OverflowError, TypeError):
            return None
    return None


def iso(dt: datetime | None) -> str | None:
    """ISO-8601 with a trailing Z (UTC), matching the spec response examples."""
    if dt is None:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=UTC)
    return dt.astimezone(UTC).strftime("%Y-%m-%dT%H:%M:%SZ")
