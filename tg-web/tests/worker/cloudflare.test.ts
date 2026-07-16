import { describe, expect, it, vi } from 'vitest';

import {
  createWorkerHandler,
  default as worker,
  type WorkerEnv,
} from '../../src/runtimes/cloudflare';
import type { AppDependencies } from '../../src/backend/app';
import { Logger } from '../../src/backend/logging/logger';

function workerEnv(): WorkerEnv {
  return {
    ASSETS: {
      fetch(input: RequestInfo | URL) {
        const pathname = new URL(
          input instanceof Request ? input.url : input.toString(),
        ).pathname;
        return Promise.resolve(
          pathname === '/index.html'
            ? new Response('<div id="root"></div>')
            : new Response(null, { status: 404 }),
        );
      },
    } as unknown as Fetcher,
    CACHE_KV: {} as KVNamespace,
    CORE_API_KEY: 'test-key',
    CORE_API_URL: 'https://core.example.test',
    HYPERDRIVE: {
      connectionString: 'postgresql://test:test@localhost:5432/tg_web',
    } as Hyperdrive,
  };
}

describe('Cloudflare Worker runtime', () => {
  it('routes API requests to Hono before static assets', async () => {
    const response = await worker.fetch(
      new Request('https://example.test/api/unknown') as never,
      workerEnv(),
      {} as ExecutionContext,
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'NOT_FOUND' },
    });
  });

  it('falls back to index.html for a non-API SPA deep link', async () => {
    const response = await worker.fetch(
      new Request('https://example.test/analysis/history') as never,
      workerEnv(),
      {} as ExecutionContext,
    );

    expect(response.status).toBe(200);
    await expect(response.text()).resolves.toContain('<div id="root">');
  });

  it('reuses one dependency graph for repeated API requests with the same environment', async () => {
    const createDependencies = vi.fn((): AppDependencies => ({
      database: { healthcheck: async () => undefined },
      cache: {
        get: async () => null,
        set: async () => undefined,
        delete: async () => undefined,
        healthcheck: async () => undefined,
      },
      core: {
        healthcheck: async () => undefined,
        submitAnalysis: vi.fn(),
        listAnalyses: vi.fn(),
        getAnalysis: vi.fn(),
        getAnalysisEvents: vi.fn(),
      },
      marketAssets: { getIdentities: vi.fn(), getSnapshot: vi.fn() },
      logger: new Logger(),
    }));
    const handler = createWorkerHandler(createDependencies);
    const env = workerEnv();

    await handler.fetch(
      new Request('https://example.test/api/unknown') as never,
      env,
      {} as ExecutionContext,
    );
    await handler.fetch(
      new Request('https://example.test/api/unknown') as never,
      env,
      {} as ExecutionContext,
    );

    expect(createDependencies).toHaveBeenCalledTimes(1);
    expect(createDependencies).toHaveBeenCalledWith(env);
  });
});
