import { describe, expect, it } from 'vitest';

import {
  DEFAULT_ANALYSIS_EXCHANGE_SEEDS,
  exchangesForMarket,
  getExchangeCatalogEntry,
  isEquityCatalogGroup,
  listCatalogGroups,
  listCatalogMarketCodes,
  listExchangeCatalog,
  suggestMarket,
  timezoneForMarket,
} from '../../src/shared/exchange-catalog';

describe('exchange catalog', () => {
  it('loads the TradingView exchanges catalog', () => {
    const rows = listExchangeCatalog();
    expect(rows.length).toBeGreaterThan(100);
    expect(getExchangeCatalogEntry('NASDAQ')?.country).toBe('us');
    expect(getExchangeCatalogEntry('HKEX')?.country).toBe('hk');
  });

  it('derives market codes from catalog country (or CRYPTO)', () => {
    expect(suggestMarket('us')).toBe('US');
    expect(suggestMarket('hk')).toBe('HK');
    expect(suggestMarket('cn')).toBe('CN');
    expect(suggestMarket('jp')).toBe('JP');
    expect(suggestMarket('', { group: 'Cryptocurrency' })).toBe('CRYPTO');
    expect(suggestMarket(null, { group: 'North America' })).toBeNull();
  });

  it('lists unique market codes from the exchange catalog', () => {
    const markets = listCatalogMarketCodes();
    expect(markets).toContain('US');
    expect(markets).toContain('JP');
    expect(markets).toContain('CRYPTO');
    expect(markets.length).toBeGreaterThan(20);
  });

  it('dedupes catalog values and orders groups', () => {
    const rows = listExchangeCatalog();
    const values = rows.map((row) => row.value.toUpperCase());
    expect(new Set(values).size).toBe(values.length);
    expect(listCatalogGroups()[0]).toBe('North America');
    expect(isEquityCatalogGroup('North America')).toBe(true);
    expect(isEquityCatalogGroup('Cryptocurrency')).toBe(false);
  });

  it('lists exchanges for a catalog market', () => {
    expect(exchangesForMarket('US')).toEqual(
      expect.arrayContaining(['NASDAQ', 'NYSE']),
    );
    expect(exchangesForMarket('JP')).toEqual(expect.arrayContaining(['TSE']));
  });

  it('seeds only catalog-backed analyzable exchanges', () => {
    for (const code of DEFAULT_ANALYSIS_EXCHANGE_SEEDS) {
      expect(getExchangeCatalogEntry(code)).toBeTruthy();
    }
    expect(timezoneForMarket('US')).toBe('America/New_York');
    expect(timezoneForMarket('JP')).toBe('Asia/Tokyo');
  });
});
