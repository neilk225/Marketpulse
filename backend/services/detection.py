"""Asset class detection.

``KNOWN_CRYPTO_SYMBOLS`` starts empty and is populated from the ``tickers`` table
at FastAPI startup (see ``load_known_crypto_symbols``). This lets bare crypto
symbols like BTC / ETH / SOL resolve to ``crypto`` even without a ``-USD`` suffix.
"""
from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from models import Ticker

KNOWN_CRYPTO_SYMBOLS: set[str] = set()


def detect_asset_class(symbol: str) -> str:
    symbol = symbol.upper().strip()
    if symbol.endswith("=F"):
        return "commodity"
    if symbol.endswith(("-USD", "-USDT", "-BTC")):
        return "crypto"
    if symbol in KNOWN_CRYPTO_SYMBOLS:
        return "crypto"
    return "stock"


async def load_known_crypto_symbols(session: AsyncSession) -> None:
    """Refresh the in-memory crypto-symbol set from the DB."""
    result = await session.execute(
        select(Ticker.symbol).where(Ticker.asset_class == "crypto")
    )
    KNOWN_CRYPTO_SYMBOLS.clear()
    KNOWN_CRYPTO_SYMBOLS.update(s.upper() for (s,) in result.all())
