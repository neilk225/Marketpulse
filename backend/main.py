"""MarketPulse FastAPI entry point.

CORS is configured before any routes per spec so the Vercel frontend and local
dev server can reach the Railway backend across origins.
"""
from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from config import settings
from models import init_db
from routers import movers, search, ticker
from services.http import aclose as close_http_client

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("marketpulse")


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()  # create tables (idempotent)
    logger.info("MarketPulse backend ready")
    yield
    # Shutdown: close the shared httpx client's connection pool.
    await close_http_client()


app = FastAPI(title="MarketPulse API", version="1.1", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,  # set ALLOWED_ORIGINS in prod
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)

app.include_router(search.router)
app.include_router(ticker.router)
app.include_router(movers.router)


@app.get("/health")
async def health():
    return {"status": "ok"}
