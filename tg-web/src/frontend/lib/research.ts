export type ResearchInstrumentInput = {
  exchange: string;
  symbol: string;
  display_ticker?: string;
};

export type ResearchDisplayInput = {
  display_name?: string;
  logo_url?: string;
  country?: string;
};

export type ResearchInput = {
  ticker: string;
  tradeDate: string;
  analysts: string[];
  outputLanguage?: string;
  instrument?: ResearchInstrumentInput;
  display?: ResearchDisplayInput;
};

export type AnalysisStatus = 'queued' | 'running' | 'succeeded' | 'failed';

export type InstrumentDisplay = {
  display_name?: string;
  logo_url?: string;
  country?: string;
  symbol?: string;
};

export type AnalysisJob = {
  id: string;
  ticker: string;
  exchange?: string | null;
  status: AnalysisStatus;
  current_step?: string | null;
  progress_percent?: number | null;
  decision?: string | null;
  cost_usd?: number | null;
  created_at?: string | null;
  updated_at?: string | null;
  analysts?: string[] | null;
  display?: InstrumentDisplay | null;
  output_language?: string | null;
};

export type AnalysisEvent = {
  kind?: 'stage' | 'tool_call';
  progress_percent?: number;
  message?: string;
  time?: string;
};

export type AnalysisDetail = AnalysisJob & {
  reports?: Record<string, unknown> | null;
  usage?: Record<string, unknown> | null;
  result?: Record<string, unknown> | null;
};

export type MarketSnapshot = {
  ticker: string;
  display_ticker?: string;
  display_name?: string;
  logo_url?: string;
  last_price?: number;
  currency?: string;
  change_percent?: number;
  as_of?: string;
  source?: string;
};

export type AssetIdentity = {
  ticker: string;
  display_ticker?: string;
  display_name: string;
  logo_url?: string;
};

export type MarketSearchHit = {
  ticker: string;
  exchange: string | null;
  symbol: string;
  display_ticker: string;
  provider_symbol: string | null;
  display_name: string;
  logo_url?: string;
  is_primary_listing?: boolean;
};

export type SelectedInstrument = {
  display_ticker: string;
  provider_symbol: string;
  display_name: string;
  logo_url?: string;
  exchange: string;
  symbol: string;
};

type FetchImplementation = typeof fetch;

export class ResearchRequestError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = 'ResearchRequestError';
  }
}

export async function createResearch(
  { outputLanguage, instrument, display, ...input }: ResearchInput,
  fetchImplementation: FetchImplementation = fetch,
) {
  const response = await fetchImplementation('/api/analyses', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...input,
      requestId: crypto.randomUUID(),
      ...(instrument ? { instrument } : {}),
      ...(display ? { display } : {}),
      configOverrides: { output_language: outputLanguage ?? 'English' },
    }),
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      error?: { code?: string };
    } | null;
    throw new ResearchRequestError(body?.error?.code ?? 'REQUEST_FAILED');
  }
  return response.json() as Promise<{
    data: { id: string };
    requestId: string;
  }>;
}

async function read<T>(
  path: string,
  fetchImplementation: FetchImplementation = fetch,
) {
  const response = await fetchImplementation(path);
  if (!response.ok) throw new Error('Unable to load research data');
  return response.json() as Promise<{ data: T; requestId: string }>;
}

export const listResearch = (
  params: { limit?: number; offset?: number; status?: AnalysisStatus } = {},
  fetchImplementation?: FetchImplementation,
) => {
  const search = new URLSearchParams();
  if (params.limit !== undefined) search.set('limit', String(params.limit));
  if (params.offset !== undefined) search.set('offset', String(params.offset));
  if (params.status !== undefined) search.set('status', params.status);

  return read<AnalysisJob[]>(
    `/api/analyses${search.size ? `?${search}` : ''}`,
    fetchImplementation,
  );
};

export const getResearch = (
  id: string,
  fetchImplementation?: FetchImplementation,
) =>
  read<AnalysisDetail>(
    `/api/analyses/${encodeURIComponent(id)}`,
    fetchImplementation,
  );

export const getResearchEvents = (
  id: string,
  fetchImplementation?: FetchImplementation,
) =>
  read<AnalysisEvent[]>(
    `/api/analyses/${encodeURIComponent(id)}/events`,
    fetchImplementation,
  );

export const getMarketSnapshot = (
  providerSymbol: string,
  fetchImplementation?: FetchImplementation,
) =>
  read<MarketSnapshot>(
    `/api/market-snapshot?symbol=${encodeURIComponent(providerSymbol)}`,
    fetchImplementation,
  );

export const searchMarkets = (
  query: string,
  fetchImplementation?: FetchImplementation,
) =>
  read<MarketSearchHit[]>(
    `/api/market-search?q=${encodeURIComponent(query)}`,
    fetchImplementation,
  );

export const getMarketIdentities = (tickers: string[]) =>
  read<AssetIdentity[]>(
    `/api/market-identities?${new URLSearchParams(
      tickers.map((ticker) => ['ticker', ticker]),
    ).toString()}`,
  );
