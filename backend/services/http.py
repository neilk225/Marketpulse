"""One shared httpx.AsyncClient for all outbound calls.

Constructing a fresh client per request throws away the connection pool each
time; a single long-lived client reuses TCP/TLS connections across requests.
Created lazily on first use (so it binds to the running event loop) and closed
on app shutdown (see main.lifespan). Callers pass per-request timeout/headers;
follow_redirects is on globally for the RSS feeds (Google News 302s)."""
from __future__ import annotations

import httpx

_client: httpx.AsyncClient | None = None


def get_client() -> httpx.AsyncClient:
    global _client
    if _client is None:
        _client = httpx.AsyncClient(follow_redirects=True, timeout=15.0)
    return _client


async def aclose() -> None:
    global _client
    if _client is not None:
        await _client.aclose()
        _client = None
