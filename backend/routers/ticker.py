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
from datetime import datetime, UTC

from fastapi import APIRouter, Depends, Query
from fastapi.responses import JSONResponse
from sqlalchemy import func, nulls_last, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from config import settings
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


async def _scorings_today(session: AsyncSession) -> int:
    """Count real LLM scorings since 00:00 UTC for the global daily cost cap.

    Every scoring writes one SentimentScore row, so counting rows is an exact,
    restart-proof tally — no separate counter to keep in sync. No-news
    placeholders (model_used='none') cost nothing, so they're excluded."""
    start = datetime.now(UTC).replace(hour=0, minute=0, second=0, microsecond=0)
    result = await session.execute(
        select(func.count())
        .select_from(SentimentScore)
        .where(SentimentScore.created_at >= start)
        .where(SentimentScore.model_used != "none")
    )
    return result.scalar_one() or 0


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
        if i < len(originals) and difflib.SequenceMatcher(None, ns, norm[i]).ratio() >= 0.6:
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

    # ---- daily cost cap --------------------------------------------------- #
    # Stale cache + over the global daily scoring ceiling: refuse a new (paid)
    # scoring and serve the last stored score as stale. Checked before any news
    # fetch so a capped request does zero upstream work. New tickers with no
    # prior score fall through to a null-sentiment stale payload.
    if await _scorings_today(session) >= settings.SCORING_DAILY_CAP:
        logger.warning(
            "daily scoring cap (%d) reached — serving %s stale",
            settings.SCORING_DAILY_CAP,
            symbol,
        )
        last = await _latest_score(session, ticker.id)
        headlines = (
            await _headlines_for_score(session, last.id) if last else []
        )
        return JSONResponse(
            status_code=503,
            content=_build_payload(ticker, last, headlines, stale=True),
        )

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


# --------------------------------------------------------------------------- #
# Batch cached sentiment — read-only, for at-a-glance lists (watchlist/recents)
# --------------------------------------------------------------------------- #
_BATCH_MAX = 50


@router.get("/sentiment/batch")
async def sentiment_batch(
    symbols: str = Query(..., description="Comma-separated symbols"),
    session: AsyncSession = Depends(get_session),
):
    """Latest STORED sentiment for many symbols at once, keyed by symbol.

    Read-only by design: it never fetches news or calls the LLM, so it's free
    and can't touch the daily scoring cap — safe to call for every watchlist /
    recents render. Symbols with no stored score (or unknown) are simply omitted.
    """
    syms: list[str] = []
    seen: set[str] = set()
    for raw in symbols.split(","):
        s = raw.strip().upper()
        if s and s not in seen:
            seen.add(s)
            syms.append(s)
        if len(syms) >= _BATCH_MAX:
            break
    if not syms:
        return {"results": {}}

    tickers = (
        await session.execute(select(Ticker).where(Ticker.symbol.in_(syms)))
    ).scalars().all()
    by_id = {t.id: t for t in tickers}
    if not by_id:
        return {"results": {}}

    # One row per ticker — the most recent score (DISTINCT ON needs the matching
    # leading ORDER BY column).
    scores = (
        await session.execute(
            select(SentimentScore)
            .where(SentimentScore.ticker_id.in_(list(by_id.keys())))
            .order_by(
                SentimentScore.ticker_id, SentimentScore.created_at.desc()
            )
            .distinct(SentimentScore.ticker_id)
        )
    ).scalars().all()

    results: dict[str, dict] = {}
    for sc in scores:
        ticker = by_id.get(sc.ticker_id)
        if ticker is None:
            continue
        results[ticker.symbol] = {
            "score": sc.score,
            "headline_count": sc.headline_count,
            "stale": not is_cache_fresh(ticker),
            "computed_at": iso(sc.created_at),
        }
    return {"results": results}
