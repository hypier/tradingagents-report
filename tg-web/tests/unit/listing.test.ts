import { describe, expect, it } from 'vitest';

import {
  formatDisplayTicker,
  listingFromParts,
  listingFromProviderSymbol,
  resolveListingTicker,
  resolveMarketCurrency,
} from '../../src/shared/listing';

describe('listing helpers', () => {
  it('builds Yahoo-style display tickers from exchange parts', () => {
    expect(listingFromParts('HKEX', '700')).toEqual({
      ticker: '0700.HK',
      exchange: 'HKEX',
      symbol: '700',
      display_ticker: '0700.HK',
      provider_symbol: 'HKEX:700',
    });
    expect(listingFromParts('SZSE', '300750').display_ticker).toBe('300750.SZ');
    expect(listingFromParts('NASDAQ', 'AAPL').display_ticker).toBe('AAPL');
  });

  it('parses provider symbols and Yahoo tickers locally', () => {
    expect(listingFromProviderSymbol('HKEX:700').display_ticker).toBe('0700.HK');
    expect(resolveListingTicker('300750.SZ')).toMatchObject({
      exchange: 'SZSE',
      provider_symbol: 'SZSE:300750',
    });
    expect(resolveListingTicker('AAPL')).toMatchObject({
      exchange: null,
      display_ticker: 'AAPL',
      provider_symbol: null,
    });
  });

  it('falls back to POINT when quote currency is missing', () => {
    expect(resolveMarketCurrency(undefined)).toBe('POINT');
    expect(resolveMarketCurrency('')).toBe('POINT');
    expect(resolveMarketCurrency(null)).toBe('POINT');
    expect(resolveMarketCurrency('HKD')).toBe('HKD');
    expect(resolveMarketCurrency('usd')).toBe('USD');
  });

  it('formats display tickers for UI fallbacks', () => {
    expect(formatDisplayTicker('700', '0700.HK')).toBe('0700.HK');
    expect(formatDisplayTicker('300750.SZ', '300750.SZ')).toBe('300750.SZ');
    expect(formatDisplayTicker('AAPL')).toBe('AAPL');
    expect(formatDisplayTicker(' aapl ')).toBe('AAPL');
  });
});
