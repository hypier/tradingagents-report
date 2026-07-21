import type {
  MarketBoardPayload,
  MarketMarketsPayload,
  MarketTapePayload,
} from '@/shared/market-board';
import type { StockLeaderboardTab } from '@/shared/market-codes';

type FetchImplementation = typeof fetch;

async function read<T>(
  path: string,
  fetchImplementation: FetchImplementation = fetch,
) {
  const response = await fetchImplementation(path);
  if (!response.ok) throw new Error('Unable to load market data');
  return response.json() as Promise<{ data: T; requestId: string }>;
}

export const listMarketCodes = (
  lang: 'en' | 'zh' = 'en',
  fetchImplementation?: FetchImplementation,
) =>
  read<MarketMarketsPayload>(
    `/api/market-markets?lang=${encodeURIComponent(lang)}`,
    fetchImplementation,
  );

export const getMarketBoard = (
  input: {
    marketCode: string;
    tab?: StockLeaderboardTab;
    count?: number;
    start?: number;
    lang?: 'en' | 'zh';
  },
  fetchImplementation?: FetchImplementation,
) => {
  const params = new URLSearchParams({
    market_code: input.marketCode,
    tab: input.tab ?? 'active',
    count: String(input.count ?? 20),
    start: String(input.start ?? 0),
    lang: input.lang ?? 'en',
  });
  return read<MarketBoardPayload>(
    `/api/market-board?${params.toString()}`,
    fetchImplementation,
  );
};

export const getMarketTape = (
  marketCode: string,
  lang: 'en' | 'zh' = 'en',
  fetchImplementation?: FetchImplementation,
) =>
  read<MarketTapePayload>(
    `/api/market-tape?market_code=${encodeURIComponent(marketCode)}&lang=${encodeURIComponent(lang)}`,
    fetchImplementation,
  );

export type { MarketBoardPayload, MarketTapePayload, MarketMarketsPayload };
