import type { StockLeaderboardTab } from './market-codes';

export type MarketTapeQuote = {
  symbol: string;
  name: string;
  exchange?: string;
  logo_url?: string;
  price: number;
  change_percent: number;
  currency: string;
  /** When true, UI may deep-link to /stocks/:symbol for quote viewing */
  linkable: boolean;
};

export type MarketTapePayload = {
  marketCode: string;
  pinned: MarketTapeQuote[];
  tape: MarketTapeQuote[];
};

export type MarketBoardItem = {
  rank: number;
  symbol: string;
  name: string;
  description: string;
  exchange: string;
  logo_url?: string;
  price: number;
  change_percent: number;
  currency: string;
  volume?: number;
  relative_volume?: number;
  market_cap?: number;
  pe_ratio?: number;
  eps_diluted?: number;
  eps_diluted_growth?: number;
  dividend_yield?: number;
  sector?: string;
  analyst_rating?: string;
  /** When true, UI may deep-link to /stocks/:symbol for quote viewing */
  linkable: boolean;
};

export type MarketBoardPayload = {
  marketCode: string;
  tab: StockLeaderboardTab;
  totalCount: number;
  marketName?: string;
  tabTitle?: string;
  items: MarketBoardItem[];
};

export type MarketMarketsPayload = {
  markets: Array<{
    code: string;
    displayName: string;
  }>;
};
