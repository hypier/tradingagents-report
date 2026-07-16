const API_HOST = 'tradingview-data1.p.rapidapi.com';
const API_BASE_URL = `https://${API_HOST}`;
const LOGO_BASE_URL = 'https://tv-logo.tradingviewapi.com/logo';

export type MarketAssetIdentity = {
  ticker: string;
  display_name: string;
  logo_url?: string;
};

export type MarketSnapshot = MarketAssetIdentity & {
  last_price: number;
  currency: string;
  change_percent: number;
  as_of?: string;
  source: 'tradingview';
};

export interface MarketAssetClient {
  getIdentities(tickers: string[]): Promise<MarketAssetIdentity[]>;
  getSnapshot(ticker: string): Promise<MarketSnapshot>;
}

type FetchImplementation = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

type MarketRecord = {
  symbol?: unknown;
  full_name?: unknown;
  description?: unknown;
  is_primary_listing?: unknown;
  logo?: { logoid?: unknown };
};

export class TradingViewMarketClient implements MarketAssetClient {
  constructor(
    private readonly apiKey?: string,
    private readonly fetchImplementation: FetchImplementation = fetch,
  ) {}

  async getIdentities(tickers: string[]): Promise<MarketAssetIdentity[]> {
    return Promise.all(tickers.map((ticker) => this.getIdentity(ticker)));
  }

  async getSnapshot(ticker: string): Promise<MarketSnapshot> {
    const normalizedTicker = ticker.trim().toUpperCase();
    if (!this.apiKey || !normalizedTicker) {
      throw new Error('TradingView market data is not configured');
    }

    const market = await this.findMarket(normalizedTicker);
    const symbol = stringValue(market?.full_name);
    if (!market || !symbol) {
      throw new Error('TradingView could not resolve this ticker');
    }

    const response = await this.request(
      `/api/quote/${symbol}?session=regular&fields=all`,
    );
    if (!response.ok) throw new Error('TradingView quote request failed');
    const quote = readQuote(await response.json());
    const lastPrice = numberValue(quote?.lp);
    const changePercent = numberValue(quote?.chp);
    if (lastPrice === undefined || changePercent === undefined) {
      throw new Error('TradingView quote is missing price data');
    }

    const description = stringValue(market.description);
    const logoid = stringValue(market.logo?.logoid);
    const quoteTime = numberValue(quote?.lp_time);
    return {
      ticker: normalizedTicker,
      display_name: description || normalizedTicker,
      ...(logoid
        ? { logo_url: `${LOGO_BASE_URL}/${encodeLogoPath(logoid)}.svg` }
        : {}),
      last_price: lastPrice,
      currency: stringValue(quote?.currency_code).toUpperCase() || 'USD',
      change_percent: changePercent,
      ...(quoteTime
        ? { as_of: new Date(quoteTime * 1_000).toISOString() }
        : {}),
      source: 'tradingview',
    };
  }

  private async getIdentity(ticker: string): Promise<MarketAssetIdentity> {
    const normalizedTicker = ticker.trim().toUpperCase();
    const fallback = {
      ticker: normalizedTicker,
      display_name: normalizedTicker,
    };
    if (!this.apiKey || !normalizedTicker) return fallback;

    const market = await this.findMarket(normalizedTicker);
    if (!market) return fallback;

    const description = stringValue(market.description);
    const logoid = stringValue(market.logo?.logoid);
    return {
      ticker: normalizedTicker,
      display_name: description || normalizedTicker,
      ...(logoid
        ? { logo_url: `${LOGO_BASE_URL}/${encodeLogoPath(logoid)}.svg` }
        : {}),
    };
  }

  private async findMarket(ticker: string): Promise<MarketRecord | undefined> {
    try {
      const response = await this.request(
        `/api/search/market/${encodeURIComponent(ticker)}?filter=stock`,
      );
      return response.ok
        ? selectMarket(await response.json(), ticker)
        : undefined;
    } catch {
      return undefined;
    }
  }

  private request(path: string) {
    if (!this.apiKey)
      throw new Error('TradingView market data is not configured');
    return this.fetchImplementation(`${API_BASE_URL}${path}`, {
      headers: {
        'x-rapidapi-host': API_HOST,
        'x-rapidapi-key': this.apiKey,
      },
      signal: AbortSignal.timeout(5_000),
    });
  }
}

function selectMarket(
  payload: unknown,
  ticker: string,
): MarketRecord | undefined {
  const markets = readMarkets(payload);
  const symbols = tickerSymbols(ticker);
  const matches = markets.filter((market) =>
    symbols.has(stringValue(market.symbol).toUpperCase()),
  );
  return matches.sort(
    (left, right) =>
      Number(Boolean(right.is_primary_listing)) -
      Number(Boolean(left.is_primary_listing)),
  )[0];
}

function readMarkets(payload: unknown): MarketRecord[] {
  if (!isRecord(payload) || !isRecord(payload.data)) return [];
  const markets = payload.data.markets;
  return Array.isArray(markets)
    ? markets.filter(isRecord).map((market) => market as MarketRecord)
    : [];
}

function readQuote(payload: unknown): Record<string, unknown> | undefined {
  if (
    !isRecord(payload) ||
    !isRecord(payload.data) ||
    !isRecord(payload.data.data)
  ) {
    return undefined;
  }
  return payload.data.data;
}

function tickerSymbols(ticker: string): Set<string> {
  const rawSymbol = ticker.includes(':') ? ticker.split(':', 2)[1] : ticker;
  const symbol = rawSymbol.replace(/\.(HK|SS|SZ|T|TW|TWO)$/u, '');
  const symbols = new Set([symbol]);
  if (/^\d+$/u.test(symbol)) symbols.add(String(Number(symbol)));
  return symbols;
}

function encodeLogoPath(logoid: string) {
  return logoid.split('/').map(encodeURIComponent).join('/');
}

function stringValue(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function numberValue(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value)
    ? value
    : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
