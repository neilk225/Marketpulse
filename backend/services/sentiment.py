"""Sentiment pipeline — OpenRouter (Haiku 4.5 primary, free Llama 3.3 fallback).

Temperature is pinned at 0.1 per spec for consistent classification output.
``score_headlines`` raises ``SentimentUnavailable`` on any model/parse failure so
the router can fall back to the last stored score with ``stale: true``.
"""
from __future__ import annotations

import json
import logging
import re

from config import settings
from services.http import get_client

logger = logging.getLogger("marketpulse.sentiment")

# Spec pinned deepseek/deepseek-chat:free + llama-3.1-8b-instruct:free, but both
# were retired from OpenRouter's free tier (verified June 2026 — the call 404s
# with "This model is unavailable for free"). Using a cheap paid primary for
# quality/reliability on the signature sentiment feature, with a free fallback.
PRIMARY_MODEL = "anthropic/claude-haiku-4.5"
FALLBACK_MODEL = "meta-llama/llama-3.3-70b-instruct:free"

SYSTEM_PROMPT = """You are a financial sentiment analyst specializing in \
{asset_class} markets.
You will be given a numbered list of news headlines about {symbol} ({name}).

Score each headline by its likely IMPACT on {symbol}'s forward share price for an
investor holding {symbol} — not by how positive or negative the news merely
sounds. Judge the investment implication: e.g. a missed earnings estimate paired
with raised guidance is net positive; a market-wide selloff that happens to
mention {symbol} is near-neutral and low-confidence because it is not specific to
the company.

Return ONLY a valid JSON object — no preamble, no markdown fences, no text
outside the JSON. It must have exactly these two fields:

  - "summary": 3-4 sentences for a retail investor. Lead with the NET direction
      (bullish / bearish / mixed) and name the 1-2 concrete drivers (earnings,
      regulation, product launches, guidance, etc.). Close with one forward-
      looking sentence on the key catalyst or risk an investor should watch next.
      If there is no meaningful news, say so plainly.
  - "headlines": an array of objects, each with exactly:
      - "title": the original headline text (string)
      - "sentiment": "positive" | "negative" | "neutral"
      - "score": float 0.0-1.0 measuring price impact:
          0.00  catastrophic / existential threat
          0.25  clearly bearish
          0.50  neutral or no material impact
          0.75  clearly bullish
          1.00  major bullish catalyst
      - "confidence": how certain the impact is for THIS company:
          "high"   directly about {symbol} with a clear, material directional impact
          "medium" relevant to {symbol} but modest, indirect, or uncertain in size
          "low"    market/sector-wide, speculative/opinion, or too vague to
                   attribute to {symbol} specifically

For any headline unrelated to {symbol} or too ambiguous to score, use
sentiment="neutral", score=0.5, confidence="low"."""

USER_PROMPT = """Analyze sentiment for {symbol} ({asset_class}) — {name}:
{numbered_headlines}"""


def _price_context(quote: dict | None) -> str:
    """Render the live quote into a prompt block that tells the model to weigh
    the market's actual reaction against the headline tone. Empty string when no
    quote is available (the prompt is then headline-only, as before)."""
    if not quote or quote.get("price") is None:
        return ""
    window = quote.get("window", "today")
    lines = [f"- Current price: {quote['price']}"]
    chg = quote.get("change_pct")
    if chg is not None:
        lines.append(f"- Change ({window}): {chg:+.2f}%")
    hi, lo = quote.get("day_high"), quote.get("day_low")
    if hi is not None and lo is not None:
        lines.append(f"- Range ({window}): {lo} - {hi}")
    if quote.get("prev_close") is not None:
        lines.append(f"- Previous close: {quote['prev_close']}")
    return (
        "\n\nLIVE PRICE CONTEXT — reconcile the headlines against the market's "
        "actual reaction:\n"
        + "\n".join(lines)
        + "\nIf the price is moving sharply AGAINST the headline tone (e.g. broadly "
        "bullish headlines while the stock is down hard, or vice-versa), the market "
        "is pricing in something the headlines understate, contradict, or already "
        "discount — temper the aggregate toward the price action, lower confidence "
        "on the contradicted headlines, and name the divergence explicitly in the "
        "summary. Treat a large adverse move as a strong signal, not noise."
    )


class SentimentUnavailable(Exception):
    """Raised when OpenRouter returns non-200 or the response can't be parsed."""


async def score_headlines(
    headlines: list[dict],
    symbol: str,
    name: str,
    asset_class: str,
    quote: dict | None = None,
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
                )
                + _price_context(quote),
            },
        ],
        # Headroom for 30 scored headlines plus the summary. Each headline object
        # is ~40-60 output tokens; at 4096 a verbose run could truncate the JSON
        # and drop into the salvage path. 6144 keeps the response whole without
        # over-allocating. (Output cap only — does not affect the input prompt.)
        "max_tokens": 6144,
        "temperature": 0.1,
    }
    try:
        r = await get_client().post(
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
    except Exception as exc:  # noqa: BLE001
        logger.warning("OpenRouter response shape unexpected for %s: %s", symbol, exc)
        raise SentimentUnavailable(str(exc)) from exc

    clean = raw.strip().removeprefix("```json").removesuffix("```").strip()
    try:
        parsed = json.loads(clean)
        if not isinstance(parsed, dict):
            raise ValueError("model did not return a JSON object")
        scored = parsed.get("headlines")
        if not isinstance(scored, list):
            raise ValueError("model response missing 'headlines' array")
        summary = str(parsed.get("summary") or "").strip()
    except Exception as exc:  # noqa: BLE001
        # Most failures are truncation (max_tokens) leaving the JSON unterminated.
        # Salvage whatever complete headline objects we can rather than 503-ing.
        salvaged = _salvage(clean)
        if salvaged is None:
            logger.warning("OpenRouter parse failed for %s: %s", symbol, exc)
            raise SentimentUnavailable(str(exc)) from exc
        logger.warning(
            "OpenRouter JSON for %s was malformed (%s); salvaged %d headlines",
            symbol,
            exc,
            len(salvaged["headlines"]),
        )
        scored = salvaged["headlines"]
        summary = salvaged["summary"]

    return _sanitize(scored), model_used, summary


def _salvage(raw: str) -> dict | None:
    """Recover usable data from malformed/truncated model JSON.

    The headline objects are flat (no nested braces), so each complete ``{...}``
    can be parsed individually; a truncated trailing object simply won't match
    and is dropped. The summary is extracted separately. Returns None if nothing
    usable is found."""
    headlines: list[dict] = []
    for m in re.finditer(r"\{[^{}]*\}", raw):
        try:
            obj = json.loads(m.group(0))
        except Exception:  # noqa: BLE001
            continue
        if isinstance(obj, dict) and obj.get("title"):
            headlines.append(obj)
    if not headlines:
        return None
    summary = ""
    sm = re.search(r'"summary"\s*:\s*"((?:[^"\\]|\\.)*)"', raw)
    if sm:
        summary = sm.group(1).strip()
    return {"headlines": headlines, "summary": summary}


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
    # Confidence-weighted shrink toward neutral: a high-confidence score counts
    # in full, while a low-confidence one is pulled most of the way back to 0.5
    # (w=score*conf + 0.5*(1-conf)). Unknown confidence defaults to medium.
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
