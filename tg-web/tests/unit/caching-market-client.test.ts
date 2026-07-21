import { describe, expect, it, vi } from 'vitest';

import { CachingMarketAssetClient } from '../../src/backend/market-assets/caching-market-client';
import type { MarketAssetClient } from '../../src/backend/market-assets/tradingview-market-client';

function fakeCache() {
  const store = new Map<string, string>();
  return {
    store,
    get: vi.fn(async (key: string) => store.get(key) ?? null),
    set: vi.fn(async (key: string, value: string) => {
      store.set(key, value);
    }),
    delete: vi.fn(async (key: string) => {
      store.delete(key);
    }),
    healthcheck: vi.fn(),
  };
}

function fakeInner(
  overrides: Partial<MarketAssetClient> = {},
): MarketAssetClient {
  return {
    searchMarkets: vi.fn().mockResolvedValue([]),
    getIdentities: vi.fn().mockResolvedValue([]),
    getSnapshot: vi.fn(),
    listMarkets: vi.fn().mockResolvedValue([]),
    getStockLeaderboard: vi.fn(),
    getMarketTape: vi.fn(),
    createStreamToken: vi.fn(),
    ...overrides,
  };
}

describe('CachingMarketAssetClient', () => {
  it('serves identities from cache and only fetches missing tickers', async () => {
    const cache = fakeCache();
    await cache.set(
      'market-identity:v1:AAPL',
      JSON.stringify({
        ticker: 'AAPL',
        display_ticker: 'AAPL',
        display_name: 'Apple Inc.',
        logo_url: 'https://tv-logo.tradingviewapi.com/logo/apple.svg',
      }),
    );
    const inner = fakeInner({
      getIdentities: vi.fn().mockResolvedValue([
        {
          ticker: 'MSFT',
          display_ticker: 'MSFT',
          display_name: 'Microsoft Corporation',
          logo_url: 'https://tv-logo.tradingviewapi.com/logo/microsoft.svg',
        },
      ]),
    });
    const client = new CachingMarketAssetClient(inner, cache);

    const identities = await client.getIdentities(['AAPL', 'MSFT']);

    expect(inner.getIdentities).toHaveBeenCalledWith(['MSFT']);
    expect(identities).toEqual([
      {
        ticker: 'AAPL',
        display_ticker: 'AAPL',
        display_name: 'Apple Inc.',
        logo_url: 'https://tv-logo.tradingviewapi.com/logo/apple.svg',
      },
      {
        ticker: 'MSFT',
        display_ticker: 'MSFT',
        display_name: 'Microsoft Corporation',
        logo_url: 'https://tv-logo.tradingviewapi.com/logo/microsoft.svg',
      },
    ]);
    expect(cache.store.has('market-identity:v1:MSFT')).toBe(true);
  });

  it('writes identity cache when snapshot is loaded', async () => {
    const cache = fakeCache();
    const inner = fakeInner({
      getSnapshot: vi.fn().mockResolvedValue({
        ticker: 'AAPL',
        display_ticker: 'AAPL',
        display_name: 'Apple Inc.',
        logo_url: 'https://tv-logo.tradingviewapi.com/logo/apple.svg',
        last_price: 100,
        currency: 'USD',
        change_percent: 1,
        source: 'tradingview',
      }),
    });
    const client = new CachingMarketAssetClient(inner, cache);

    await client.getSnapshot('NASDAQ:AAPL');

    expect(cache.store.get('market-identity:v1:AAPL')).toContain('Apple Inc.');
  });

  it('seeds identity cache from search hits', async () => {
    const cache = fakeCache();
    const inner = fakeInner({
      searchMarkets: vi.fn().mockResolvedValue([
        {
          ticker: 'AAPL',
          exchange: 'NASDAQ',
          symbol: 'AAPL',
          display_ticker: 'AAPL',
          provider_symbol: 'NASDAQ:AAPL',
          display_name: 'Apple Inc.',
          logo_url: 'https://tv-logo.tradingviewapi.com/logo/apple.svg',
        },
      ]),
    });
    const client = new CachingMarketAssetClient(inner, cache);

    await client.searchMarkets('apple');

    expect(cache.store.get('market-identity:v1:AAPL')).toContain('apple.svg');
  });
});
