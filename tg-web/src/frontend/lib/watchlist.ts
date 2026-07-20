export type WatchlistTag = {
  id: string;
  clerkUserId: string;
  name: string;
  color: string | null;
  createdAt: string;
};

export type WatchlistItem = {
  id: string;
  groupId: string;
  clerkUserId: string;
  exchange: string;
  symbol: string;
  displayTicker: string;
  providerSymbol: string;
  displayName: string;
  logoUrl: string | null;
  notes: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  tags: WatchlistTag[];
};

export type WatchlistGroup = {
  id: string;
  clerkUserId: string;
  name: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  items: WatchlistItem[];
};

export type WatchlistSnapshot = {
  groups: WatchlistGroup[];
  tags: WatchlistTag[];
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

export const createWatchlistGroup = (
  name: string,
  fetchImplementation?: FetchImplementation,
) =>
  write<WatchlistGroup>(
    '/api/watchlist/groups',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    },
    fetchImplementation,
  );

export const addWatchlistItem = (
  input: {
    groupId?: string;
    exchange: string;
    symbol: string;
    displayTicker: string;
    providerSymbol: string;
    displayName: string;
    logoUrl?: string | null;
    notes?: string | null;
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

export const createWatchlistTag = (
  input: { name: string; color?: string | null },
  fetchImplementation?: FetchImplementation,
) =>
  write<WatchlistTag>(
    '/api/watchlist/tags',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    },
    fetchImplementation,
  );

export const setWatchlistItemTags = (
  itemId: string,
  tagIds: string[],
  fetchImplementation?: FetchImplementation,
) =>
  write<{ updated: true }>(
    `/api/watchlist/items/${encodeURIComponent(itemId)}/tags`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tagIds }),
    },
    fetchImplementation,
  );

export const reorderWatchlistItems = (
  input: { groupId: string; itemIds: string[] },
  fetchImplementation?: FetchImplementation,
) =>
  write<{ reordered: true }>(
    '/api/watchlist/items/reorder',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    },
    fetchImplementation,
  );
