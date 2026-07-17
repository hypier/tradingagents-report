import {
  formatDisplayTicker,
  parseListingTicker,
} from '../../shared/display-ticker';

const API_HOST = 'tradingview-data1.p.rapidapi.com';
const API_BASE_URL = `https://${API_HOST}`;
const LOGO_BASE_URL = 'https://tv-logo.tradingviewapi.com/logo';

export type MarketAssetIdentity = {
  ticker: string;
  display_ticker: string;
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
      `/api/quote/${encodeURIComponent(symbol)}?session=regular&fields=all`,
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
    const displayTicker = formatDisplayTicker(normalizedTicker, symbol);
    return {
      ticker: normalizedTicker,
      display_ticker: displayTicker,
      display_name: description || displayTicker,
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
    const displayTicker = formatDisplayTicker(normalizedTicker);
    const fallback = {
      ticker: normalizedTicker,
      display_ticker: displayTicker,
      display_name: displayTicker,
    };
    if (!this.apiKey || !normalizedTicker) return fallback;

    const market = await this.findMarket(normalizedTicker);
    if (!market) return fallback;

    const description = stringValue(market.description);
    const logoid = stringValue(market.logo?.logoid);
    const resolvedDisplay = formatDisplayTicker(
      normalizedTicker,
      stringValue(market.full_name),
    );
    return {
      ticker: normalizedTicker,
      display_ticker: resolvedDisplay,
      display_name: description || resolvedDisplay,
      ...(logoid
        ? { logo_url: `${LOGO_BASE_URL}/${encodeLogoPath(logoid)}.svg` }
        : {}),
    };
  }

  private async findMarket(ticker: string): Promise<MarketRecord | undefined> {
    const listing = parseListingTicker(ticker);
    if (!listing.searchQuery) return undefined;

    try {
      // Search with bare symbol (300750), not Yahoo suffix (300750.SZ).
      const response = await this.request(
        `/api/search/market/${encodeURIComponent(listing.searchQuery)}?filter=stock`,
      );
      if (!response.ok) return undefined;
      const selected = selectMarket(await response.json(), listing);
      if (selected) return selected;

      // Fallback: some providers resolve better with EXCHANGE:SYMBOL.
      if (
        listing.tradingViewSymbol &&
        listing.tradingViewSymbol !== listing.searchQuery
      ) {
        const tvResponse = await this.request(
          `/api/search/market/${encodeURIComponent(listing.tradingViewSymbol)}?filter=stock`,
        );
        if (!tvResponse.ok) return undefined;
        return selectMarket(await tvResponse.json(), listing);
      }
      return undefined;
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
  listing: ReturnType<typeof parseListingTicker>,
): MarketRecord | undefined {
  const markets = readMarkets(payload);
  const symbols = tickerSymbols(listing.symbol);
  const matches = markets.filter((market) => {
    const marketSymbol = stringValue(market.symbol).toUpperCase();
    const fullName = stringValue(market.full_name).toUpperCase();
    const symbolMatch =
      symbols.has(marketSymbol) ||
      (listing.tradingViewSymbol !== null &&
        fullName === listing.tradingViewSymbol);
    if (!symbolMatch) return false;
    if (!listing.exchange) return true;
    const marketExchange = fullName.includes(':')
      ? fullName.split(':', 2)[0]
      : '';
    return marketExchange === listing.exchange;
  });

  if (matches.length) {
    return matches.sort(
      (left, right) =>
        Number(Boolean(right.is_primary_listing)) -
        Number(Boolean(left.is_primary_listing)),
    )[0];
  }

  // If exchange filter emptied the set, fall back to symbol-only primary match.
  const symbolOnly = markets.filter((market) =>
    symbols.has(stringValue(market.symbol).toUpperCase()),
  );
  return symbolOnly.sort(
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

function tickerSymbols(symbol: string): Set<string> {
  const normalized = symbol.trim().toUpperCase();
  const symbols = new Set([normalized]);
  if (/^\d+$/u.test(normalized)) symbols.add(String(Number(normalized)));
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
