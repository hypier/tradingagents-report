import { describe, expect, it, vi } from 'vitest';

import { AppError } from '../../src/backend/errors/app-error';
import { CoreClient } from '../../src/backend/core/client';

describe('CoreClient', () => {
  it('sends the Core bearer token only from the server client', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify({ status: 'ok', database: 'ok', detail: null }),
        ),
      );
    const client = new CoreClient(
      new URL('https://core.example.test'),
      'server-secret',
      fetchMock,
    );

    await client.healthcheck();

    expect(fetchMock).toHaveBeenCalledWith(
      'https://core.example.test/health',
      expect.objectContaining({
        headers: expect.not.objectContaining({
          Authorization: expect.anything(),
        }),
      }),
    );
  });

  it('uses the server bearer token for protected Core requests', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ id: 'analysis-1' })));
    const client = new CoreClient(
      new URL('https://core.example.test'),
      'server-secret',
      fetchMock,
    );

    await client.submitAnalysis({ ticker: 'NVDA' });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://core.example.test/api/v1/analyses',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer server-secret',
          'Content-Type': 'application/json',
        }),
      }),
    );
  });

  it('adds the authenticated owner and discards an inbound owner override', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify([])));
    const client = new CoreClient(
      new URL('https://core.example.test'),
      'server-secret',
      fetchMock,
    );
    const query = new URLSearchParams({
      status: 'succeeded',
      owner_id: 'forged-user',
    });

    await client.listAnalyses(query, 'user-1');

    expect(fetchMock).toHaveBeenCalledWith(
      'https://core.example.test/api/v1/analyses?status=succeeded&owner_id=user-1',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer server-secret',
        }),
      }),
    );
  });

  it('adds owner scope to analysis detail and events requests', async () => {
    const fetchMock = vi
      .fn()
      .mockImplementation(() =>
        Promise.resolve(new Response(JSON.stringify({ id: 'job-1' }))),
      );
    const client = new CoreClient(
      new URL('https://core.example.test'),
      'server-secret',
      fetchMock,
    );

    await client.getAnalysis('job-1', 'user_1');
    await client.getAnalysisEvents('job-1', 'user_1');

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'https://core.example.test/api/v1/analyses/job-1?owner_id=user_1',
      expect.anything(),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://core.example.test/api/v1/analyses/job-1/events?owner_id=user_1',
      expect.anything(),
    );
  });

  it('omits owner scope for administrator analysis requests', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify([])));
    const client = new CoreClient(
      new URL('https://core.example.test'),
      'server-secret',
      fetchMock,
    );

    await client.listAnalyses(new URLSearchParams(), null);

    expect(fetchMock).toHaveBeenCalledWith(
      'https://core.example.test/api/v1/analyses',
      expect.anything(),
    );
  });

  it('preserves Core 404 as an analysis-not-found error', async () => {
    const client = new CoreClient(
      new URL('https://core.example.test'),
      'server-secret',
      vi.fn().mockResolvedValue(new Response('missing', { status: 404 })),
    );

    await expect(client.getAnalysis('job-1', 'user-1')).rejects.toEqual(
      new AppError('ANALYSIS_NOT_FOUND', 404, 'Analysis job not found'),
    );
  });

  it('maps unavailable Core responses to a safe application error', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response('down', { status: 503 }));
    const client = new CoreClient(
      new URL('https://core.example.test'),
      'server-secret',
      fetchMock,
    );

    await expect(client.healthcheck()).rejects.toEqual(
      new AppError(
        'CORE_UNAVAILABLE',
        503,
        'Analysis service is temporarily unavailable',
      ),
    );
  });

  it('resolves listings through the Core listings API', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          ticker: '300750.SZ',
          exchange: 'SZSE',
          symbol: '300750',
          display_ticker: '300750.SZ',
          provider_symbol: 'SZSE:300750',
        }),
      ),
    );
    const client = new CoreClient(
      new URL('https://core.example.test'),
      'server-secret',
      fetchMock,
    );

    await expect(client.resolveListing('300750.SZ')).resolves.toEqual({
      ticker: '300750.SZ',
      exchange: 'SZSE',
      symbol: '300750',
      display_ticker: '300750.SZ',
      provider_symbol: 'SZSE:300750',
    });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://core.example.test/api/v1/listings/resolve?ticker=300750.SZ',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer server-secret',
        }),
      }),
    );
  });

  it('preserves definitive Core request rejection for quota release', async () => {
    const client = new CoreClient(
      new URL('https://core.example.test'),
      'server-secret',
      vi.fn().mockResolvedValue(new Response('invalid', { status: 400 })),
    );

    await expect(client.submitAnalysis({ ticker: 'INVALID' })).rejects.toEqual(
      new AppError(
        'CORE_REQUEST_REJECTED',
        400,
        'Analysis service rejected the request',
      ),
    );
  });
});
