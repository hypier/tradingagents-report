export type ResearchInput = {
  ticker: string;
  tradeDate: string;
  analysts: string[];
};

export type AnalysisStatus =
  'queued' | 'running' | 'completed' | 'failed' | 'cancelled' | string;

export type AnalysisJob = {
  id: string;
  ticker: string;
  status: AnalysisStatus;
  current_step?: string | null;
  progress_percent?: number | null;
  decision?: string | null;
  cost_usd?: number | null;
  created_at?: string | null;
  updated_at?: string | null;
  analysts?: string[] | null;
};

export type AnalysisEvent = {
  id?: string;
  event_type?: string;
  message?: string;
  created_at?: string;
  stage?: string;
};

export type AnalysisDetail = AnalysisJob & {
  reports?: Record<string, unknown> | null;
  usage?: Record<string, unknown> | null;
  result?: Record<string, unknown> | null;
};

export type MarketSnapshot = {
  ticker: string;
  display_name?: string;
  last_price?: number;
  currency?: string;
  change_percent?: number;
  as_of?: string;
  source?: string;
};

type FetchImplementation = typeof fetch;

export async function createResearch(
  input: ResearchInput,
  fetchImplementation: FetchImplementation = fetch,
) {
  const response = await fetchImplementation('/api/analyses', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!response.ok) throw new Error('Unable to create research');
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

export const listResearch = (fetchImplementation?: FetchImplementation) =>
  read<AnalysisJob[]>('/api/analyses', fetchImplementation);

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
  ticker: string,
  fetchImplementation?: FetchImplementation,
) =>
  read<MarketSnapshot>(
    `/api/market-snapshot?ticker=${encodeURIComponent(ticker)}`,
    fetchImplementation,
  );
