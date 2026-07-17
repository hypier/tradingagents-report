import {
  formatDisplayTicker,
  isSupportedExchange,
  listingFromProviderSymbol,
  resolveListingTicker,
  type MarketSearchHit,
  type ResolvedListing,
} from '../../shared/listing';

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
  searchMarkets(query: string): Promise<MarketSearchHit[]>;
  getIdentities(tickers: string[]): Promise<MarketAssetIdentity[]>;
  getSnapshot(providerSymbol: string): Promise<MarketSnapshot>;
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
  source_id?: unknown;
  exchange?: unknown;
  logo?: { logoid?: unknown };
};

export class TradingViewMarketClient implements MarketAssetClient {
  constructor(
    private readonly apiKey?: string,
    private readonly fetchImplementation: FetchImplementation = fetch,
  ) {}

  async searchMarkets(query: string): Promise<MarketSearchHit[]> {
    const normalizedQuery = query.trim();
    if (!this.apiKey || !normalizedQuery) return [];

    const response = await this.request(
      `/api/search/market/${encodeURIComponent(normalizedQuery)}?filter=stock`,
    );
    if (!response.ok) return [];

    const hits: MarketSearchHit[] = [];
    for (const market of readMarkets(await response.json())) {
      const hit = toSearchHit(market);
      if (hit) hits.push(hit);
    }

    return hits
      .sort(
        (left, right) =>
          Number(Boolean(right.is_primary_listing)) -
          Number(Boolean(left.is_primary_listing)),
      )
      .slice(0, 12);
  }

  async getIdentities(tickers: string[]): Promise<MarketAssetIdentity[]> {
    return Promise.all(tickers.map((ticker) => this.getIdentity(ticker)));
  }

  async getSnapshot(providerSymbol: string): Promise<MarketSnapshot> {
    const normalized = providerSymbol.trim().toUpperCase();
    if (!this.apiKey || !normalized) {
      throw new Error('TradingView market data is not configured');
    }

    let listing: ResolvedListing;
    try {
      listing = normalized.includes(':')
        ? listingFromProviderSymbol(normalized)
        : resolveListingTicker(normalized);
    } catch {
      throw new Error('TradingView could not resolve this ticker');
    }

    const market = await this.findMarket(listing);
    const symbol =
      stringValue(market?.full_name) || listing.provider_symbol || '';
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
    return {
      ticker: listing.display_ticker,
      display_ticker: listing.display_ticker,
      display_name: description || listing.display_ticker,
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
    let listing: ResolvedListing;
    try {
      listing = resolveListingTicker(normalizedTicker);
    } catch {
      return {
        ticker: normalizedTicker,
        display_ticker: formatDisplayTicker(normalizedTicker),
        display_name: formatDisplayTicker(normalizedTicker),
      };
    }

    const fallback = {
      ticker: normalizedTicker,
      display_ticker: listing.display_ticker,
      display_name: listing.display_ticker,
    };
    if (!this.apiKey || !normalizedTicker) return fallback;

    const market = await this.findMarket(listing);
    if (!market) return fallback;

    const description = stringValue(market.description);
    const logoid = stringValue(market.logo?.logoid);
    return {
      ticker: normalizedTicker,
      display_ticker: listing.display_ticker,
      display_name: description || listing.display_ticker,
      ...(logoid
        ? { logo_url: `${LOGO_BASE_URL}/${encodeLogoPath(logoid)}.svg` }
        : {}),
    };
  }

  private async findMarket(
    listing: ResolvedListing,
  ): Promise<MarketRecord | undefined> {
    const query = listing.symbol;
    if (!query) return undefined;

    try {
      const response = await this.request(
        `/api/search/market/${encodeURIComponent(query)}?filter=stock`,
      );
      if (!response.ok) return undefined;
      const selected = selectMarket(await response.json(), listing);
      if (selected) return selected;

      if (listing.provider_symbol && listing.provider_symbol !== query) {
        const tvResponse = await this.request(
          `/api/search/market/${encodeURIComponent(listing.provider_symbol)}?filter=stock`,
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

function toSearchHit(market: MarketRecord): MarketSearchHit | undefined {
  const fullName = stringValue(market.full_name);
  if (!fullName.includes(':')) return undefined;

  try {
    const listing = listingFromProviderSymbol(fullName);
    if (!listing.exchange || !isSupportedExchange(listing.exchange)) {
      return undefined;
    }
    const logoid = stringValue(market.logo?.logoid);
    return {
      ...listing,
      display_name: stringValue(market.description) || listing.display_ticker,
      ...(logoid
        ? { logo_url: `${LOGO_BASE_URL}/${encodeLogoPath(logoid)}.svg` }
        : {}),
      is_primary_listing: Boolean(market.is_primary_listing),
    };
  } catch {
    return undefined;
  }
}

function selectMarket(
  payload: unknown,
  listing: ResolvedListing,
): MarketRecord | undefined {
  const markets = readMarkets(payload);
  const symbols = tickerSymbols(listing.symbol);
  const matches = markets.filter((market) => {
    const marketSymbol = stringValue(market.symbol).toUpperCase();
    const fullName = stringValue(market.full_name).toUpperCase();
    const symbolMatch =
      symbols.has(marketSymbol) ||
      (listing.provider_symbol !== null &&
        fullName === listing.provider_symbol);
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
