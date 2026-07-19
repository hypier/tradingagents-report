import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import type { AppDependencies } from '../../src/backend/app';
import { Logger } from '../../src/backend/logging/logger';
import { startNodeRuntime } from '../../src/runtimes/node';

vi.mock('../../src/backend/app', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/backend/app')>();

  return {
    ...actual,
    createApp(dependencies: AppDependencies) {
      const app = actual.createApp(dependencies);
      app.post('/api/echo', async (context) =>
        context.json({ data: await context.req.json() }),
      );
      return app;
    },
  };
});

const temporaryDirectories: string[] = [];

function fakeDependencies(): AppDependencies {
  return {
    auth: {
      authenticate: vi.fn().mockResolvedValue(null),
      getUser: vi.fn(),
      listUsers: vi.fn(),
      setUserRole: vi.fn(),
      getBillingIdentity: vi.fn(),
      setStripeCustomerId: vi.fn(),
    },
    billing: {
      getOverview: vi.fn(),
      getSettings: vi.fn(),
      createCustomer: vi.fn(),
      createCheckout: vi.fn(),
      createPortal: vi.fn(),
      createPlan: vi.fn(),
      archivePlan: vi.fn(),
      updateConfiguration: vi.fn(),
      clearConfiguration: vi.fn(),
      handleWebhook: vi.fn(),
    },
    database: {
      healthcheck: vi.fn().mockResolvedValue(undefined),
      product: fakeProductRepository(),
    },
    cache: {
      get: vi.fn(),
      set: vi.fn(),
      delete: vi.fn(),
      healthcheck: vi.fn().mockResolvedValue(undefined),
    },
    core: {
      healthcheck: vi.fn().mockResolvedValue(undefined),
      resolveListing: vi.fn(),
      submitAnalysis: vi.fn(),
      listAnalyses: vi.fn(),
      getAnalysis: vi.fn(),
      getAnalysisEvents: vi.fn(),
    },
    marketAssets: {
      searchMarkets: vi.fn(),
      getIdentities: vi.fn(),
      getSnapshot: vi.fn(),
    },
    logger: new Logger(),
  };
}

function fakeProductRepository() {
  return {
    syncUser: vi.fn(),
    getProfile: vi.fn(),
    updatePreferences: vi.fn(),
    recordConsents: vi.fn(),
    hasCurrentConsents: vi.fn().mockResolvedValue(true),
    setStripeCustomerId: vi.fn(),
    getStripeCustomerId: vi.fn().mockResolvedValue(null),
    getUsage: vi.fn(),
    reserveAnalysis: vi.fn(),
    attachAnalysis: vi.fn(),
    releaseAnalysis: vi.fn(),
    processStripeEvent: vi.fn(),
    recordStripeFailure: vi.fn(),
  };
}

async function createAssetsDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'tg-web-assets-'));
  temporaryDirectories.push(directory);
  await writeFile(directory + '/index.html', '<div id="root"></div>');
  return directory;
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe('Node runtime', () => {
  it('keeps unknown API paths in the BFF response format', async () => {
    const server = await startNodeRuntime(fakeDependencies(), {
      port: 0,
      assetsDirectory: await createAssetsDirectory(),
    });

    try {
      const response = await fetch(`${server.url}/api/unknown`);

      expect(response.status).toBe(404);
      await expect(response.json()).resolves.toMatchObject({
        error: { code: 'NOT_FOUND' },
      });
    } finally {
      await server.stop();
    }
  });

  it('forwards JSON request bodies to the BFF', async () => {
    const server = await startNodeRuntime(fakeDependencies(), {
      port: 0,
      assetsDirectory: await createAssetsDirectory(),
    });

    try {
      const response = await fetch(`${server.url}/api/echo`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ticker: 'AAPL' }),
      });

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({
        data: { ticker: 'AAPL' },
      });
    } finally {
      await server.stop();
    }
  });

  it('serves the SPA document for client deep links', async () => {
    const server = await startNodeRuntime(fakeDependencies(), {
      port: 0,
      assetsDirectory: await createAssetsDirectory(),
    });

    try {
      await expect(
        fetch(`${server.url}/a/client/route`).then((response) =>
          response.text(),
        ),
      ).resolves.toContain('<div id="root">');
    } finally {
      await server.stop();
    }
  });
});
