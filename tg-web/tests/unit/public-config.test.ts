import { describe, expect, it, vi } from 'vitest';

import {
  fetchCreditEstimate,
  fetchPublicConfig,
  resolveClerkPublishableKey,
} from '../../src/frontend/lib/public-config';

describe('public config client', () => {
  it('reads the Clerk publishable key from the BFF', async () => {
    const fetchImplementation = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: { clerkPublishableKey: 'pk_live_runtime' },
          requestId: 'req-1',
        }),
        { status: 200 },
      ),
    );

    await expect(fetchPublicConfig(fetchImplementation)).resolves.toMatchObject({
      clerkPublishableKey: 'pk_live_runtime',
      features: { watchlist: true },
      maintenance: { enabled: false },
    });
  });

  it('parses extended public config fields', async () => {
    const fetchImplementation = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: {
            clerkPublishableKey: 'pk_live_runtime',
            maintenance: {
              enabled: true,
              message: { en: 'Down', zh: '维护中' },
            },
            features: { watchlist: false },
            markets: [{ code: 'US', displayName: 'United States' }],
            creditRules: [
              {
                market: 'US',
                minAnalysts: 1,
                maxAnalysts: 4,
                units: 2,
                priority: 10,
              },
            ],
          },
          requestId: 'req-2',
        }),
        { status: 200 },
      ),
    );

    await expect(fetchPublicConfig(fetchImplementation)).resolves.toMatchObject({
      maintenance: {
        enabled: true,
        message: { en: 'Down', zh: '维护中' },
      },
      features: { watchlist: false },
      markets: [{ code: 'US', displayName: 'United States' }],
      creditRules: [{ market: 'US', units: 2 }],
    });
  });

  it('fetches credit estimates', async () => {
    const fetchImplementation = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ data: { units: 3 }, requestId: 'req-3' }),
        { status: 200 },
      ),
    );

    await expect(
      fetchCreditEstimate('US', 4, fetchImplementation),
    ).resolves.toBe(3);
    expect(fetchImplementation).toHaveBeenCalledWith(
      '/api/credit-estimate?market=US&analysts=4',
    );
  });

  it('prefers runtime config over the Vite build-time key', async () => {
    const fetchImplementation = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: { clerkPublishableKey: 'pk_live_runtime' },
          requestId: 'req-1',
        }),
        { status: 200 },
      ),
    );

    await expect(
      resolveClerkPublishableKey('pk_test_vite', fetchImplementation),
    ).resolves.toBe('pk_live_runtime');
  });

  it('falls back to the Vite key when the BFF is unavailable', async () => {
    const fetchImplementation = vi
      .fn()
      .mockRejectedValue(new Error('network down'));

    await expect(
      resolveClerkPublishableKey('pk_test_vite', fetchImplementation),
    ).resolves.toBe('pk_test_vite');
  });

  it('returns null when neither runtime nor Vite key is available', async () => {
    const fetchImplementation = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 500 }));

    await expect(
      resolveClerkPublishableKey('  ', fetchImplementation),
    ).resolves.toBeNull();
  });
});
