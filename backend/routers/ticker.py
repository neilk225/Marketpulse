"""GET /api/ticker/{symbol} — cache-aware sentiment pipeline.

Flow:
  1. Validate symbol format        -> 422 on bad format
  2. Look up ticker in DB          -> 404 if not seeded
  3. Cache fresh (< 1 hour)        -> return last stored score, stale=false
  4. Cache stale                   -> fetch news, score, persist, return
  5. No news at all                -> store score 0.5 / count 0
  6. All models unavailable        -> last stored score, stale=true, HTTP 503
"""
from __future__ import annotations

import difflib
import logging
import re
from difflib import SequenceMatcher

from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse
from sqlalchemy import nulls_last, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from models import Headline, SentimentScore, Ticker, get_session
from services.cache import is_cache_fresh
from services.dates import iso, parse_published
from services.market_data import resolve_symbol
from services.news import fetch_headlines
from services.sentiment import (
    SentimentUnavailable,
    compute_aggregate,
    score_headlines,
)

logger = logging.getLogger("marketpulse.ticker")

router = APIRouter(prefix="/api", tags=["ticker"])

SYMBOL_RE = re.compile(r"^[A-Za-z0-9.\-=^!]{1,20}$")


# --------------------------------------------------------------------------- #
# DB helpers
# --------------------------------------------------------------------------- #
async def _get_ticker(session: AsyncSession, symbol: str) -> Ticker | None:
    result = await session.execute(
        select(Ticker).where(Ticker.symbol == symbol)
    )
    return result.scalar_one_or_none()


async def _latest_score(
    session: AsyncSession, ticker_id: str
) -> SentimentScore | None:
    result = await session.execute(
        select(SentimentScore)
        .where(SentimentScore.ticker_id == ticker_id)
        .order_by(SentimentScore.created_at.desc())
        .limit(1)
    )
    return result.scalar_one_or_none()


async def _headlines_for_score(
    session: AsyncSession, sentiment_score_id: str
) -> list[Headline]:
    result = await session.execute(
        select(Headline)
        .where(Headline.sentiment_score_id == sentiment_score_id)
        .order_by(nulls_last(Headline.published_at.desc()))
    )
    return list(result.scalars().all())


# --------------------------------------------------------------------------- #
# Response shaping
# --------------------------------------------------------------------------- #
def _build_payload(
    ticker: Ticker,
    score: SentimentScore | None,
    headlines: list[Headline],
    stale: bool,
) -> dict:
    if score is None:
        sentiment = None
    else:
        sentiment = {
            "score": score.score,
            "positive_pct": score.positive_pct,
            "negative_pct": score.negative_pct,
            "neutral_pct": score.neutral_pct,
            "headline_count": score.headline_count,
            "model_used": score.model_used,
            "summary": score.summary,
            "computed_at": iso(score.created_at),
        }
    return {
        "symbol": ticker.symbol,
        "name": ticker.name,
        "asset_class": ticker.asset_class,
        "stale": stale,
        "sentiment": sentiment,
        "headlines": [
            {
                "title": h.title,
                "url": h.url,
                "source": h.source,
                "sentiment": h.individual_sentiment,
                "score": h.individual_score,
                "confidence": h.confidence,
                "published_at": iso(h.published_at),
            }
            for h in headlines
        ],
    }


# --------------------------------------------------------------------------- #
# Persistence
# --------------------------------------------------------------------------- #
def _norm_title(t: str) -> str:
    """Normalize a headline for matching: lowercase, drop a trailing
    ' - Publisher' / ' | Publisher' suffix (Google News appends these and the
    model often strips them), and reduce to alphanumeric tokens."""
    t = t.lower().strip()
    t = re.sub(r"\s+[-|–—]\s+[^-|–—]+$", "", t)
    t = re.sub(r"[^a-z0-9]+", " ", t).strip()
    return t


def _match_originals(scored: list[dict], originals: list[dict]) -> list[dict]:
    """Pair each model-scored headline back to the original feed item (which has
    url/source/published_at). Order is normally preserved, so try the positional
    match first with a similarity guard, then fall back to exact-normalized and
    fuzzy title matching. Unmatched -> {} (caller defaults source/url)."""
    norm = [_norm_title(o.get("title", "")) for o in originals]
    norm_map = {n: o for n, o in zip(norm, originals)}
    matches: list[dict] = []
    for i, s in enumerate(scored):
        ns = _norm_title(s.get("title", ""))
        chosen: dict | None = None
        if i < len(originals) and SequenceMatcher(None, ns, norm[i]).ratio() >= 0.6:
            chosen = originals[i]
        if chosen is None and ns in norm_map:
            chosen = norm_map[ns]
        if chosen is None:
            close = difflib.get_close_matches(ns, norm, n=1, cutoff=0.7)
            if close:
                chosen = norm_map[close[0]]
        matches.append(chosen or {})
    return matches


async def _persist(
    session: AsyncSession,
    ticker: Ticker,
    aggregate: dict,
    model_used: str,
    scored: list[dict],
    originals: list[dict],
    summary: str = "",
) -> tuple[SentimentScore, list[Headline]]:
    score = SentimentScore(
        ticker_id=ticker.id,
        score=aggregate["score"],
        positive_pct=aggregate["positive_pct"],
        negative_pct=aggregate["negative_pct"],
        neutral_pct=aggregate["neutral_pct"],
        headline_count=aggregate["headline_count"],
        model_used=model_used,
        summary=summary or None,
    )
    session.add(score)
    await session.flush()  # assign score.id for the FK below

    # Match each scored headline back to its original to recover url/source/date.
    matched = _match_originals(scored, originals)
    headline_rows: list[Headline] = []
    for s, original in zip(scored, matched):
        row = Headline(
            ticker_id=ticker.id,
            sentiment_score_id=score.id,
            title=s["title"],
            url=original.get("url") or "",
            source=original.get("source") or "google_news",
            individual_sentiment=s["sentiment"],
            individual_score=s["score"],
            confidence=s["confidence"],
            published_at=parse_published(original.get("published_at")),
        )
        session.add(row)
        headline_rows.append(row)

    from datetime import datetime, UTC

    ticker.last_fetched_at = datetime.now(UTC)
    await session.commit()
    await session.refresh(score)
    return score, headline_rows


# --------------------------------------------------------------------------- #
# Endpoint
# --------------------------------------------------------------------------- #
@router.get("/ticker/{symbol}")
async def get_ticker(
    symbol: str,
    session: AsyncSession = Depends(get_session),
):
    if not SYMBOL_RE.match(symbol):
        return JSONResponse(
            status_code=422,
            content={"error": "Invalid symbol format", "symbol": symbol},
        )

    symbol = symbol.upper().strip()
    ticker = await _get_ticker(session, symbol)
    if ticker is None:
        # Not seeded — try to resolve it on demand (any valid equity/ETF/future/
        # crypto), seed it, then proceed. Keeps coverage open beyond the 610
        # seeded tickers without a full re-seed.
        resolved = await resolve_symbol(symbol)
        if resolved is None:
            return JSONResponse(
                status_code=404,
                content={"error": "Ticker not found", "symbol": symbol},
            )
        await session.execute(
            pg_insert(Ticker)
            .values(resolved)
            .on_conflict_do_nothing(index_elements=["symbol"])
        )
        await session.commit()
        ticker = await _get_ticker(session, symbol)
        if ticker is None:
            return JSONResponse(
                status_code=404,
                content={"error": "Ticker not found", "symbol": symbol},
            )

    # ---- cache hit -------------------------------------------------------- #
    if is_cache_fresh(ticker):
        score = await _latest_score(session, ticker.id)
        headlines = (
            await _headlines_for_score(session, score.id) if score else []
        )
        return _build_payload(ticker, score, headlines, stale=False)

    # ---- cache miss: run pipeline ---------------------------------------- #
    raw_headlines = await fetch_headlines(symbol, ticker.asset_class, ticker.name)

    # No news from any feed -> store a neutral 0.5 score with 0 headlines.
    if not raw_headlines:
        aggregate = compute_aggregate([])
        score, headlines = await _persist(
            session, ticker, aggregate, "none", [], []
        )
        return _build_payload(ticker, score, headlines, stale=False)

    # Score via OpenRouter; fall back to last stored score on failure.
    try:
        scored, model_used, summary = await score_headlines(
            raw_headlines, symbol, ticker.name, ticker.asset_class
        )
    except SentimentUnavailable:
        last = await _latest_score(session, ticker.id)
        headlines = (
            await _headlines_for_score(session, last.id) if last else []
        )
        return JSONResponse(
            status_code=503,
            content=_build_payload(ticker, last, headlines, stale=True),
        )

    aggregate = compute_aggregate(scored)
    score, headlines = await _persist(
        session, ticker, aggregate, model_used, scored, raw_headlines, summary
    )
    return _build_payload(ticker, score, headlines, stale=False)
