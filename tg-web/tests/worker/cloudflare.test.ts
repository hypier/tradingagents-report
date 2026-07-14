import { describe, expect, it } from 'vitest';

import worker, { type WorkerEnv } from '../../src/runtimes/cloudflare';

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
});
