import { describe, expect, it, vi } from 'vitest';

import { TradingViewMarketClient } from '../../src/backend/market-assets/tradingview-market-client';

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
      display_name: 'Tencent Holdings Ltd.',
      logo_url: 'https://tv-logo.tradingviewapi.com/logo/tencent.svg',
      last_price: 481.8,
      currency: 'HKD',
      change_percent: 1.65,
      as_of: '2026-07-16T01:30:00.000Z',
      source: 'tradingview',
    });
    expect(fetchMock).toHaveBeenLastCalledWith(
      'https://tradingview-data1.p.rapidapi.com/api/quote/HKEX:700?session=regular&fields=all',
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
      { ticker: 'AAPL', display_name: 'AAPL' },
    ]);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
