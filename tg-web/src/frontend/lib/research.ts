export type ResearchInput = {
  ticker: string;
  tradeDate: string;
  analysts: string[];
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
  return response.json() as Promise<{ data: { id: string }; requestId: string }>;
}

async function read<T>(path: string, fetchImplementation: FetchImplementation = fetch) {
  const response = await fetchImplementation(path);
  if (!response.ok) throw new Error('Unable to load research data');
  return response.json() as Promise<{ data: T; requestId: string }>;
}

export const listResearch = (fetchImplementation?: FetchImplementation) =>
  read<Array<Record<string, unknown>>>('/api/analyses', fetchImplementation);

export const getResearch = (id: string, fetchImplementation?: FetchImplementation) =>
  read<Record<string, unknown>>(`/api/analyses/${encodeURIComponent(id)}`, fetchImplementation);

export const getResearchEvents = (id: string, fetchImplementation?: FetchImplementation) =>
  read<Array<Record<string, unknown>>>(`/api/analyses/${encodeURIComponent(id)}/events`, fetchImplementation);

export const getMarketSnapshot = (ticker: string, fetchImplementation?: FetchImplementation) =>
  read<Record<string, unknown>>(`/api/market-snapshot?ticker=${encodeURIComponent(ticker)}`, fetchImplementation);
