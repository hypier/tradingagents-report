import { afterEach, describe, expect, it, vi } from 'vitest';

import { apiSuccess, isApiFailure } from '../../src/shared/contracts';
import {
  createResearch,
  estimateResearch,
} from '../../src/frontend/lib/research';

describe('shared API contracts', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('builds a typed success envelope and identifies failure envelopes', () => {
    expect(apiSuccess({ status: 'ok' }, 'req-1')).toEqual({
      data: { status: 'ok' },
      requestId: 'req-1',
    });
    expect(
      isApiFailure({
        error: { code: 'NOT_FOUND', message: 'missing', requestId: 'req-1' },
      }),
    ).toBe(true);
  });

  it('posts browser research input to the same-origin analyses endpoint', async () => {
    const fetchImplementation = vi
      .fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify({ data: { id: 'job-1' }, requestId: 'request-1' }),
        ),
      );
    await createResearch(
      { ticker: 'AAPL', tradeDate: '2026-07-15', analysts: ['market'] },
      fetchImplementation,
    );
    expect(fetchImplementation).toHaveBeenCalledWith(
      '/api/analyses',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('submits research when randomUUID is unavailable on an insecure HTTP origin', async () => {
    const originalCrypto = globalThis.crypto;
    vi.stubGlobal('crypto', {
      getRandomValues: originalCrypto.getRandomValues.bind(originalCrypto),
    });
    const fetchImplementation = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ data: { id: 'job-1' }, requestId: 'request-1' }),
      ),
    );

    await createResearch(
      { ticker: 'AAPL', tradeDate: '2026-07-21', analysts: ['market'] },
      fetchImplementation,
    );

    const request = fetchImplementation.mock.calls[0]?.[1];
    const body = JSON.parse(String(request?.body)) as { requestId?: string };
    expect(body.requestId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });

  it('requests a server-side credit estimate for research input', async () => {
    const fetchImplementation = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: {
            estimatedCostUsd: '1.00000000',
            reservedPoints: 132,
            source: 'default',
            sampleCount: 0,
          },
          requestId: 'request-2',
        }),
      ),
    );
    await estimateResearch(
      {
        ticker: 'AAPL',
        tradeDate: '2026-07-15',
        analysts: ['market'],
        outputLanguage: 'English',
      },
      fetchImplementation,
    );
    expect(fetchImplementation).toHaveBeenCalledWith(
      '/api/analyses/estimate',
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('output_language'),
      }),
    );
  });
});
