import type {
  MarketBoardItem,
  MarketBoardPayload,
  MarketTapePayload,
  MarketTapeQuote,
} from '../../shared/market-board';
import {
  indexDisplayName,
  isStockLeaderboardTab,
  listTvMarkets,
  MARKET_TAPE_SYMBOLS,
  type StockLeaderboardTab,
} from '../../shared/market-codes';
import {
  distinctEnglishName,
  formatDisplayTicker,
  isSupportedExchange,
  listingForQuoteView,
  listingFromProviderSymbol,
  resolveListingTicker,
  resolveMarketCurrency,
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
  /** Common English name when different from localized `display_name`. */
  english_name?: string;
  logo_url?: string;
};

export type MarketSnapshot = MarketAssetIdentity & {
  last_price: number;
  currency: string;
  change?: number;
  change_percent: number;
  open?: number;
  high?: number;
  low?: number;
  volume?: number;
  as_of?: string;
  update_mode?: string;
  /** Vendor feed delay in seconds from `update_mode` (0 = streaming). */
  delay_seconds?: number;
  /**
   * TradingView `current_session` (e.g. pre_market / regular / post_market /
   * out_of_session). Prefer this over home-rolled market-hours clocks.
   */
  current_session?: string;
  /** TradingView `is_tradable` flag when present. */
  is_tradable?: boolean;
  source: 'tradingview';
};

export type StockLeaderboardQuery = {
  marketCode: string;
  tab: StockLeaderboardTab;
  count?: number;
  start?: number;
  lang?: string;
};

/** Short-lived JWT for TradingView SSE / WebSocket quote streams. */
export type MarketStreamToken = {
  token: string;
  sseUrl: string;
  expiresAt: number;
};

/** Supported Japanese-candle resolutions for `/api/price`. */
export const OHLCV_TIMEFRAMES = [
  '1',
  '5',
  '15',
  '30',
  '60',
  '240',
  'D',
  'W',
  'M',
] as const;

export type OhlcvTimeframe = (typeof OHLCV_TIMEFRAMES)[number];

export type OhlcvBar = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

export type MarketOhlcv = {
  symbol: string;
  timeframe: OhlcvTimeframe;
  bars: OhlcvBar[];
  currency?: string;
  has_intraday?: boolean;
  timezone?: string;
  source: 'tradingview';
};

export function isOhlcvTimeframe(value: string): value is OhlcvTimeframe {
  return (OHLCV_TIMEFRAMES as readonly string[]).includes(value);
}

export interface MarketAssetClient {
  searchMarkets(
    query: string,
    lang?: 'en' | 'zh',
  ): Promise<MarketSearchHit[]>;
  getIdentities(tickers: string[]): Promise<MarketAssetIdentity[]>;
  getSnapshot(providerSymbol: string): Promise<MarketSnapshot>;
  getOhlcv(
    providerSymbol: string,
    timeframe: OhlcvTimeframe,
    range?: number,
  ): Promise<MarketOhlcv>;
  /** Batch quotes for EXCHANGE:SYMBOL lists (chunks of 10 upstream). */
  getQuotesBatch(
    symbols: string[],
    locale?: 'en' | 'zh',
  ): Promise<MarketTapeQuote[]>;
  listMarkets(locale?: 'en' | 'zh'): Promise<
    Array<{ code: string; displayName: string }>
  >;
  getStockLeaderboard(query: StockLeaderboardQuery): Promise<MarketBoardPayload>;
  getMarketTape(
    marketCode: string,
    locale?: 'en' | 'zh',
  ): Promise<MarketTapePayload>;
  createStreamToken(): Promise<MarketStreamToken>;
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

  async searchMarkets(
    query: string,
    lang: 'en' | 'zh' = 'en',
  ): Promise<MarketSearchHit[]> {
    const normalizedQuery = query.trim();
    if (!this.apiKey || !normalizedQuery) return [];

    const locale = lang === 'zh' ? 'zh' : 'en';
    const [primaryHits, englishHits] = await Promise.all([
      this.searchMarketsForLang(normalizedQuery, locale),
      locale === 'en'
        ? Promise.resolve([] as MarketSearchHit[])
        : this.searchMarketsForLang(normalizedQuery, 'en'),
    ]);

    if (!englishHits.length) return primaryHits;

    const englishBySymbol = new Map(
      englishHits
        .filter((hit) => hit.provider_symbol)
        .map((hit) => [hit.provider_symbol!, hit.display_name] as const),
    );

    return primaryHits.map((hit) => {
      const english_name = distinctEnglishName(
        hit.display_name,
        hit.provider_symbol
          ? englishBySymbol.get(hit.provider_symbol)
          : undefined,
      );
      return english_name ? { ...hit, english_name } : hit;
    });
  }

  private async searchMarketsForLang(
    query: string,
    lang: 'en' | 'zh',
  ): Promise<MarketSearchHit[]> {
    const params = new URLSearchParams({ filter: 'stock', lang });
    const response = await this.request(
      `/api/search/market/${encodeURIComponent(query)}?${params.toString()}`,
    );
    if (!response.ok) return [];

    const hits: MarketSearchHit[] = [];
    for (const market of readMarkets(await response.json())) {
      const hit = toSearchHit(market);
      if (hit) hits.push(hit);
    }

    return hits
      .sort((left, right) =>
        compareMarketCandidates(left, right, isChinaNumericSymbol(query)),
      )
      .slice(0, 12);
  }

  async getIdentities(tickers: string[]): Promise<MarketAssetIdentity[]> {
    return Promise.all(tickers.map((ticker) => this.getIdentity(ticker)));
  }

  async listMarkets(
    locale: 'en' | 'zh' = 'en',
  ): Promise<Array<{ code: string; displayName: string }>> {
    return listTvMarkets(locale).map(({ code, displayName }) => ({
      code,
      displayName,
    }));
  }

  async getStockLeaderboard(
    query: StockLeaderboardQuery,
  ): Promise<MarketBoardPayload> {
    const marketCode = query.marketCode.trim().toLowerCase();
    const tab = query.tab;
    if (!this.apiKey) {
      throw new Error('TradingView market data is not configured');
    }
    if (!marketCode || !isStockLeaderboardTab(tab)) {
      throw new Error('Invalid market leaderboard request');
    }

    const count = Math.min(Math.max(query.count ?? 20, 1), 150);
    const start = Math.max(query.start ?? 0, 0);
    const lang = query.lang === 'zh' ? 'zh' : 'en';
    const payload = await this.fetchStockLeaderboard({
      marketCode,
      tab,
      count,
      start,
      lang,
    });
    // RapidAPI intermittently returns a poisoned slice for some count/start
    // combos (e.g. america/active count=50 → totalCount=2 with micro-caps).
    // Retry once with an adjacent page size to bypass the bad edge cache.
    if (!isPoisonedLeaderboard(payload, count)) return payload;
    const retryCount = count === 50 ? 49 : Math.min(count + 1, 150);
    if (retryCount === count) return payload;
    const retry = await this.fetchStockLeaderboard({
      marketCode,
      tab,
      count: retryCount,
      start,
      lang,
    });
    if (isPoisonedLeaderboard(retry, retryCount)) return payload;
    return {
      ...retry,
      // Keep the caller's requested page size when the alternate count is larger.
      items: retry.items.slice(0, count),
    };
  }

  private async fetchStockLeaderboard(input: {
    marketCode: string;
    tab: StockLeaderboardTab;
    count: number;
    start: number;
    lang: 'en' | 'zh';
  }): Promise<MarketBoardPayload> {
    const params = new URLSearchParams({
      tab: input.tab,
      market_code: input.marketCode,
      columnset: 'overview',
      start: String(input.start),
      count: String(input.count),
      lang: input.lang,
    });
    const response = await this.request(
      `/api/leaderboard/stocks?${params.toString()}`,
    );
    if (!response.ok) {
      throw new Error('TradingView leaderboard request failed');
    }
    return parseLeaderboardPayload(
      await response.json(),
      input.marketCode,
      input.tab,
      input.lang,
    );
  }

  async getMarketTape(
    marketCode: string,
    locale: 'en' | 'zh' = 'en',
  ): Promise<MarketTapePayload> {
    const normalized = marketCode.trim().toLowerCase();
    if (!this.apiKey) {
      throw new Error('TradingView market data is not configured');
    }
    if (!normalized) {
      throw new Error('market_code is required');
    }

    const curated = MARKET_TAPE_SYMBOLS[normalized];
    if (curated) {
      const symbols = uniqueSymbols([...curated.pinned, ...curated.tape]);
      const quotes = await this.getQuotesBatch(symbols, locale);
      const bySymbol = new Map(quotes.map((quote) => [quote.symbol, quote]));
      const withIndexName = (symbol: string) => {
        const quote = bySymbol.get(symbol);
        if (!quote) return undefined;
        const display = indexDisplayName(symbol, locale);
        return display ? { ...quote, name: display } : quote;
      };
      return {
        marketCode: normalized,
        pinned: curated.pinned
          .map(withIndexName)
          .filter((quote): quote is MarketTapeQuote => Boolean(quote)),
        tape: curated.tape
          .map(withIndexName)
          .filter((quote): quote is MarketTapeQuote => Boolean(quote)),
      };
    }

    const board = await this.getStockLeaderboard({
      marketCode: normalized,
      tab: 'active',
      count: 12,
      lang: locale,
    });
    const tape = board.items.map((item) => boardItemToTapeQuote(item));
    return {
      marketCode: normalized,
      pinned: tape.slice(0, 4),
      tape,
    };
  }

  async getQuotesBatch(
    symbols: string[],
    locale: 'en' | 'zh' = 'en',
  ): Promise<MarketTapeQuote[]> {
    // RapidAPI batch accepts ≤10 symbols; chunk larger watchlists.
    const BATCH_SIZE = 10;
    const MAX_SYMBOLS = 50;
    const normalized = uniqueSymbols(symbols).slice(0, MAX_SYMBOLS);
    if (!this.apiKey || !normalized.length) return [];

    const chunks: string[][] = [];
    for (let index = 0; index < normalized.length; index += BATCH_SIZE) {
      chunks.push(normalized.slice(index, index + BATCH_SIZE));
    }

    const results = await Promise.all(
      chunks.map((chunk) => this.getQuotesBatchChunk(chunk, locale)),
    );
    return results.flat();
  }

  private async getQuotesBatchChunk(
    symbols: string[],
    locale: 'en' | 'zh',
  ): Promise<MarketTapeQuote[]> {
    if (!symbols.length) return [];

    try {
      const response = await this.request('/api/quote/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbols,
          session: 'regular',
          fields: 'all',
        }),
      });
      if (response.ok) {
        const parsed = readBatchQuotes(await response.json(), locale);
        if (parsed.length) return parsed;
      }
    } catch {
      // Fall through to sequential snapshots.
    }

    const quotes: MarketTapeQuote[] = [];
    for (const symbol of symbols) {
      try {
        const quote = await this.quoteProviderSymbol(symbol, locale);
        if (quote) quotes.push(quote);
      } catch {
        // Skip symbols that fail to resolve.
      }
    }
    return quotes;
  }

  /** Quote EXCHANGE:SYMBOL without requiring product listing support. */
  private async quoteProviderSymbol(
    providerSymbol: string,
    locale: 'en' | 'zh' = 'en',
  ): Promise<MarketTapeQuote | undefined> {
    const symbol = providerSymbol.trim().toUpperCase();
    if (!symbol.includes(':')) return undefined;
    const response = await this.request(
      `/api/quote/${encodeURIComponent(symbol)}?session=regular&fields=all`,
    );
    if (!response.ok) return undefined;
    const data = readQuote(await response.json());
    if (!data) return undefined;
    return quoteRecordToTape(symbol, data, locale);
  }

  async getOhlcv(
    providerSymbol: string,
    timeframe: OhlcvTimeframe,
    range = 120,
  ): Promise<MarketOhlcv> {
    if (!this.apiKey) {
      throw new Error('TradingView market data is not configured');
    }
    const symbol = providerSymbol.trim().toUpperCase();
    if (!symbol.includes(':')) {
      throw new Error('symbol must be EXCHANGE:TICKER');
    }
    if (!isOhlcvTimeframe(timeframe)) {
      throw new Error('Invalid OHLCV timeframe');
    }
    const clampedRange = Math.min(Math.max(Math.trunc(range), 1), 500);
    const params = new URLSearchParams({
      timeframe,
      range: String(clampedRange),
      type: 'Japanese',
    });
    const response = await this.request(
      `/api/price/${encodeURIComponent(symbol)}?${params.toString()}`,
    );
    if (!response.ok) throw new Error('TradingView price request failed');
    return parseOhlcvPayload(await response.json(), symbol, timeframe);
  }

  async getSnapshot(providerSymbol: string): Promise<MarketSnapshot> {
    const normalized = providerSymbol.trim().toUpperCase();
    if (!this.apiKey || !normalized) {
      throw new Error('TradingView market data is not configured');
    }

    let listing: ResolvedListing;
    try {
      // Quote pages accept any EXCHANGE:SYMBOL; analysis still uses
      // listingFromProviderSymbol / isSupportedExchange elsewhere.
      listing = normalized.includes(':')
        ? listingForQuoteView(normalized)
        : resolveListingTicker(normalized);
    } catch {
      throw new Error('TradingView could not resolve this ticker');
    }

    // Prefer a single quote call when the caller already passed EXCHANGE:SYMBOL.
    // Yahoo-suffixed tickers still need search — local suffix→exchange mapping
    // is not always the TradingView primary listing.
    const inputIsProviderSymbol = normalized.includes(':');
    let market: MarketRecord | undefined;
    let symbol =
      inputIsProviderSymbol && listing.provider_symbol?.includes(':')
        ? listing.provider_symbol
        : '';
    if (!symbol) {
      market = await this.findMarket(listing);
      symbol = stringValue(market?.full_name) || listing.provider_symbol || '';
    }
    if (!symbol) {
      throw new Error('TradingView could not resolve this ticker');
    }

    const response = await this.request(
      `/api/quote/${encodeURIComponent(symbol)}?session=regular&fields=all`,
    );
    if (!response.ok) throw new Error('TradingView quote request failed');
    const quote = readQuote(await response.json());
    const lastPrice = numberValue(quote?.lp);
    const change = numberValue(quote?.ch);
    const changePercent = numberValue(quote?.chp);
    if (lastPrice === undefined || changePercent === undefined) {
      throw new Error('TradingView quote is missing price data');
    }

    const quoteLogo =
      quote?.logo && isRecord(quote.logo) ? quote.logo : undefined;
    const shortName = stringValue(quote?.short_name);
    const localName = stringValue(quote?.local_description);
    const englishFromQuote = stringValue(quote?.description);
    const marketDescription = stringValue(market?.description);
    // short_name is often the ticker code (e.g. AAPL); prefer company description.
    const shortLooksLikeCode =
      !shortName ||
      shortName.toUpperCase() === listing.symbol.toUpperCase() ||
      shortName.toUpperCase() === listing.display_ticker.toUpperCase();
    // Prefer localized name when TradingView provides one; keep English separately.
    const display_name =
      localName ||
      marketDescription ||
      (shortLooksLikeCode
        ? englishFromQuote || shortName
        : shortName || englishFromQuote) ||
      listing.display_ticker;
    const english_name = distinctEnglishName(
      display_name,
      englishFromQuote ||
        (!shortLooksLikeCode && shortName !== display_name
          ? shortName
          : undefined) ||
        marketDescription,
    );
    const logoid =
      stringValue(market?.logo?.logoid) ||
      stringValue(quote?.logoid) ||
      stringValue(quoteLogo?.logoid);
    const quoteTime = numberValue(quote?.lp_time);
    const updateMode = stringValue(quote?.update_mode) || undefined;
    const delaySeconds = parseUpdateModeDelaySeconds(updateMode);
    const open = numberValue(quote?.open_price);
    const high = numberValue(quote?.high_price);
    const low = numberValue(quote?.low_price);
    const volume = numberValue(quote?.volume);
    const currentSession = stringValue(quote?.current_session) || undefined;
    const isTradable = booleanValue(quote?.is_tradable);
    return {
      ticker: listing.display_ticker,
      display_ticker: listing.display_ticker,
      display_name,
      ...(english_name ? { english_name } : {}),
      ...(logoid
        ? { logo_url: `${LOGO_BASE_URL}/${encodeLogoPath(logoid)}.svg` }
        : {}),
      last_price: lastPrice,
      currency: resolveMarketCurrency(stringValue(quote?.currency_code)),
      ...(change !== undefined ? { change } : {}),
      change_percent: changePercent,
      ...(open !== undefined ? { open } : {}),
      ...(high !== undefined ? { high } : {}),
      ...(low !== undefined ? { low } : {}),
      ...(volume !== undefined ? { volume } : {}),
      ...(quoteTime
        ? { as_of: new Date(quoteTime * 1_000).toISOString() }
        : {}),
      ...(updateMode ? { update_mode: updateMode } : {}),
      ...(delaySeconds !== null ? { delay_seconds: delaySeconds } : {}),
      ...(currentSession ? { current_session: currentSession } : {}),
      ...(isTradable !== undefined ? { is_tradable: isTradable } : {}),
      source: 'tradingview',
    };
  }

  async createStreamToken(): Promise<MarketStreamToken> {
    if (!this.apiKey) {
      throw new Error('TradingView market data is not configured');
    }

    const response = await this.request('/api/token/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // 1 = 30 minutes — short enough to rotate; client reconnects before expiry.
      body: JSON.stringify({ 'token-jwt-type': '1' }),
    });
    if (!response.ok) {
      throw new Error('TradingView stream token request failed');
    }

    const payload = await response.json();
    if (!isRecord(payload)) {
      throw new Error('TradingView stream token response is invalid');
    }
    const token = stringValue(payload.token);
    const sseUrl = stringValue(payload.sseUrl);
    const expiresAt = numberValue(payload.expiresAt);
    if (!token || !sseUrl || expiresAt === undefined) {
      throw new Error('TradingView stream token response is incomplete');
    }

    return { token, sseUrl, expiresAt };
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

  private request(path: string, init?: RequestInit) {
    if (!this.apiKey)
      throw new Error('TradingView market data is not configured');
    return this.fetchImplementation(`${API_BASE_URL}${path}`, {
      ...init,
      headers: {
        'x-rapidapi-host': API_HOST,
        'x-rapidapi-key': this.apiKey,
        ...(init?.headers ?? {}),
      },
      signal: init?.signal ?? AbortSignal.timeout(8_000),
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
  const preferChina = isChinaNumericSymbol(listing.symbol);
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
    return matches.sort((left, right) =>
      compareMarketRecords(left, right, preferChina),
    )[0];
  }

  const symbolOnly = markets.filter((market) =>
    symbols.has(stringValue(market.symbol).toUpperCase()),
  );
  return symbolOnly.sort((left, right) =>
    compareMarketRecords(left, right, preferChina),
  )[0];
}

/** Prefer mainland venues for bare 6-digit China codes (tg-core parity). */
const CHINA_EXCHANGE_RANK: Record<string, number> = {
  SZSE: 0,
  SHE: 0,
  SSE: 1,
  SHA: 1,
};

function isChinaNumericSymbol(symbol: string): boolean {
  return /^\d{6}$/.test(symbol.trim());
}

function chinaExchangeRank(exchange: string): number {
  return (
    CHINA_EXCHANGE_RANK[exchange.toUpperCase()] ??
    Object.keys(CHINA_EXCHANGE_RANK).length + 10
  );
}

function compareMarketCandidates(
  left: Pick<MarketSearchHit, 'exchange' | 'provider_symbol' | 'is_primary_listing'>,
  right: Pick<MarketSearchHit, 'exchange' | 'provider_symbol' | 'is_primary_listing'>,
  preferChina: boolean,
): number {
  const primary =
    Number(Boolean(right.is_primary_listing)) -
    Number(Boolean(left.is_primary_listing));
  if (primary !== 0 || !preferChina) return primary;
  const leftExchange =
    left.exchange ?? left.provider_symbol?.split(':', 2)[0] ?? '';
  const rightExchange =
    right.exchange ?? right.provider_symbol?.split(':', 2)[0] ?? '';
  return chinaExchangeRank(leftExchange) - chinaExchangeRank(rightExchange);
}

function compareMarketRecords(
  left: MarketRecord,
  right: MarketRecord,
  preferChina: boolean,
): number {
  const primary =
    Number(Boolean(right.is_primary_listing)) -
    Number(Boolean(left.is_primary_listing));
  if (primary !== 0 || !preferChina) return primary;
  const leftExchange = stringValue(left.full_name).includes(':')
    ? stringValue(left.full_name).split(':', 2)[0]!
    : '';
  const rightExchange = stringValue(right.full_name).includes(':')
    ? stringValue(right.full_name).split(':', 2)[0]!
    : '';
  return chinaExchangeRank(leftExchange) - chinaExchangeRank(rightExchange);
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

function parseOhlcvPayload(
  payload: unknown,
  symbol: string,
  timeframe: OhlcvTimeframe,
): MarketOhlcv {
  if (!isRecord(payload) || !isRecord(payload.data)) {
    throw new Error('TradingView price response was empty');
  }
  const root = payload.data;
  const info = isRecord(root.info) ? root.info : undefined;
  const barsByTime = new Map<number, OhlcvBar>();

  const pushBar = (raw: unknown) => {
    if (!isRecord(raw)) return;
    const time = numberValue(raw.time);
    const open = numberValue(raw.open);
    const close = numberValue(raw.close);
    const high = numberValue(raw.max) ?? numberValue(raw.high);
    const low = numberValue(raw.min) ?? numberValue(raw.low);
    const volume = numberValue(raw.volume) ?? 0;
    if (
      time === undefined ||
      open === undefined ||
      high === undefined ||
      low === undefined ||
      close === undefined
    ) {
      return;
    }
    barsByTime.set(time, { time, open, high, low, close, volume });
  };

  const history = Array.isArray(root.history) ? root.history : [];
  for (const row of history) pushBar(row);
  pushBar(root.current);

  const bars = [...barsByTime.values()].sort((left, right) => left.time - right.time);
  if (!bars.length) {
    throw new Error('TradingView price response had no candles');
  }

  return {
    symbol: stringValue(root.symbol) || symbol,
    timeframe,
    bars,
    currency: resolveMarketCurrency(stringValue(info?.currency_code)),
    ...(typeof info?.has_intraday === 'boolean'
      ? { has_intraday: info.has_intraday }
      : {}),
    ...(stringValue(info?.timezone)
      ? { timezone: stringValue(info?.timezone) }
      : {}),
    source: 'tradingview',
  };
}

/**
 * RapidAPI `/api/leaderboard/stocks` sometimes answers 200 with a tiny bogus
 * board (observed: america/active → totalCount=2, RBKB+MSS) while the real
 * market has thousands of rows. Treat that as poisoned so callers can retry.
 */
export function isPoisonedLeaderboard(
  payload: MarketBoardPayload,
  requestedCount: number,
): boolean {
  if (requestedCount < 20) return false;
  if (payload.totalCount >= 20) return false;
  if (payload.items.length >= 20) return false;
  // Empty markets stay empty; only flag non-empty but absurdly small boards.
  return payload.totalCount > 0 && payload.totalCount <= 5;
}

function parseLeaderboardPayload(
  payload: unknown,
  marketCode: string,
  tab: StockLeaderboardTab,
  locale: 'en' | 'zh' = 'en',
): MarketBoardPayload {
  if (!isRecord(payload) || !isRecord(payload.data)) {
    return { marketCode, tab, totalCount: 0, items: [] };
  }
  const root = payload.data;
  const totalCount =
    typeof root.totalCount === 'number' && Number.isFinite(root.totalCount)
      ? root.totalCount
      : 0;
  const metadata = isRecord(root.metadata) ? root.metadata : undefined;
  const marketMeta = metadata && isRecord(metadata.market) ? metadata.market : undefined;
  const tabMeta = metadata && isRecord(metadata.tab) ? metadata.tab : undefined;
  const rows = Array.isArray(root.data) ? root.data : [];
  const items: MarketBoardItem[] = [];
  for (const row of rows) {
    if (!isRecord(row)) continue;
    const item = toBoardItem(row, locale);
    if (item) items.push(item);
  }
  return {
    marketCode,
    tab,
    totalCount,
    ...(stringValue(marketMeta?.name)
      ? { marketName: stringValue(marketMeta?.name) }
      : {}),
    ...(stringValue(tabMeta?.title)
      ? { tabTitle: stringValue(tabMeta?.title) }
      : {}),
    items,
  };
}

function toBoardItem(
  row: Record<string, unknown>,
  locale: 'en' | 'zh' = 'en',
): MarketBoardItem | undefined {
  const symbol = stringValue(row.symbol).toUpperCase();
  if (!symbol.includes(':')) return undefined;
  const [exchangeRaw, nameRaw] = symbol.split(':', 2);
  const exchange = exchangeRaw?.trim() ?? '';
  const name =
    stringValue(row.name) || nameRaw?.trim() || symbol.split(':')[1] || symbol;
  const description =
    stringValue(row.description) || name;
  const price = numberValue(row.price) ?? numberValue(row.close);
  const changePercent = numberValue(row.change);
  if (price === undefined || changePercent === undefined) return undefined;

  const logo =
    (isRecord(row.logo) ? stringValue(row.logo.logoid) : '') ||
    stringValue(row.logoid);
  const rank =
    typeof row.rank === 'number' && Number.isFinite(row.rank) ? row.rank : 0;
  const volume = numberValue(row.volume);
  const relativeVolume =
    numberValue(row.relativevolume) ?? numberValue(row.relative_volume_10d_calc);
  const marketCap = numberValue(row.marketcap) ?? numberValue(row.market_cap_basic);
  const peRatio =
    numberValue(row.pricetoearnings) ?? numberValue(row.price_earnings_ttm);
  const epsDiluted =
    numberValue(row.epsdiluted) ?? numberValue(row.earnings_per_share_diluted_ttm);
  const epsDilutedGrowth =
    numberValue(row.epsdilutedgrowth) ??
    numberValue(row.earnings_per_share_diluted_yoy_growth_ttm);
  const dividendYield =
    numberValue(row.dividendsyield) ?? numberValue(row.dividend_yield_recent);
  const sector = stringValue(row.sector) || stringValue(row.sector_tr);
  const analyst =
    stringValue(row.analystrating) || stringValue(row.analystrating_tr);

  return {
    rank,
    symbol,
    name,
    description,
    exchange,
    ...(logo
      ? { logo_url: `${LOGO_BASE_URL}/${encodeLogoPath(logo)}.svg` }
      : {}),
    price,
    change_percent: changePercent,
    currency: resolveMarketCurrency(stringValue(row.currency)),
    ...(volume !== undefined ? { volume } : {}),
    ...(relativeVolume !== undefined ? { relative_volume: relativeVolume } : {}),
    ...(marketCap !== undefined ? { market_cap: marketCap } : {}),
    ...(peRatio !== undefined ? { pe_ratio: peRatio } : {}),
    ...(epsDiluted !== undefined ? { eps_diluted: epsDiluted } : {}),
    ...(epsDilutedGrowth !== undefined
      ? { eps_diluted_growth: epsDilutedGrowth }
      : {}),
    ...(dividendYield !== undefined ? { dividend_yield: dividendYield } : {}),
    ...(sector ? { sector } : {}),
    ...(analyst ? { analyst_rating: analyst } : {}),
    // Any EXCHANGE:SYMBOL can open the quote page; analysis is gated separately.
    linkable: Boolean(exchange),
  };
}

function readBatchQuotes(
  payload: unknown,
  locale: 'en' | 'zh' = 'en',
): MarketTapeQuote[] {
  if (!isRecord(payload) || !isRecord(payload.data)) return [];
  const rows = Array.isArray(payload.data.data) ? payload.data.data : [];
  const quotes: MarketTapeQuote[] = [];
  for (const row of rows) {
    if (!isRecord(row) || row.success === false) continue;
    const symbol = stringValue(row.symbol).toUpperCase();
    const data = isRecord(row.data) ? row.data : undefined;
    if (!symbol || !data) continue;
    const quote = quoteRecordToTape(symbol, data, locale);
    if (quote) quotes.push(quote);
  }
  return quotes;
}

function quoteRecordToTape(
  symbol: string,
  data: Record<string, unknown>,
  locale: 'en' | 'zh' = 'en',
): MarketTapeQuote | undefined {
  const price = numberValue(data.lp);
  const changePercent = numberValue(data.chp);
  if (price === undefined || changePercent === undefined) return undefined;
  const exchange = symbol.includes(':') ? symbol.split(':', 2)[0]! : '';
  const ticker = symbol.includes(':') ? symbol.split(':', 2)[1]! : symbol;
  const shortName = stringValue(data.short_name);
  const description =
    stringValue(data.local_description) || stringValue(data.description);
  // Prefer human title when short_name is just the ticker code (common for indices).
  const shortLooksLikeCode =
    !shortName || shortName.toUpperCase() === ticker.toUpperCase();
  const name = shortLooksLikeCode
    ? description || shortName || ticker
    : shortName || description || ticker;
  const logo =
    (isRecord(data.logo) ? stringValue(data.logo.logoid) : '') ||
    stringValue(data.logoid);
  return {
    symbol,
    name,
    ...(exchange ? { exchange } : {}),
    ...(logo
      ? { logo_url: `${LOGO_BASE_URL}/${encodeLogoPath(logo)}.svg` }
      : {}),
    price,
    change_percent: changePercent,
    currency: resolveMarketCurrency(stringValue(data.currency_code)),
    // Any EXCHANGE:SYMBOL can open the quote page; analysis is gated separately.
    linkable: Boolean(exchange),
  };
}

function boardItemToTapeQuote(item: MarketBoardItem): MarketTapeQuote {
  return {
    symbol: item.symbol,
    name: item.description || item.name,
    exchange: item.exchange,
    ...(item.logo_url ? { logo_url: item.logo_url } : {}),
    price: item.price,
    change_percent: item.change_percent,
    currency: item.currency,
    linkable: item.linkable,
  };
}

function uniqueSymbols(symbols: string[]) {
  return [
    ...new Set(
      symbols
        .map((symbol) => symbol.trim().toUpperCase())
        .filter(Boolean),
    ),
  ];
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

function booleanValue(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

/** Parse TradingView `update_mode`, e.g. `delayed_streaming_900` → 900. */
function parseUpdateModeDelaySeconds(updateMode?: string): number | null {
  if (!updateMode) return null;
  const normalized = updateMode.trim().toLowerCase();
  if (normalized === 'streaming') return 0;
  const match = /^delayed(?:_streaming)?_(\d+)$/u.exec(normalized);
  if (!match) return null;
  const seconds = Number(match[1]);
  return Number.isFinite(seconds) ? seconds : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
