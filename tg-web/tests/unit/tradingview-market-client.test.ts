import { describe, expect, it, vi } from 'vitest';

import { TradingViewMarketClient } from '../../src/backend/market-assets/tradingview-market-client';
import {
  parseListingTicker,
  toTradingViewSymbol,
} from '../../src/shared/display-ticker';

describe('parseListingTicker / toTradingViewSymbol', () => {
  it('maps Yahoo suffixes to TradingView EXCHANGE:SYMBOL', () => {
    expect(toTradingViewSymbol('300750.SZ')).toBe('SZSE:300750');
    expect(toTradingViewSymbol('600519.SS')).toBe('SSE:600519');
    expect(toTradingViewSymbol('0700.HK')).toBe('HKEX:700');
    expect(toTradingViewSymbol('700.HK')).toBe('HKEX:700');
    expect(toTradingViewSymbol('7203.T')).toBe('TSE:7203');
    expect(toTradingViewSymbol('AAPL')).toBeNull();
    expect(toTradingViewSymbol('SZSE:300750')).toBe('SZSE:300750');
  });

  it('builds search queries without Yahoo suffixes', () => {
    expect(parseListingTicker('300750.SZ').searchQuery).toBe('300750');
    expect(parseListingTicker('0700.HK').searchQuery).toBe('700');
  });
});

describe('TradingViewMarketClient', () => {
  it('builds a market snapshot from the resolved TradingView listing', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            success: true,
            data: {
              markets: [
                {
                  symbol: '700',
                  full_name: 'HKEX:700',
                  description: 'Tencent Holdings Ltd.',
                  is_primary_listing: true,
                  logo: { style: 'single', logoid: 'tencent' },
                },
              ],
            },
          }),
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            success: true,
            data: {
              symbol: 'HKEX:700',
              data: {
                lp: 481.8,
                chp: 1.65,
                currency_code: 'HKD',
                lp_time: 1784165400,
              },
            },
          }),
        ),
      );
    const client = new TradingViewMarketClient('server-secret', fetchMock);

    await expect(client.getSnapshot('700')).resolves.toEqual({
      ticker: '700',
      display_ticker: '0700.HK',
      display_name: 'Tencent Holdings Ltd.',
      logo_url: 'https://tv-logo.tradingviewapi.com/logo/tencent.svg',
      last_price: 481.8,
      currency: 'HKD',
      change_percent: 1.65,
      as_of: '2026-07-16T01:30:00.000Z',
      source: 'tradingview',
    });
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'https://tradingview-data1.p.rapidapi.com/api/search/market/700?filter=stock',
      expect.anything(),
    );
    expect(fetchMock).toHaveBeenLastCalledWith(
      'https://tradingview-data1.p.rapidapi.com/api/quote/HKEX%3A700?session=regular&fields=all',
      expect.anything(),
    );
  });

  it('resolves Yahoo-suffixed tickers via bare-symbol search and exchange filter', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            success: true,
            data: {
              markets: [
                {
                  symbol: '300750',
                  full_name: 'SZSE:300750',
                  description: 'Contemporary Amperex Technology Co Ltd',
                  is_primary_listing: true,
                  logo: { style: 'single', logoid: 'catl' },
                },
                {
                  symbol: '300750',
                  full_name: 'SSE:300750',
                  description: 'Wrong exchange decoy',
                  is_primary_listing: false,
                },
              ],
            },
          }),
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            success: true,
            data: {
              symbol: 'SZSE:300750',
              data: {
                lp: 180.2,
                chp: -1.2,
                currency_code: 'CNY',
                lp_time: 1784165400,
              },
            },
          }),
        ),
      );
    const client = new TradingViewMarketClient('server-secret', fetchMock);

    await expect(client.getSnapshot('300750.SZ')).resolves.toMatchObject({
      ticker: '300750.SZ',
      display_ticker: '300750.SZ',
      display_name: 'Contemporary Amperex Technology Co Ltd',
      last_price: 180.2,
      currency: 'CNY',
      source: 'tradingview',
    });
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'https://tradingview-data1.p.rapidapi.com/api/search/market/300750?filter=stock',
      expect.anything(),
    );
    expect(fetchMock).toHaveBeenLastCalledWith(
      'https://tradingview-data1.p.rapidapi.com/api/quote/SZSE%3A300750?session=regular&fields=all',
      expect.anything(),
    );
  });

  it('returns a direct public logo URL from a market search result', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          success: true,
          data: {
            markets: [
              {
                symbol: '700',
                full_name: 'HKEX:700',
                description: 'Tencent Holdings Ltd.',
                is_primary_listing: true,
                logo: { style: 'single', logoid: 'tencent' },
              },
            ],
          },
        }),
      ),
    );
    const client = new TradingViewMarketClient('server-secret', fetchMock);

    await expect(client.getIdentities(['700'])).resolves.toEqual([
      {
        ticker: '700',
        display_ticker: '0700.HK',
        display_name: 'Tencent Holdings Ltd.',
        logo_url: 'https://tv-logo.tradingviewapi.com/logo/tencent.svg',
      },
    ]);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://tradingview-data1.p.rapidapi.com/api/search/market/700?filter=stock',
      expect.objectContaining({
        headers: {
          'x-rapidapi-host': 'tradingview-data1.p.rapidapi.com',
          'x-rapidapi-key': 'server-secret',
        },
      }),
    );
  });

  it('returns a ticker fallback without making a request when unconfigured', async () => {
    const fetchMock = vi.fn();
    const client = new TradingViewMarketClient(undefined, fetchMock);

    await expect(client.getIdentities(['AAPL'])).resolves.toEqual([
      { ticker: 'AAPL', display_ticker: 'AAPL', display_name: 'AAPL' },
    ]);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
