import { describe, expect, it, vi } from 'vitest';

import { createApp, type AppDependencies } from '../../src/backend/app';
import { Logger } from '../../src/backend/logging/logger';

function fakeDependencies(
  overrides: Partial<AppDependencies> = {},
): AppDependencies {
  return {
    auth: {
      authenticate: vi
        .fn()
        .mockResolvedValue({ userId: 'user-1', sessionId: 'session-1' }),
      getUser: vi.fn().mockResolvedValue({
        id: 'user-1',
        displayName: 'Test User',
        email: 'test@example.test',
        imageUrl: 'https://img.example.test/user-1.png',
        role: 'user',
      }),
    },
    database: { healthcheck: vi.fn().mockResolvedValue(undefined) },
    cache: {
      get: vi.fn(),
      set: vi.fn(),
      delete: vi.fn(),
      healthcheck: vi.fn().mockResolvedValue(undefined),
    },
    core: {
      healthcheck: vi.fn().mockResolvedValue(undefined),
      submitAnalysis: vi.fn(),
      listAnalyses: vi.fn(),
      getAnalysis: vi.fn(),
      getAnalysisEvents: vi.fn(),
    },
    marketAssets: { getIdentities: vi.fn(), getSnapshot: vi.fn() },
    logger: new Logger(),
    ...overrides,
  };
}

describe('createApp', () => {
  it('rejects protected API requests without a Clerk session', async () => {
    const dependencies = fakeDependencies({
      auth: {
        authenticate: vi.fn().mockResolvedValue(null),
        getUser: vi.fn(),
      },
    });
    const app = createApp(dependencies);

    const response = await app.request('/api/analyses');

    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({
      error: { code: 'UNAUTHENTICATED' },
    });
    expect(dependencies.core.listAnalyses).not.toHaveBeenCalled();
  });

  it('returns the authenticated Clerk session and normalized user', async () => {
    const dependencies = fakeDependencies();
    const app = createApp(dependencies);

    const response = await app.request('/api/auth/session');

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      data: {
        authenticated: true,
        session: { id: 'session-1' },
        user: {
          id: 'user-1',
          displayName: 'Test User',
          email: 'test@example.test',
          role: 'user',
        },
      },
    });
    expect(dependencies.auth.getUser).toHaveBeenCalledWith('user-1');
  });

  it('forwards a validated analysis request to Core', async () => {
    const dependencies = fakeDependencies({
      core: {
        healthcheck: vi.fn(),
        submitAnalysis: vi
          .fn()
          .mockResolvedValue({ id: 'job-1', ticker: 'AAPL' }),
        listAnalyses: vi.fn(),
        getAnalysis: vi.fn(),
        getAnalysisEvents: vi.fn(),
      },
      marketAssets: { getIdentities: vi.fn(), getSnapshot: vi.fn() },
    });
    const app = createApp(dependencies);

    const response = await app.request('/api/analyses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ticker: 'AAPL',
        tradeDate: '2026-07-15',
        analysts: ['market'],
      }),
    });

    expect(response.status).toBe(202);
    expect(await response.json()).toMatchObject({ data: { ticker: 'AAPL' } });
    expect(dependencies.core.submitAnalysis).toHaveBeenCalledWith({
      ticker: 'AAPL',
      trade_date: '2026-07-15',
      analysts: ['market'],
      config_overrides: {},
    });
  });

  it('returns server-side TradingView asset identities', async () => {
    const marketAssets = {
      getIdentities: vi.fn().mockResolvedValue([
        {
          ticker: '700',
          display_name: 'Tencent Holdings Ltd.',
          logo_url: 'https://tv-logo.tradingviewapi.com/logo/tencent.svg',
        },
      ]),
      getSnapshot: vi.fn(),
    };
    const app = createApp(fakeDependencies({ marketAssets }));

    const response = await app.request('/api/market-identities?ticker=700');

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      data: [{ ticker: '700', display_name: 'Tencent Holdings Ltd.' }],
    });
    expect(marketAssets.getIdentities).toHaveBeenCalledWith(['700']);
  });

  it('returns a server-side TradingView market snapshot', async () => {
    const marketAssets = {
      getIdentities: vi.fn(),
      getSnapshot: vi.fn().mockResolvedValue({
        ticker: '700',
        display_name: 'Tencent Holdings Ltd.',
        last_price: 481.8,
        currency: 'HKD',
        change_percent: 1.65,
        source: 'tradingview',
      }),
    };
    const app = createApp(fakeDependencies({ marketAssets }));

    const response = await app.request('/api/market-snapshot?ticker=700');

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      data: { ticker: '700', last_price: 481.8 },
    });
    expect(marketAssets.getSnapshot).toHaveBeenCalledWith('700');
  });

  it('returns JSON for an unknown API path instead of the SPA document', async () => {
    const app = createApp(fakeDependencies());

    const response = await app.request('/api/unknown');

    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({
      error: { code: 'NOT_FOUND' },
    });
  });

  it('returns health without invoking dependency health checks', async () => {
    const dependencies = fakeDependencies();
    const app = createApp(dependencies);

    const response = await app.request('/api/health');

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ data: { status: 'ok' } });
    expect(dependencies.database.healthcheck).not.toHaveBeenCalled();
    expect(dependencies.cache.healthcheck).not.toHaveBeenCalled();
    expect(dependencies.core.healthcheck).not.toHaveBeenCalled();
    expect(dependencies.auth.authenticate).not.toHaveBeenCalled();
  });

  it('returns degraded readiness when only cache health fails', async () => {
    const dependencies = fakeDependencies({
      cache: {
        get: vi.fn(),
        set: vi.fn(),
        delete: vi.fn(),
        healthcheck: vi.fn().mockRejectedValue(new Error('cache unavailable')),
      },
    });
    const app = createApp(dependencies);

    const response = await app.request('/api/ready');

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      data: { status: 'degraded' },
    });
  });

  it.each(['database', 'core'] as const)(
    'returns 503 readiness when %s health fails',
    async (failedDependency) => {
      const dependencies = fakeDependencies();
      dependencies[failedDependency].healthcheck = vi
        .fn()
        .mockRejectedValue(new Error(`${failedDependency} unavailable`));
      const app = createApp(dependencies);

      const response = await app.request('/api/ready');

      expect(response.status).toBe(503);
      expect(await response.json()).toMatchObject({
        error: { code: 'DEPENDENCY_UNAVAILABLE' },
      });
    },
  );
});
