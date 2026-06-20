// localStorage-backed watchlist (per spec).
// Mutations dispatch a "watchlist-change" event so same-tab listeners (the
// sidebar) update immediately — the native "storage" event only fires in OTHER
// tabs, not the one making the change.
const KEY = "marketpulse_watchlist";
export const WATCHLIST_EVENT = "watchlist-change";

function notify() {
  if (typeof window !== "undefined")
    window.dispatchEvent(new Event(WATCHLIST_EVENT));
}

export const getWatchlist = (): string[] => {
  if (typeof window === "undefined") return [];
  try {
    const list = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    if (!Array.isArray(list)) return [];
    // Tolerate entries left by other versions: a bare "AAPL" string OR an
    // { symbol, ... } object. Coerce everything to an uppercase symbol so the
    // rest of the app always sees string[]. (Storage self-heals to strings on
    // the next add/remove.)
    return list
      .map((e) =>
        typeof e === "string"
          ? e
          : e && typeof e.symbol === "string"
            ? e.symbol
            : null,
      )
      .filter((s): s is string => !!s)
      .map((s) => s.toUpperCase());
  } catch {
    return [];
  }
};

export const addToWatchlist = (symbol: string) => {
  const sym = symbol.trim().toUpperCase();
  const list = getWatchlist();
  if (sym && !list.includes(sym)) {
    localStorage.setItem(KEY, JSON.stringify([...list, sym]));
    notify();
  }
};

export const removeFromWatchlist = (symbol: string) => {
  const sym = symbol.trim().toUpperCase();
  localStorage.setItem(
    KEY,
    JSON.stringify(getWatchlist().filter((s) => s !== sym)),
  );
  notify();
};

export const isInWatchlist = (symbol: string): boolean =>
  getWatchlist().includes(symbol.trim().toUpperCase());

export const toggleWatchlist = (symbol: string): boolean => {
  const inList = isInWatchlist(symbol);
  if (inList) removeFromWatchlist(symbol);
  else addToWatchlist(symbol);
  return !inList;
};
