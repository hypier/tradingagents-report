export type WatchlistItem = {
  id: string;
  clerkUserId: string;
  exchange: string;
  symbol: string;
  displayTicker: string;
  providerSymbol: string;
  displayName: string;
  logoUrl: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

export type WatchlistSnapshot = {
  items: WatchlistItem[];
};

type FetchImplementation = typeof fetch;

async function read<T>(
  path: string,
  fetchImplementation: FetchImplementation = fetch,
) {
  const response = await fetchImplementation(path);
  if (!response.ok) throw new Error('Unable to load watchlist');
  return response.json() as Promise<{ data: T; requestId: string }>;
}

async function write<T>(
  path: string,
  init: RequestInit,
  fetchImplementation: FetchImplementation = fetch,
) {
  const response = await fetchImplementation(path, init);
  if (!response.ok) throw new Error('Unable to update watchlist');
  return response.json() as Promise<{ data: T; requestId: string }>;
}

export const getWatchlist = (fetchImplementation?: FetchImplementation) =>
  read<WatchlistSnapshot>('/api/watchlist', fetchImplementation);

export const addWatchlistItem = (
  input: {
    exchange: string;
    symbol: string;
    displayTicker: string;
    providerSymbol: string;
    displayName: string;
    logoUrl?: string | null;
  },
  fetchImplementation?: FetchImplementation,
) =>
  write<WatchlistItem>(
    '/api/watchlist/items',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    },
    fetchImplementation,
  );

export const removeWatchlistItem = (
  itemId: string,
  fetchImplementation?: FetchImplementation,
) =>
  write<{ deleted: true }>(
    `/api/watchlist/items/${encodeURIComponent(itemId)}`,
    { method: 'DELETE' },
    fetchImplementation,
  );
