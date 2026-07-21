import { describe, expect, it } from 'vitest';

import {
  displayNameForTvMarket,
  groupTvMarketsByContinent,
  indexDisplayName,
  isStockLeaderboardTab,
  productMarketToTradingViewCode,
  TV_MARKETS_CATALOG,
} from '../../src/shared/market-codes';

describe('market-codes', () => {
  it('maps product markets to TradingView codes', () => {
    expect(productMarketToTradingViewCode('US')).toBe('america');
    expect(productMarketToTradingViewCode('HK')).toBe('hongkong');
    expect(productMarketToTradingViewCode('CN')).toBe('china');
    expect(productMarketToTradingViewCode('CRYPTO')).toBeNull();
  });

  it('validates stock leaderboard tabs', () => {
    expect(isStockLeaderboardTab('active')).toBe(true);
    expect(isStockLeaderboardTab('gainers')).toBe(true);
    expect(isStockLeaderboardTab('nope')).toBe(false);
  });

  it('resolves display names for known market codes', () => {
    expect(displayNameForTvMarket('america', 'en')).toBe('United States');
    expect(displayNameForTvMarket('hongkong', 'zh')).toBe('香港');
    expect(displayNameForTvMarket('newzealand', 'en')).toBe('New Zealand');
    expect(displayNameForTvMarket('unknown_land', 'en')).toBe('Unknown Land');
  });

  it('groups persisted markets by continent', () => {
    expect(TV_MARKETS_CATALOG.length).toBeGreaterThan(60);
    const groups = groupTvMarketsByContinent('zh');
    expect(groups.map((group) => group.continent)).toEqual([
      'north_america',
      'europe',
      'asia_oceania',
      'middle_east_africa',
      'south_america',
    ]);
    expect(
      groups
        .find((group) => group.continent === 'asia_oceania')
        ?.markets.some((market) => market.code === 'china'),
    ).toBe(true);
  });

  it('resolves curated index display names', () => {
    expect(indexDisplayName('SSE:000001', 'zh')).toBe('上证指数');
    expect(indexDisplayName('SP:SPX', 'en')).toBe('S&P 500');
    expect(indexDisplayName('UNKNOWN:FOO', 'en')).toBeUndefined();
  });
});
