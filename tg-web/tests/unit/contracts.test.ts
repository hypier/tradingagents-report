import { describe, expect, it, vi } from 'vitest';

import { apiSuccess, isApiFailure } from '../../src/shared/contracts';
import { createResearch } from '../../src/frontend/lib/research';

describe('shared API contracts', () => {
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
    const fetchImplementation = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: { id: 'job-1' }, requestId: 'request-1' })),
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
});
