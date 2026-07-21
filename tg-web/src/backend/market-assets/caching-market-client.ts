import type { Cache } from '../cache/contract';
import type {
  MarketBoardPayload,
  MarketTapePayload,
} from '../../shared/market-board';
import type { MarketSearchHit } from '../../shared/listing';
import type {
  MarketAssetClient,
  MarketAssetIdentity,
  MarketSnapshot,
  MarketStreamToken,
  StockLeaderboardQuery,
} from './tradingview-market-client';

const IDENTITY_TTL_SECONDS = 7 * 24 * 60 * 60;
const IDENTITY_KEY_PREFIX = 'market-identity:v1:';

function identityCacheKey(ticker: string) {
  return `${IDENTITY_KEY_PREFIX}${ticker.trim().toUpperCase()}`;
}

function parseIdentity(raw: string): MarketAssetIdentity | null {
  try {
    const parsed = JSON.parse(raw) as MarketAssetIdentity;
    if (
      typeof parsed?.ticker !== 'string' ||
      typeof parsed?.display_ticker !== 'string' ||
      typeof parsed?.display_name !== 'string'
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Wraps TradingView market client with Redis/KV identity caching.
 * Caches display_name + logo_url so list UIs avoid repeated RapidAPI searches.
 */
export class CachingMarketAssetClient implements MarketAssetClient {
  constructor(
    private readonly inner: MarketAssetClient,
    private readonly cache: Cache,
  ) {}

  searchMarkets(query: string): Promise<MarketSearchHit[]> {
    return this.inner.searchMarkets(query).then(async (hits) => {
      await Promise.all(
        hits.map((hit) =>
          this.writeIdentity({
            ticker: hit.display_ticker,
            display_ticker: hit.display_ticker,
            display_name: hit.display_name,
            ...(hit.logo_url ? { logo_url: hit.logo_url } : {}),
          }),
        ),
      );
      return hits;
    });
  }

  async getIdentities(tickers: string[]): Promise<MarketAssetIdentity[]> {
    const normalized = [
      ...new Set(
        tickers.map((ticker) => ticker.trim().toUpperCase()).filter(Boolean),
      ),
    ];
    if (!normalized.length) return [];

    const cachedByTicker = new Map<string, MarketAssetIdentity>();
    const missing: string[] = [];

    await Promise.all(
      normalized.map(async (ticker) => {
        const raw = await this.cache.get(identityCacheKey(ticker));
        if (!raw) {
          missing.push(ticker);
          return;
        }
        const identity = parseIdentity(raw);
        if (!identity) {
          missing.push(ticker);
          return;
        }
        cachedByTicker.set(ticker, identity);
      }),
    );

    if (missing.length) {
      const fetched = await this.inner.getIdentities(missing);
      await Promise.all(
        fetched.map(async (identity) => {
          await this.writeIdentity(identity);
          cachedByTicker.set(identity.ticker.trim().toUpperCase(), identity);
        }),
      );
    }

    return normalized.map(
      (ticker) =>
        cachedByTicker.get(ticker) ?? {
          ticker,
          display_ticker: ticker,
          display_name: ticker,
        },
    );
  }

  async getSnapshot(providerSymbol: string): Promise<MarketSnapshot> {
    const snapshot = await this.inner.getSnapshot(providerSymbol);
    await this.writeIdentity({
      ticker: snapshot.ticker,
      display_ticker: snapshot.display_ticker ?? snapshot.ticker,
      display_name: snapshot.display_name,
      ...(snapshot.logo_url ? { logo_url: snapshot.logo_url } : {}),
    });
    return snapshot;
  }

  listMarkets(locale?: 'en' | 'zh') {
    return this.inner.listMarkets(locale);
  }

  getStockLeaderboard(query: StockLeaderboardQuery): Promise<MarketBoardPayload> {
    return this.inner.getStockLeaderboard(query);
  }

  getMarketTape(
    marketCode: string,
    locale?: 'en' | 'zh',
  ): Promise<MarketTapePayload> {
    return this.inner.getMarketTape(marketCode, locale);
  }

  createStreamToken(): Promise<MarketStreamToken> {
    return this.inner.createStreamToken();
  }

  private async writeIdentity(identity: MarketAssetIdentity): Promise<void> {
    const ticker = identity.ticker.trim().toUpperCase();
    if (!ticker) return;
    const payload: MarketAssetIdentity = {
      ticker,
      display_ticker: identity.display_ticker,
      display_name: identity.display_name,
      ...(identity.logo_url ? { logo_url: identity.logo_url } : {}),
    };
    await this.cache.set(
      identityCacheKey(ticker),
      JSON.stringify(payload),
      IDENTITY_TTL_SECONDS,
    );
    // Also index by display_ticker when it differs (e.g. 0700.HK vs input).
    const display = identity.display_ticker.trim().toUpperCase();
    if (display && display !== ticker) {
      await this.cache.set(
        identityCacheKey(display),
        JSON.stringify({ ...payload, ticker: display }),
        IDENTITY_TTL_SECONDS,
      );
    }
  }
}
