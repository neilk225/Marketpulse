"""Cache-aware sentiment pipeline for a single ticker.

Served as two stages so the page can paint before the (slow) LLM call finishes:

  GET /api/ticker/{symbol}/preview  — resolve/seed, fetch headlines, return the
      shell (header + unscored headlines) immediately. On a cache hit it returns
      the full stored payload instead, so the client skips the score call.
  GET /api/ticker/{symbol}/score    — run the LLM on those headlines, persist,
      return the scored payload (gauge / analysis / breakdown + per-headline
      sentiment). Reuses preview's fetched headlines via a short-TTL stash.

  GET /api/ticker/{symbol}          — the combined one-shot (both stages in one
      request); kept for non-progressive callers.

Shared flow within a stage:
  1. Validate symbol format        -> 422 on bad format
  2. Look up / resolve+seed ticker -> 404 if unresolvable
  3. Cache fresh (< 1 hour)        -> return last stored score, stale=false
  4. Over daily scoring cap        -> last stored score, stale=true, HTTP 503
  5. No news at all                -> store score 0.5 / count 0
  6. All models unavailable        -> last stored score, stale=true, HTTP 503
"""
from __future__ import annotations

import difflib
import logging
import re
import time
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
    pending: bool = False,
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
        "pending": pending,
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


def _preview_payload(ticker: Ticker, raw_headlines: list[dict]) -> dict:
    """The pre-scoring shell: ticker meta + headline text, no sentiment yet.

    ``pending: true`` tells the client a score request will fill in the gauge.
    Per-headline sentiment/score/confidence are null until the LLM runs."""
    return {
        "symbol": ticker.symbol,
        "name": ticker.name,
        "asset_class": ticker.asset_class,
        "stale": False,
        "pending": True,
        "sentiment": None,
        "headlines": [
            {
                "title": h.get("title", ""),
                "url": h.get("url") or "",
                "source": h.get("source") or "google_news",
                "sentiment": None,
                "score": None,
                "confidence": None,
                "published_at": (
                    iso(dt) if (dt := parse_published(h.get("published_at"))) else None
                ),
            }
            for h in raw_headlines
        ],
    }


# --------------------------------------------------------------------------- #
# Raw-headline stash — hands the headlines fetched in /preview to /score so the
# two stages don't each hit the news feeds. In-process and short-lived; on a
# miss (expired, or a different worker served /preview) /score just refetches.
# --------------------------------------------------------------------------- #
_RAW_STASH: dict[str, tuple[float, list[dict]]] = {}
_STASH_TTL = 120.0  # seconds


def _stash_put(symbol: str, headlines: list[dict]) -> None:
    _RAW_STASH[symbol] = (time.monotonic(), headlines)


def _stash_pop(symbol: str) -> list[dict] | None:
    item = _RAW_STASH.pop(symbol, None)
    if item is None:
        return None
    ts, headlines = item
    if time.monotonic() - ts > _STASH_TTL:
        return None
    return headlines


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
# Stage helpers — shared by /preview, /score and the combined endpoint
# --------------------------------------------------------------------------- #
def _validate_symbol(symbol: str) -> JSONResponse | None:
    if not SYMBOL_RE.match(symbol):
        return JSONResponse(
            status_code=422,
            content={"error": "Invalid symbol format", "symbol": symbol},
        )
    return None


async def _resolve_or_seed(
    session: AsyncSession, symbol: str
) -> Ticker | JSONResponse:
    """Return the ticker, seeding it on demand. Resolving any valid equity/ETF/
    future/crypto keeps coverage open beyond the seeded set without a re-seed.
    Returns a 404 JSONResponse if the symbol can't be resolved."""
    ticker = await _get_ticker(session, symbol)
    if ticker is not None:
        return ticker
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
    return ticker


async def _fresh_payload(session: AsyncSession, ticker: Ticker) -> dict:
    """Cache hit: the latest stored score with its headlines, stale=false."""
    score = await _latest_score(session, ticker.id)
    headlines = await _headlines_for_score(session, score.id) if score else []
    return _build_payload(ticker, score, headlines, stale=False)


async def _stale_503(session: AsyncSession, ticker: Ticker) -> JSONResponse:
    """Serve the last stored score as stale (HTTP 503) — used when over the daily
    cap or when every model is unavailable."""
    last = await _latest_score(session, ticker.id)
    headlines = await _headlines_for_score(session, last.id) if last else []
    return JSONResponse(
        status_code=503,
        content=_build_payload(ticker, last, headlines, stale=True),
    )


async def _persist_no_news(session: AsyncSession, ticker: Ticker) -> dict:
    """No news from any feed -> store a neutral 0.5 score with 0 headlines."""
    aggregate = compute_aggregate([])
    score, headlines = await _persist(session, ticker, aggregate, "none", [], [])
    return _build_payload(ticker, score, headlines, stale=False)


async def _score_and_persist(
    session: AsyncSession, ticker: Ticker, raw_headlines: list[dict]
) -> dict | JSONResponse:
    """Run the LLM on already-fetched headlines, persist, return the payload.
    Falls back to the last stored score (stale 503) if scoring is unavailable."""
    try:
        scored, model_used, summary = await score_headlines(
            raw_headlines, ticker.symbol, ticker.name, ticker.asset_class
        )
    except SentimentUnavailable:
        return await _stale_503(session, ticker)
    aggregate = compute_aggregate(scored)
    score, headlines = await _persist(
        session, ticker, aggregate, model_used, scored, raw_headlines, summary
    )
    return _build_payload(ticker, score, headlines, stale=False)


def _over_daily_cap_log(symbol: str) -> None:
    logger.warning(
        "daily scoring cap (%d) reached — serving %s stale",
        settings.SCORING_DAILY_CAP,
        symbol,
    )


async def _resolve_and_gate(
    session: AsyncSession, symbol: str
) -> Ticker | JSONResponse | dict:
    """Shared front half of the three ticker endpoints.

    Returns the ``Ticker`` to score, OR a ready response (a fresh/stale payload
    dict or a JSONResponse) the caller should return as-is. The four early exits
    are identical across /preview, /score and the combined endpoint:
      bad symbol format -> 422  ·  unresolvable -> 404
      cache fresh       -> last stored score (stale=false)
      over daily cap    -> last stored score (stale=true, 503)
    On the proceed path ``ticker.symbol`` is the canonical (normalized) symbol.
    """
    if (bad := _validate_symbol(symbol)) is not None:
        return bad
    symbol = symbol.upper().strip()
    ticker = await _resolve_or_seed(session, symbol)
    if isinstance(ticker, JSONResponse):
        return ticker
    if is_cache_fresh(ticker):
        return await _fresh_payload(session, ticker)
    if await _scorings_today(session) >= settings.SCORING_DAILY_CAP:
        _over_daily_cap_log(symbol)
        return await _stale_503(session, ticker)
    return ticker


# --------------------------------------------------------------------------- #
# Endpoints
# --------------------------------------------------------------------------- #
@router.get("/ticker/{symbol}/preview")
async def get_ticker_preview(
    symbol: str,
    session: AsyncSession = Depends(get_session),
):
    """Stage 1: paint-ready shell. Returns ticker meta + unscored headlines fast.
    On a cache hit (or no-news) it returns the final payload instead, so the
    client can tell from ``pending``/``sentiment`` whether a score call is needed.
    """
    gated = await _resolve_and_gate(session, symbol)
    if not isinstance(gated, Ticker):
        return gated
    ticker = gated

    raw_headlines = await fetch_headlines(
        ticker.symbol, ticker.asset_class, ticker.name
    )
    _stash_put(ticker.symbol, raw_headlines)
    if not raw_headlines:
        # Terminal state — no score call needed, return the final no-news payload.
        return await _persist_no_news(session, ticker)
    return _preview_payload(ticker, raw_headlines)


@router.get("/ticker/{symbol}/score")
async def get_ticker_score(
    symbol: str,
    session: AsyncSession = Depends(get_session),
):
    """Stage 2: the LLM scoring. Reuses /preview's fetched headlines from the
    stash (refetching on a miss), persists, and returns the scored payload.

    The gate also covers the race where a concurrent request (or the preview's
    no-news persist) populated a fresh score between preview and now — it serves
    that rather than re-scoring."""
    gated = await _resolve_and_gate(session, symbol)
    if not isinstance(gated, Ticker):
        return gated
    ticker = gated

    raw_headlines = _stash_pop(ticker.symbol)
    if raw_headlines is None:
        raw_headlines = await fetch_headlines(
            ticker.symbol, ticker.asset_class, ticker.name
        )
    if not raw_headlines:
        return await _persist_no_news(session, ticker)
    return await _score_and_persist(session, ticker, raw_headlines)


@router.get("/ticker/{symbol}")
async def get_ticker(
    symbol: str,
    session: AsyncSession = Depends(get_session),
):
    """Combined one-shot: fetch + score in a single request. Equivalent to
    /preview followed by /score, for callers that don't stage the render. The
    gate does all cache/cap/resolve checks before any upstream work."""
    gated = await _resolve_and_gate(session, symbol)
    if not isinstance(gated, Ticker):
        return gated
    ticker = gated

    raw_headlines = await fetch_headlines(
        ticker.symbol, ticker.asset_class, ticker.name
    )
    if not raw_headlines:
        return await _persist_no_news(session, ticker)
    return await _score_and_persist(session, ticker, raw_headlines)


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
