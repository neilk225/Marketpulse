// localStorage-backed "recently viewed" tickers — most-recent-first, capped.
const KEY = "marketpulse_recents";
const MAX = 5;

export const getRecents = (): string[] => {
  if (typeof window === "undefined") return [];
  try {
    const list = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(list) ? list.slice(0, MAX) : [];
  } catch {
    return [];
  }
};

/**
 * Record a ticker as most-recent. Dedupes (an existing entry moves to the
 * front) and keeps only the latest MAX — adding a 6th drops the oldest.
 */
export const pushRecent = (symbol: string): void => {
  if (typeof window === "undefined") return;
  const sym = symbol.trim().toUpperCase();
  if (!sym) return;
  const next = [sym, ...getRecents().filter((s) => s !== sym)].slice(0, MAX);
  localStorage.setItem(KEY, JSON.stringify(next));
};
