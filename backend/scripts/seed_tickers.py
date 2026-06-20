"""Seed the `tickers` table. Run once after first deploy:

    railway run python backend/scripts/seed_tickers.py

Locally (with backend/.env populated):

    cd backend && python scripts/seed_tickers.py

Sources:
  - S&P 500 stocks: datasets/s-and-p-500-companies constituents.csv
  - Top 100 crypto: CoinGecko /coins/markets
  - Commodities: hardcoded futures list
"""
from __future__ import annotations

import asyncio
import csv
import io
import os
import sys

import httpx
from sqlalchemy.dialects.postgresql import insert as pg_insert

# Make `config` / `models` importable when run as a script.
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from config import settings  # noqa: E402
from models import AsyncSessionLocal, Ticker, init_db  # noqa: E402

SP500_CSV_URL = (
    "https://raw.githubusercontent.com/datasets/s-and-p-500-companies/"
    "main/data/constituents.csv"
)

# Commodities tracked via liquid commodity ETFs (real, quoteable, scoreable
# tickers) — keep in sync with services.market_data.COMMODITY_TICKERS.
COMMODITY_TICKERS = [
    ("GLD", "Gold"),
    ("SLV", "Silver"),
    ("USO", "Crude Oil"),
    ("UNG", "Natural Gas"),
    ("CPER", "Copper"),
    ("PPLT", "Platinum"),
    ("WEAT", "Wheat"),
    ("CORN", "Corn"),
]


async def fetch_sp500() -> list[dict]:
    async with httpx.AsyncClient(timeout=30.0) as client:
        r = await client.get(SP500_CSV_URL)
        r.raise_for_status()
    reader = csv.DictReader(io.StringIO(r.text))
    rows = []
    for row in reader:
        symbol = (row.get("Symbol") or "").strip().upper()
        name = (row.get("Security") or "").strip()
        if symbol and name:
            rows.append({"symbol": symbol, "name": name, "asset_class": "stock"})
    return rows


async def fetch_top_crypto() -> list[dict]:
    # Demo (free) tier: base host api.coingecko.com + x-cg-demo-api-key header
    # (Pro tier would be pro-api.coingecko.com + x-cg-pro-api-key).
    url = "https://api.coingecko.com/api/v3/coins/markets"
    params = {"vs_currency": "usd", "per_page": 100, "page": 1}
    headers = {}
    if settings.COINGECKO_API_KEY:
        headers["x-cg-demo-api-key"] = settings.COINGECKO_API_KEY
    async with httpx.AsyncClient(timeout=30.0) as client:
        r = await client.get(url, params=params, headers=headers)
        r.raise_for_status()
    rows = []
    for coin in r.json():
        symbol = (coin.get("symbol") or "").strip().upper()
        name = (coin.get("name") or "").strip()
        if symbol and name:
            rows.append({"symbol": symbol, "name": name, "asset_class": "crypto"})
    return rows


def commodity_rows() -> list[dict]:
    return [
        {"symbol": sym, "name": name, "asset_class": "commodity"}
        for sym, name in COMMODITY_TICKERS
    ]


async def upsert(rows: list[dict]) -> int:
    if not rows:
        return 0
    # Dedupe within this batch on symbol (S&P + crypto can rarely collide).
    deduped = {r["symbol"]: r for r in rows}
    payload = list(deduped.values())
    async with AsyncSessionLocal() as session:
        stmt = pg_insert(Ticker).values(payload)
        stmt = stmt.on_conflict_do_nothing(index_elements=["symbol"])
        await session.execute(stmt)
        await session.commit()
    return len(payload)


async def main() -> None:
    await init_db()
    print("Fetching S&P 500 constituents...")
    stocks = await fetch_sp500()
    print(f"  {len(stocks)} stocks")

    print("Fetching top 100 crypto from CoinGecko...")
    try:
        crypto = await fetch_top_crypto()
    except Exception as exc:  # noqa: BLE001
        print(f"  crypto fetch failed ({exc}); continuing without crypto")
        crypto = []
    print(f"  {len(crypto)} crypto")

    commodities = commodity_rows()
    print(f"  {len(commodities)} commodities")

    total = await upsert(stocks + crypto + commodities)
    print(f"Seed complete. {total} ticker rows upserted (existing symbols skipped).")


if __name__ == "__main__":
    asyncio.run(main())
