import type { AnalysisCreditEstimate } from '@/backend/billing/contract';

export type ResearchInstrumentInput = {
  exchange: string;
  symbol: string;
  display_ticker?: string;
};

export type ResearchDisplayInput = {
  display_name?: string;
  english_name?: string;
  logo_url?: string;
  country?: string;
};

export type ResearchInput = {
  ticker: string;
  tradeDate: string;
  analysts: string[];
  outputLanguage?: string;
  quickModelId?: string;
  deepModelId?: string;
  instrument?: ResearchInstrumentInput;
  display?: ResearchDisplayInput;
};

export type AnalysisStatus = 'queued' | 'running' | 'succeeded' | 'failed';

/** Display-only status keys (includes cancelled mapped from failed + cancel error). */
export type AnalysisDisplayStatus = AnalysisStatus | 'cancelled' | 'stopping';

export function isCancelledAnalysis(job?: {
  status?: AnalysisStatus | null;
  error?: string | null;
  current_step?: string | null;
} | null): boolean {
  if (!job || job.status !== 'failed') return false;
  const error = job.error?.trim() ?? '';
  const step = job.current_step?.trim() ?? '';
  return (
    error.startsWith('Cancelled') ||
    step === 'Cancelled' ||
    step.toLowerCase() === 'cancelled'
  );
}

export function displayAnalysisStatus(
  job?: {
    status?: AnalysisStatus | null;
    error?: string | null;
    current_step?: string | null;
  } | null,
  options?: { stopping?: boolean },
): AnalysisDisplayStatus | undefined {
  if (!job?.status) return undefined;
  if (options?.stopping && (job.status === 'queued' || job.status === 'running')) {
    return 'stopping';
  }
  if (isCancelledAnalysis(job)) return 'cancelled';
  return job.status;
}

export type InstrumentDisplay = {
  display_name?: string;
  english_name?: string;
  logo_url?: string;
  country?: string;
  symbol?: string;
};

export type DecisionStance =
  | 'bullish'
  | 'neutral'
  | 'bearish'
  | 'unavailable';

export type DecisionPriceRange = {
  low: number;
  high: number;
};

export type DecisionSectionSignal = {
  stance: DecisionStance;
  note: string;
};

export type DecisionSectionStances = {
  market: DecisionSectionSignal;
  sentiment: DecisionSectionSignal;
  news: DecisionSectionSignal;
  fundamentals: DecisionSectionSignal;
};

export type AnalysisDecision = {
  /** Compatibility field used by older Core responses. */
  action?: string;
  rating?: string;
  headline?: string | null;
  conviction?: 'low' | 'medium' | 'high' | null;
  as_of_price?: number | null;
  as_of_date?: string | null;
  currency?: string | null;
  time_horizon?: string | null;
  position_guidance?: string | null;
  entry_zone?: DecisionPriceRange | null;
  add_levels?: DecisionPriceRange[];
  stop_or_reduce?: number | null;
  target_price?: number | null;
  bull_case?: string | null;
  bear_case?: string | null;
  key_risk?: string | null;
  what_to_watch?: string[];
  invalidation?: string | null;
  section_stances?: DecisionSectionStances | null;
  conflict_note?: string | null;
  confidence?: number;
  risk_score?: number;
  reasoning?: string;
};

export type AnalysisJob = {
  id: string;
  ticker: string;
  exchange?: string | null;
  trade_date?: string | null;
  status: AnalysisStatus;
  current_step?: string | null;
  progress_percent?: number | null;
  decision?: string | AnalysisDecision | null;
  error?: string | null;
  cost_usd?: number | null;
  created_at?: string | null;
  updated_at?: string | null;
  started_at?: string | null;
  finished_at?: string | null;
  analysts?: string[] | null;
  display?: InstrumentDisplay | null;
  output_language?: string | null;
  quick_think_llm?: string | null;
  deep_think_llm?: string | null;
  credit_units?: number | null;
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
  credit_units?: number | null;
};

export type MarketSnapshot = {
  ticker: string;
  display_ticker?: string;
  display_name?: string;
  english_name?: string;
  logo_url?: string;
  last_price?: number;
  currency?: string;
  change?: number;
  change_percent?: number;
  open?: number;
  high?: number;
  low?: number;
  volume?: number;
  as_of?: string;
  update_mode?: string;
  delay_seconds?: number;
  current_session?: string;
  is_tradable?: boolean;
  source?: string;
  freshness?: 'as_of' | 'stale';
};

export type AssetIdentity = {
  ticker: string;
  display_ticker?: string;
  display_name: string;
  english_name?: string;
  logo_url?: string;
};

export type MarketSearchHit = {
  ticker: string;
  exchange: string | null;
  symbol: string;
  display_ticker: string;
  provider_symbol: string | null;
  display_name: string;
  english_name?: string;
  logo_url?: string;
  is_primary_listing?: boolean;
};

export type SelectedInstrument = {
  display_ticker: string;
  provider_symbol: string;
  display_name: string;
  english_name?: string;
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
  { outputLanguage, instrument, display, quickModelId, deepModelId, ...input }: ResearchInput,
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
      ...(quickModelId ? { quickModelId } : {}),
      ...(deepModelId ? { deepModelId } : {}),
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

export async function estimateResearch(
  { outputLanguage, instrument, display, quickModelId, deepModelId, ...input }: ResearchInput,
  fetchImplementation: FetchImplementation = fetch,
) {
  const response = await fetchImplementation('/api/analyses/estimate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...input,
      ...(instrument ? { instrument } : {}),
      ...(display ? { display } : {}),
      ...(quickModelId ? { quickModelId } : {}),
      ...(deepModelId ? { deepModelId } : {}),
      configOverrides: { output_language: outputLanguage ?? 'English' },
    }),
  });
  if (!response.ok) throw new Error('Unable to estimate research credits');
  return response.json() as Promise<{
    data: AnalysisCreditEstimate;
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
  params: {
    limit?: number;
    offset?: number;
    status?: AnalysisStatus;
    ticker?: string;
    exchange?: string;
    tradeDateFrom?: string;
    tradeDateTo?: string;
    watchlist?: boolean;
  } = {},
  fetchImplementation?: FetchImplementation,
) => {
  const search = new URLSearchParams();
  if (params.limit !== undefined) search.set('limit', String(params.limit));
  if (params.offset !== undefined) search.set('offset', String(params.offset));
  if (params.status !== undefined) search.set('status', params.status);
  if (params.ticker) search.set('ticker', params.ticker);
  if (params.exchange) search.set('exchange', params.exchange);
  if (params.tradeDateFrom) search.set('trade_date_from', params.tradeDateFrom);
  if (params.tradeDateTo) search.set('trade_date_to', params.tradeDateTo);
  if (params.watchlist !== undefined) {
    search.set('watchlist', String(params.watchlist));
  }

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

export async function cancelResearch(
  id: string,
  fetchImplementation: FetchImplementation = fetch,
) {
  const response = await fetchImplementation(
    `/api/analyses/${encodeURIComponent(id)}/cancel`,
    { method: 'POST' },
  );
  if (!response.ok) {
    throw new ResearchRequestError('REQUEST_FAILED');
  }
  return response.json() as Promise<{
    data: { id: string; status: string };
    requestId: string;
  }>;
}

export const getMarketSnapshot = (
  providerSymbol: string,
  options?: { refresh?: boolean; fetchImplementation?: FetchImplementation },
) => {
  const params = new URLSearchParams({
    symbol: providerSymbol,
  });
  if (options?.refresh) params.set('refresh', '1');
  return read<MarketSnapshot>(
    `/api/market-snapshot?${params.toString()}`,
    options?.fetchImplementation,
  );
};

export type MarketOhlcvBar = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

export type MarketOhlcv = {
  symbol: string;
  timeframe: string;
  bars: MarketOhlcvBar[];
  currency?: string;
  has_intraday?: boolean;
  timezone?: string;
  source?: string;
};

export const getMarketOhlcv = (
  providerSymbol: string,
  timeframe: string,
  options?: { range?: number; fetchImplementation?: FetchImplementation },
) => {
  const params = new URLSearchParams({
    symbol: providerSymbol,
    timeframe,
  });
  if (options?.range !== undefined) {
    params.set('range', String(options.range));
  }
  return read<MarketOhlcv>(
    `/api/market-ohlcv?${params.toString()}`,
    options?.fetchImplementation,
  );
};

export type MarketQuote = {
  symbol: string;
  name: string;
  exchange?: string;
  logo_url?: string;
  price: number;
  change_percent: number;
  currency: string;
  linkable: boolean;
};

/** Batch last price + session change for watchlist / multi-symbol rows. */
export const getMarketQuotes = (
  providerSymbols: string[],
  fetchImplementation?: FetchImplementation,
) => {
  const params = new URLSearchParams();
  for (const symbol of providerSymbols) {
    const normalized = symbol.trim();
    if (normalized) params.append('symbol', normalized);
  }
  return read<MarketQuote[]>(
    `/api/market-quotes?${params.toString()}`,
    fetchImplementation,
  );
};

export type MarketStreamToken = {
  token: string;
  sseUrl: string;
  expiresAt: number;
};

/** Short-lived JWT for TradingView SSE quote streams (RapidAPI key stays on BFF). */
export const createMarketStreamToken = (
  fetchImplementation?: FetchImplementation,
) => read<MarketStreamToken>('/api/market-stream-token', fetchImplementation);

export const searchMarkets = (
  query: string,
  lang: 'en' | 'zh' = 'en',
  fetchImplementation?: FetchImplementation,
) =>
  read<MarketSearchHit[]>(
    `/api/market-search?q=${encodeURIComponent(query)}&lang=${encodeURIComponent(lang)}`,
    fetchImplementation,
  );

export const getMarketIdentities = (tickers: string[]) =>
  read<AssetIdentity[]>(
    `/api/market-identities?${new URLSearchParams(
      tickers.map((ticker) => ['ticker', ticker]),
    ).toString()}`,
  );
