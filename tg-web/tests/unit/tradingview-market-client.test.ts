import { describe, expect, it, vi } from 'vitest';

import { TradingViewMarketClient } from '../../src/backend/market-assets/tradingview-market-client';

describe('TradingViewMarketClient', () => {
  it('quotes a provider symbol directly without a search round-trip', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          success: true,
          data: {
            symbol: 'HKEX:700',
            data: {
              lp: 481.8,
              ch: 7.8,
              chp: 1.65,
              currency_code: 'HKD',
              lp_time: 1784165400,
              update_mode: 'delayed_streaming_900',
              short_name: 'Tencent Holdings Ltd.',
              logoid: 'tencent',
            },
          },
        }),
      ),
    );
    const client = new TradingViewMarketClient('server-secret', fetchMock);

    await expect(client.getSnapshot('HKEX:700')).resolves.toEqual({
      ticker: '0700.HK',
      display_ticker: '0700.HK',
      display_name: 'Tencent Holdings Ltd.',
      logo_url: 'https://tv-logo.tradingviewapi.com/logo/tencent.svg',
      last_price: 481.8,
      currency: 'HKD',
      change: 7.8,
      change_percent: 1.65,
      as_of: '2026-07-16T01:30:00.000Z',
      update_mode: 'delayed_streaming_900',
      delay_seconds: 900,
      source: 'tradingview',
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://tradingview-data1.p.rapidapi.com/api/quote/HKEX%3A700?session=regular&fields=all',
      expect.anything(),
    );
  });

  it('quotes unsupported index exchanges for quote pages', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          success: true,
          data: {
            symbol: 'SP:SPX',
            data: {
              lp: 7443.28,
              ch: -14.2,
              chp: -0.19,
              currency_code: '',
              lp_time: 1784165400,
              update_mode: 'delayed_streaming_900',
              short_name: 'SPX',
              description: 'S&P 500',
              logoid: 'indices/spx',
            },
          },
        }),
      ),
    );
    const client = new TradingViewMarketClient('server-secret', fetchMock);

    await expect(client.getSnapshot('SP:SPX')).resolves.toMatchObject({
      ticker: 'SP:SPX',
      display_ticker: 'SP:SPX',
      display_name: 'S&P 500',
      last_price: 7443.28,
      change_percent: -0.19,
      currency: 'POINT',
      source: 'tradingview',
    });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://tradingview-data1.p.rapidapi.com/api/quote/SP%3ASPX?session=regular&fields=all',
      expect.anything(),
    );
  });

  it('prefers company description over ticker-like short_name', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          success: true,
          data: {
            symbol: 'NASDAQ:AAPL',
            data: {
              lp: 326.59,
              ch: -7.15,
              chp: -2.14,
              currency_code: 'USD',
              lp_time: 1784165400,
              update_mode: 'streaming',
              short_name: 'AAPL',
              description: 'Apple Inc.',
              logoid: 'apple',
            },
          },
        }),
      ),
    );
    const client = new TradingViewMarketClient('server-secret', fetchMock);

    await expect(client.getSnapshot('NASDAQ:AAPL')).resolves.toMatchObject({
      display_ticker: 'AAPL',
      display_name: 'Apple Inc.',
      last_price: 326.59,
    });
  });

  it('resolves Yahoo-suffixed tickers locally without Core', async () => {
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

  it('maps TradingView search hits into selectable listings', async () => {
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
              {
                symbol: 'BTCUSD',
                full_name: 'PYTH:BTCUSD',
                description: 'Unsupported market',
                is_primary_listing: true,
              },
              {
                symbol: 'AAPL',
                full_name: 'NASDAQ:AAPL',
                description: 'Apple Inc',
                is_primary_listing: false,
              },
            ],
          },
        }),
      ),
    );
    const client = new TradingViewMarketClient('server-secret', fetchMock);

    await expect(client.searchMarkets('ten')).resolves.toEqual([
      {
        ticker: '0700.HK',
        exchange: 'HKEX',
        symbol: '700',
        display_ticker: '0700.HK',
        provider_symbol: 'HKEX:700',
        display_name: 'Tencent Holdings Ltd.',
        logo_url: 'https://tv-logo.tradingviewapi.com/logo/tencent.svg',
        is_primary_listing: true,
      },
      {
        ticker: 'AAPL',
        exchange: 'NASDAQ',
        symbol: 'AAPL',
        display_ticker: 'AAPL',
        provider_symbol: 'NASDAQ:AAPL',
        display_name: 'Apple Inc',
        is_primary_listing: false,
      },
    ]);
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

    await expect(client.getIdentities(['0700.HK'])).resolves.toEqual([
      {
        ticker: '0700.HK',
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

  it('lists persisted TradingView market catalog with display names', async () => {
    const fetchMock = vi.fn();
    const client = new TradingViewMarketClient('server-secret', fetchMock);

    const markets = await client.listMarkets('zh');
    expect(markets.length).toBeGreaterThan(60);
    expect(markets.find((market) => market.code === 'america')).toEqual({
      code: 'america',
      displayName: '美国',
    });
    expect(markets.find((market) => market.code === 'hongkong')).toEqual({
      code: 'hongkong',
      displayName: '香港',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('parses a stock leaderboard into board items', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          success: true,
          data: {
            totalCount: 100,
            data: [
              {
                rank: 1,
                symbol: 'NASDAQ:AAPL',
                name: 'AAPL',
                description: 'Apple Inc.',
                exchange: 'NASDAQ',
                price: 200,
                change: 1.5,
                currency: 'USD',
                volume: 1_000_000,
                relativevolume: 1.2,
                marketcap: 3e12,
                pricetoearnings: 28.5,
                epsdiluted: 6.42,
                epsdilutedgrowth: 12.3,
                dividendsyield: 0.45,
                sector: 'Electronic Technology',
                analystrating: 'Buy',
                logoid: 'apple',
              },
            ],
            metadata: {
              tab: { id: 'active', title: 'Most active' },
              market: { name: 'United States', market_code: 'america' },
            },
          },
        }),
      ),
    );
    const client = new TradingViewMarketClient('server-secret', fetchMock);

    await expect(
      client.getStockLeaderboard({
        marketCode: 'america',
        tab: 'active',
        count: 20,
        lang: 'en',
      }),
    ).resolves.toMatchObject({
      marketCode: 'america',
      tab: 'active',
      totalCount: 100,
      marketName: 'United States',
      tabTitle: 'Most active',
      items: [
        {
          symbol: 'NASDAQ:AAPL',
          name: 'AAPL',
          price: 200,
          change_percent: 1.5,
          pe_ratio: 28.5,
          eps_diluted: 6.42,
          eps_diluted_growth: 12.3,
          dividend_yield: 0.45,
          sector: 'Electronic Technology',
          analyst_rating: 'Buy',
          linkable: true,
        },
      ],
    });
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain(
      '/api/leaderboard/stocks?',
    );
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('market_code=america');
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('tab=active');
  });

  it('creates a short-lived TradingView SSE stream token', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          success: true,
          token: 'jwt-abc',
          sseUrl: 'https://ws.tradingviewapi.com/sse/stream',
          expiresAt: 1_700_000_000_000,
        }),
      ),
    );
    const client = new TradingViewMarketClient('server-secret', fetchMock);

    await expect(client.createStreamToken()).resolves.toEqual({
      token: 'jwt-abc',
      sseUrl: 'https://ws.tradingviewapi.com/sse/stream',
      expiresAt: 1_700_000_000_000,
    });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://tradingview-data1.p.rapidapi.com/api/token/generate',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ 'token-jwt-type': '1' }),
      }),
    );
  });
});
