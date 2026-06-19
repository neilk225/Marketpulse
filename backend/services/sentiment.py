"""Sentiment pipeline — OpenRouter (DeepSeek V3 free, Llama fallback).

Temperature is pinned at 0.1 per spec for consistent classification output.
``score_headlines`` raises ``SentimentUnavailable`` on any model/parse failure so
the router can fall back to the last stored score with ``stale: true``.
"""
from __future__ import annotations

import json
import logging

import httpx

from config import settings

logger = logging.getLogger("marketpulse.sentiment")

# Spec pinned deepseek/deepseek-chat:free + llama-3.1-8b-instruct:free, but both
# were retired from OpenRouter's free tier (verified June 2026 — the call 404s
# with "This model is unavailable for free"). Using a cheap paid primary for
# quality/reliability on the signature sentiment feature, with a free fallback.
PRIMARY_MODEL = "anthropic/claude-haiku-4.5"
FALLBACK_MODEL = "meta-llama/llama-3.3-70b-instruct:free"

SYSTEM_PROMPT = """You are a financial sentiment analyst specializing in \
{asset_class} markets.
You will be given a list of news headlines about {symbol} ({name}).

Analyze each headline's sentiment from the perspective of a {asset_class}
investor holding {symbol}. Return ONLY a valid JSON object — no preamble, no
markdown fences, no explanation outside the JSON. The object must have exactly
these two fields:

  - "summary": a 2-3 sentence plain-English explanation of the OVERALL
      sentiment and what is driving it. Reference the concrete themes in the
      headlines (e.g. earnings, regulation, product launches). Write for a
      retail investor. If there is no meaningful news, say so plainly.
  - "headlines": an array where each object has exactly these fields:
      - "title": the original headline text (string)
      - "sentiment": one of "positive", "negative", "neutral" (string)
      - "score": float 0.0-1.0 where:
          0.0 = catastrophic / extremely bearish
          0.5 = neutral
          1.0 = major bullish catalyst
      - "confidence": one of "high", "medium", "low" (string)

If a headline is unrelated to {symbol} or too ambiguous to score,
set sentiment="neutral", score=0.5, confidence="low"."""

USER_PROMPT = """Analyze sentiment for {symbol} ({asset_class}) — {name}:
{numbered_headlines}"""


class SentimentUnavailable(Exception):
    """Raised when OpenRouter returns non-200 or the response can't be parsed."""


async def score_headlines(
    headlines: list[dict], symbol: str, name: str, asset_class: str
) -> tuple[list[dict], str, str]:
    """Return (scored_headlines, model_used, summary).

    ``scored_headlines`` is the per-headline array; ``model_used`` is the model
    OpenRouter actually served (after fallback routing); ``summary`` is the
    model's plain-English explanation of the aggregate sentiment.
    """
    numbered = "\n".join(f"{i+1}. {h['title']}" for i, h in enumerate(headlines))
    payload = {
        "models": [PRIMARY_MODEL, FALLBACK_MODEL],
        "route": "fallback",
        "messages": [
            {
                "role": "system",
                "content": SYSTEM_PROMPT.format(
                    asset_class=asset_class, symbol=symbol, name=name
                ),
            },
            {
                "role": "user",
                "content": USER_PROMPT.format(
                    symbol=symbol,
                    asset_class=asset_class,
                    name=name,
                    numbered_headlines=numbered,
                ),
            },
        ],
        "max_tokens": 2000,
        "temperature": 0.1,
    }
    try:
        async with httpx.AsyncClient() as client:
            r = await client.post(
                "https://openrouter.ai/api/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {settings.OPENROUTER_API_KEY}",
                    "Content-Type": "application/json",
                },
                json=payload,
                timeout=30.0,
            )
            r.raise_for_status()
    except Exception as exc:  # noqa: BLE001
        logger.warning("OpenRouter request failed for %s: %s", symbol, exc)
        raise SentimentUnavailable(str(exc)) from exc

    try:
        body = r.json()
        raw = body["choices"][0]["message"]["content"]
        model_used = body.get("model") or PRIMARY_MODEL
        clean = raw.strip().removeprefix("```json").removesuffix("```").strip()
        parsed = json.loads(clean)
        if not isinstance(parsed, dict):
            raise ValueError("model did not return a JSON object")
        scored = parsed.get("headlines")
        if not isinstance(scored, list):
            raise ValueError("model response missing 'headlines' array")
        summary = str(parsed.get("summary") or "").strip()
    except Exception as exc:  # noqa: BLE001
        logger.warning("OpenRouter parse failed for %s: %s", symbol, exc)
        raise SentimentUnavailable(str(exc)) from exc

    return _sanitize(scored), model_used, summary


_VALID_SENTIMENTS = {"positive", "negative", "neutral"}
_VALID_CONFIDENCE = {"high", "medium", "low"}


def _sanitize(scored: list[dict]) -> list[dict]:
    """Coerce model output into the constrained shape the DB CHECKs require."""
    clean: list[dict] = []
    for s in scored:
        if not isinstance(s, dict) or not s.get("title"):
            continue
        sentiment = str(s.get("sentiment", "neutral")).lower()
        if sentiment not in _VALID_SENTIMENTS:
            sentiment = "neutral"
        confidence = str(s.get("confidence", "low")).lower()
        if confidence not in _VALID_CONFIDENCE:
            confidence = "low"
        try:
            score = float(s.get("score", 0.5))
        except (TypeError, ValueError):
            score = 0.5
        score = min(1.0, max(0.0, score))
        clean.append(
            {
                "title": str(s["title"]),
                "sentiment": sentiment,
                "score": score,
                "confidence": confidence,
            }
        )
    return clean


def compute_aggregate(scored: list[dict]) -> dict:
    if not scored:
        return {
            "score": 0.5,
            "positive_pct": 0.0,
            "negative_pct": 0.0,
            "neutral_pct": 0.0,
            "headline_count": 0,
        }
    weights = {"high": 1.0, "medium": 0.75, "low": 0.4}
    weighted = [
        s["score"] * weights.get(s["confidence"], 0.75)
        + 0.5 * (1 - weights.get(s["confidence"], 0.75))
        for s in scored
    ]
    total = len(scored)
    pos = sum(1 for s in scored if s["sentiment"] == "positive")
    neg = sum(1 for s in scored if s["sentiment"] == "negative")
    neu = sum(1 for s in scored if s["sentiment"] == "neutral")
    return {
        "score": round(sum(weighted) / total, 4),
        "positive_pct": round(pos / total * 100, 1),
        "negative_pct": round(neg / total * 100, 1),
        "neutral_pct": round(neu / total * 100, 1),
        "headline_count": total,
    }
