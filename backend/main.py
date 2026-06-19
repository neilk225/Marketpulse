"""MarketPulse FastAPI entry point.

CORS is configured before any routes per spec so the Vercel frontend and local
dev server can reach the Railway backend across origins.
"""
from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from models import AsyncSessionLocal, init_db
from routers import search, ticker
from services.detection import load_known_crypto_symbols

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("marketpulse")


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Create tables (idempotent) and warm the crypto-symbol set from the DB so
    # bare symbols like BTC/ETH detect as crypto.
    await init_db()
    async with AsyncSessionLocal() as session:
        await load_known_crypto_symbols(session)
    logger.info("MarketPulse backend ready")
    yield


app = FastAPI(title="MarketPulse API", version="1.1", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://marketpulse.vercel.app",
        "http://localhost:3000",  # local dev
    ],
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)

app.include_router(search.router)
app.include_router(ticker.router)


@app.get("/health")
async def health():
    return {"status": "ok"}
