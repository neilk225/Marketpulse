// All fetch calls to the FastAPI backend live here.
import type {
  CachedSentiment,
  MoversResponse,
  SearchResult,
  TickerResponse,
} from "./types";

const BASE_URL =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") ?? "http://127.0.0.1:8000";

export class ApiError extends Error {
  status: number;
  symbol?: string;
  constructor(status: number, message: string, symbol?: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.symbol = symbol;
  }
}

async function getJson<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BASE_URL}${path}`, { cache: "no-store", ...init });
  } catch {
    throw new ApiError(0, "Network error — is the backend running?");
  }
  if (!res.ok) {
    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      /* ignore non-JSON error bodies */
    }
    const msg =
      (body as { error?: string })?.error ?? `Request failed (${res.status})`;
    const sym = (body as { symbol?: string })?.symbol;
    throw new ApiError(res.status, msg, sym);
  }
  return (await res.json()) as T;
}

/**
 * Shared fetch for the ticker stages.
 *
 * Note: a 503 from the backend still carries a full payload (last stored score
 * with `stale: true`), so we parse it as success rather than throwing. Only
 * 404 (not found) and 422 (bad symbol) surface as errors.
 */
async function fetchTickerStage(
  symbol: string,
  stage: "/preview" | "/score",
): Promise<TickerResponse> {
  const path = `/api/ticker/${encodeURIComponent(symbol)}${stage}`;
  let res: Response;
  try {
    res = await fetch(`${BASE_URL}${path}`, { cache: "no-store" });
  } catch {
    throw new ApiError(0, "Network error — is the backend running?", symbol);
  }
  if (res.status === 404 || res.status === 422) {
    let body: { error?: string } = {};
    try {
      body = await res.json();
    } catch {
      /* ignore */
    }
    throw new ApiError(res.status, body.error ?? "Request failed", symbol);
  }
  if (!res.ok && res.status !== 503) {
    throw new ApiError(res.status, `Request failed (${res.status})`, symbol);
  }
  return (await res.json()) as TickerResponse;
}

/**
 * GET /api/ticker/{symbol}/preview — fast shell: ticker meta + unscored
 * headlines. If `pending` is false the payload is already final (cache hit or
 * no news), so no score call is needed.
 */
export function getTickerPreview(symbol: string): Promise<TickerResponse> {
  return fetchTickerStage(symbol, "/preview");
}

/** GET /api/ticker/{symbol}/score — runs the LLM and returns the scored payload. */
export function getTickerScore(symbol: string): Promise<TickerResponse> {
  return fetchTickerStage(symbol, "/score");
}

export async function searchTickers(q: string): Promise<SearchResult[]> {
  const query = q.trim();
  if (!query) return [];
  const data = await getJson<{ results: SearchResult[] }>(
    `/api/search?q=${encodeURIComponent(query)}`,
  );
  return data.results;
}

export async function getMovers(
  assetClass: "stocks" | "crypto" | "commodities",
): Promise<MoversResponse> {
  return getJson<MoversResponse>(`/api/movers/${assetClass}`);
}

/**
 * GET /api/sentiment/batch — latest STORED sentiment for many symbols.
 * Read-only on the backend (no scoring), so it's free to call for list views.
 * Symbols with no stored score are absent from the returned map.
 */
export async function getCachedSentiments(
  symbols: string[],
): Promise<Record<string, CachedSentiment>> {
  const list = Array.from(
    new Set(symbols.map((s) => s.trim().toUpperCase()).filter(Boolean)),
  );
  if (list.length === 0) return {};
  const data = await getJson<{ results: Record<string, CachedSentiment> }>(
    `/api/sentiment/batch?symbols=${encodeURIComponent(list.join(","))}`,
  );
  return data.results ?? {};
}
