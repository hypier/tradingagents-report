/** 交易所代码到产品市场的粗粒度映射。 */
const EXCHANGE_TO_MARKET: Record<string, string> = {
  NASDAQ: 'US',
  NYSE: 'US',
  AMEX: 'US',
  HKEX: 'HK',
  SSE: 'CN',
  SZSE: 'CN',
};

/** 产品市场 → TradingView leaderboard `market_code`（仅默认选中，不限制列表）。 */
const PRODUCT_TO_TV_MARKET: Record<string, string> = {
  US: 'america',
  HK: 'hongkong',
  CN: 'china',
};

export {
  displayNameForTvMarket,
  getTvMarketEntry,
  groupTvMarketsByContinent,
  isKnownTvMarketCode,
  listTvMarkets,
  TV_MARKET_CONTINENTS,
  TV_MARKETS_CATALOG,
  type TvMarketContinent,
  type TvMarketEntry,
} from './tv-markets-catalog';

/**
 * 少量高频市场的 tape 符号：pinned 钉住指数，tape 为走马灯加料（含权重股）。
 * 其余市场由 active leaderboard 切片填充。
 */
export const MARKET_TAPE_SYMBOLS: Record<
  string,
  { pinned: string[]; tape: string[] }
> = {
  america: {
    pinned: ['SP:SPX', 'NASDAQ:IXIC', 'DJ:DJI', 'CBOE:VIX'],
    tape: [
      'SP:SPX',
      'NASDAQ:IXIC',
      'DJ:DJI',
      'CBOE:VIX',
      'NASDAQ:AAPL',
      'NASDAQ:MSFT',
      'NASDAQ:NVDA',
      'NASDAQ:TSLA',
      'NASDAQ:AMZN',
      'NASDAQ:META',
    ],
  },
  hongkong: {
    pinned: ['HSI:HSI', 'HSI:HSTECH', 'HSI:HSCEI'],
    tape: [
      'HSI:HSI',
      'HSI:HSTECH',
      'HSI:HSCEI',
      'HKEX:700',
      'HKEX:9988',
      'HKEX:3690',
      'HKEX:1810',
      'HKEX:941',
    ],
  },
  china: {
    pinned: ['SSE:000001', 'SZSE:399001', 'SSE:000300'],
    tape: [
      'SSE:000001',
      'SZSE:399001',
      'SSE:000300',
      'SSE:600519',
      'SZSE:300750',
      'SSE:601318',
      'SZSE:000858',
    ],
  },
  japan: {
    pinned: ['TSE:NI225'],
    tape: ['TSE:NI225', 'TSE:7203', 'TSE:6758', 'TSE:9984', 'TSE:6861'],
  },
  uk: {
    pinned: ['TVC:UKX'],
    tape: ['TVC:UKX', 'LSE:AZN', 'LSE:SHEL', 'LSE:HSBA', 'LSE:BP'],
  },
  germany: {
    pinned: ['TVC:DAX'],
    tape: ['TVC:DAX', 'XETR:SAP', 'XETR:SIE', 'XETR:ALV', 'XETR:BMW'],
  },
};

/** Curated index names for pinned / tape symbols (code alone is not enough). */
export const INDEX_DISPLAY_NAMES: Record<
  string,
  { en: string; zh: string }
> = {
  'SP:SPX': { en: 'S&P 500', zh: '标普500' },
  'NASDAQ:IXIC': { en: 'Nasdaq Composite', zh: '纳斯达克综指' },
  'DJ:DJI': { en: 'Dow Jones', zh: '道琼斯' },
  'CBOE:VIX': { en: 'VIX', zh: 'VIX 波动率' },
  'HSI:HSI': { en: 'Hang Seng', zh: '恒生指数' },
  'HSI:HSTECH': { en: 'Hang Seng Tech', zh: '恒生科技' },
  'HSI:HSCEI': { en: 'Hang Seng China Ent.', zh: '国企指数' },
  'SSE:000001': { en: 'SSE Composite', zh: '上证指数' },
  'SZSE:399001': { en: 'SZSE Component', zh: '深证成指' },
  'SSE:000300': { en: 'CSI 300', zh: '沪深300' },
  'TSE:NI225': { en: 'Nikkei 225', zh: '日经225' },
  'TVC:UKX': { en: 'FTSE 100', zh: '富时100' },
  'TVC:DAX': { en: 'DAX', zh: '德国DAX' },
};

export function indexDisplayName(
  symbol: string,
  locale: 'en' | 'zh' = 'en',
): string | undefined {
  const entry = INDEX_DISPLAY_NAMES[symbol.trim().toUpperCase()];
  if (!entry) return undefined;
  return entry[locale] || entry.en;
}

export const STOCK_LEADERBOARD_TABS = [
  'all_stocks',
  'gainers',
  'losers',
  'active',
  'unusual_volume',
  'most_volatile',
  'best_performing',
  'large_cap',
  'small_cap',
  'high_dividend',
  'overbought',
  'oversold',
  '52wk_high',
  '52wk_low',
] as const;

export type StockLeaderboardTab = (typeof STOCK_LEADERBOARD_TABS)[number];

export const DEFAULT_TV_MARKET_CODE = 'america';

export function marketFromExchange(
  exchange: string | null | undefined,
): string | null {
  if (!exchange) return null;
  const key = exchange.trim().toUpperCase();
  return EXCHANGE_TO_MARKET[key] ?? null;
}

export function productMarketToTradingViewCode(
  productMarket: string | null | undefined,
): string | null {
  if (!productMarket) return null;
  return PRODUCT_TO_TV_MARKET[productMarket.trim().toUpperCase()] ?? null;
}

export function isStockLeaderboardTab(
  value: string,
): value is StockLeaderboardTab {
  return (STOCK_LEADERBOARD_TABS as readonly string[]).includes(value);
}
