// localStorage-backed watchlist (per spec).
const KEY = "marketpulse_watchlist";

export const getWatchlist = (): string[] => {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "[]");
  } catch {
    return [];
  }
};

export const addToWatchlist = (symbol: string) => {
  const list = getWatchlist();
  if (!list.includes(symbol))
    localStorage.setItem(KEY, JSON.stringify([...list, symbol]));
};

export const removeFromWatchlist = (symbol: string) =>
  localStorage.setItem(
    KEY,
    JSON.stringify(getWatchlist().filter((s) => s !== symbol)),
  );

export const isInWatchlist = (symbol: string): boolean =>
  getWatchlist().includes(symbol);
