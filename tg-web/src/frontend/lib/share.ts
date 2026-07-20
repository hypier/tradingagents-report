type FetchImplementation = typeof fetch;

export type ShareLink = {
  id: string;
  token: string;
  analysisJobId: string;
  expiresAt: string;
  revokedAt: string | null;
  maxViews: number | null;
  viewCount: number;
  createdAt: string;
  path: string;
};

export type SharedReport = {
  id: string;
  ticker: string;
  exchange?: string | null;
  trade_date?: string | null;
  asset_type?: string | null;
  analysts?: string[] | null;
  status: string;
  decision?: unknown;
  display?: {
    display_name?: string;
    logo_url?: string;
    country?: string;
  } | null;
  reports?: Record<string, unknown> | null;
  output_language?: string | null;
  created_at?: string | null;
  finished_at?: string | null;
  share_expires_at: string;
};

async function read<T>(
  path: string,
  fetchImplementation: FetchImplementation = fetch,
) {
  const response = await fetchImplementation(path);
  if (!response.ok) {
    throw new Error('Unable to load share data');
  }
  return response.json() as Promise<{ data: T; requestId: string }>;
}

async function write<T>(
  path: string,
  options: {
    method?: 'POST' | 'DELETE';
    body?: unknown;
  } = {},
  fetchImplementation: FetchImplementation = fetch,
) {
  const response = await fetchImplementation(path, {
    method: options.method ?? 'POST',
    headers: options.body
      ? { 'Content-Type': 'application/json' }
      : undefined,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  if (!response.ok) {
    throw new Error('Unable to update share link');
  }
  return response.json() as Promise<{ data: T; requestId: string }>;
}

export const listShares = (
  analysisId: string,
  fetchImplementation?: FetchImplementation,
) =>
  read<ShareLink[]>(
    `/api/analyses/${encodeURIComponent(analysisId)}/share`,
    fetchImplementation,
  );

export const createShare = (
  analysisId: string,
  input: { expiresInDays?: number; maxViews?: number | null } = {},
  fetchImplementation?: FetchImplementation,
) =>
  write<ShareLink>(
    `/api/analyses/${encodeURIComponent(analysisId)}/share`,
    {
      method: 'POST',
      body: {
        expiresInDays: input.expiresInDays ?? 7,
        maxViews: input.maxViews ?? null,
      },
    },
    fetchImplementation,
  );

export const revokeShare = (
  analysisId: string,
  shareId: string,
  fetchImplementation?: FetchImplementation,
) =>
  write<ShareLink>(
    `/api/analyses/${encodeURIComponent(analysisId)}/share/${encodeURIComponent(shareId)}`,
    { method: 'DELETE' },
    fetchImplementation,
  );

export const getSharedReport = (
  token: string,
  fetchImplementation?: FetchImplementation,
) =>
  read<SharedReport>(
    `/api/shared/${encodeURIComponent(token)}`,
    fetchImplementation,
  );
