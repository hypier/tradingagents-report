import { describe, expect, it, vi } from 'vitest';

import { createApp, type AppDependencies } from '../../src/backend/app';
import { Logger } from '../../src/backend/logging/logger';

function fakeDependencies(
  overrides: Partial<AppDependencies> = {},
): AppDependencies {
  return {
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
    logger: new Logger(),
    ...overrides,
  };
}

describe('createApp', () => {
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
