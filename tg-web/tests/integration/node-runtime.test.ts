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
      getManagedUser: vi.fn(),
      listUsers: vi.fn(),
      setUserRole: vi.fn(),
      setUserBanned: vi.fn(),
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
      provisionDefaultPlans: vi.fn(),
      archivePlan: vi.fn(),
      updateConfiguration: vi.fn(),
      clearConfiguration: vi.fn(),
      handleWebhook: vi.fn(),
    },
    database: {
      healthcheck: vi.fn().mockResolvedValue(undefined),
      account: fakeAccountRepository(),
      billing: fakeBillingRepository(),
      referrals: {
        isValidCode: vi.fn().mockResolvedValue(true),
        completeFirstAccess: vi.fn(),
        getSummary: vi.fn(),
      },
      analysisJobs: fakeAnalysisJobsRepository(),
      watchlist: fakeWatchlistRepository(),
      settings: fakeSettingsRepository(),
      markets: fakeMarketsRepository(),
      creditRules: fakeCreditRulesRepository(),
      audit: fakeAuditRepository(),
      modelPrices: {
        list: vi.fn().mockResolvedValue([]),
        upsert: vi.fn(),
        delete: vi.fn(),
      },
      llmCatalog: {
        listProviders: vi.fn().mockResolvedValue([]),
        getProvider: vi.fn().mockResolvedValue(null),
        upsertProvider: vi.fn(),
        deleteProvider: vi.fn().mockResolvedValue(false),
        clearProviderApiKey: vi.fn().mockResolvedValue(null),
        listModels: vi.fn().mockResolvedValue([]),
        getModel: vi.fn().mockResolvedValue(null),
        createModel: vi.fn(),
        updateModel: vi.fn(),
        deleteModel: vi.fn().mockResolvedValue(false),
        getModelsByIds: vi.fn().mockResolvedValue([]),
      },
    },
    llmSecrets: {
      configured: true,
      encrypt: vi.fn().mockResolvedValue({
        ciphertext: 'v1.a.b',
        hint: 'sk-...test',
      }),
      decrypt: vi.fn().mockResolvedValue('sk-test'),
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
      cancelAnalysis: vi.fn(),
    },
    marketAssets: {
      searchMarkets: vi.fn(),
      getIdentities: vi.fn(),
      getSnapshot: vi.fn(),
      listMarkets: vi.fn().mockResolvedValue([]),
      getStockLeaderboard: vi.fn(),
      getMarketTape: vi.fn(),
      createStreamToken: vi.fn(),
      getOhlcv: vi.fn(),
      getQuotesBatch: vi.fn(),
    },
    logger: new Logger(),
    clerkPublishableKey: 'pk_test_public',
  };
}

function fakeAccountRepository() {
  return {
    syncUser: vi.fn(),
    getProfile: vi.fn(),
    updatePreferences: vi.fn(),
  };
}

function fakeBillingRepository() {
  return {
    setStripeCustomerId: vi.fn(),
    getStripeCustomerId: vi.fn().mockResolvedValue(null),
    getUsage: vi.fn(),
    getCreditSettings: vi.fn(),
    updateCreditSettings: vi.fn(),
    estimateAnalysis: vi.fn(),
    getAvailableCredits: vi.fn(),
    adjustCredits: vi.fn(),
    reserveAnalysis: vi.fn(),
    attachAnalysis: vi.fn(),
    releaseAnalysis: vi.fn(),
    adjustCredits: vi.fn(),
    processStripeEvent: vi.fn(),
    recordStripeFailure: vi.fn(),
  };
}

function fakeAnalysisJobsRepository() {
  return {
    getById: vi.fn(),
    list: vi.fn().mockResolvedValue([]),
    listForUser: vi.fn().mockResolvedValue([]),
    listAllForAdmin: vi.fn().mockResolvedValue([]),
    getOwner: vi.fn().mockResolvedValue(null),
    ownsJob: vi.fn().mockResolvedValue(true),
    getReservationUnits: vi.fn().mockResolvedValue(1),
    getAdminOverview: vi.fn(),
  };
}

function fakeWatchlistRepository() {
  return {
    getSnapshot: vi.fn().mockResolvedValue({ items: [] }),
    addItem: vi.fn(),
    removeItem: vi.fn(),
    findItemByProviderSymbol: vi.fn(),
  };
}

function fakeSettingsRepository() {
  return {
    getAll: vi.fn().mockResolvedValue({}),
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn(),
    setMany: vi.fn().mockResolvedValue({}),
  };
}

function fakeMarketsRepository() {
  return {
    list: vi.fn().mockResolvedValue([]),
    get: vi.fn(),
    upsert: vi.fn(),
    setEnabled: vi.fn(),
  };
}

function fakeCreditRulesRepository() {
  return {
    list: vi.fn().mockResolvedValue([]),
    listEnabled: vi.fn().mockResolvedValue([]),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  };
}

function fakeAuditRepository() {
  return {
    record: vi.fn(),
    list: vi.fn().mockResolvedValue([]),
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
  it('routes invite links to Hono before static assets', async () => {
    const server = await startNodeRuntime(fakeDependencies(), {
      port: 0,
      assetsDirectory: await createAssetsDirectory(),
    });

    try {
      const response = await fetch(`${server.url}/invite/${'a'.repeat(32)}`, {
        redirect: 'manual',
      });

      expect(response.status).toBe(302);
      expect(response.headers.get('location')).toBe('/sign-up');
    } finally {
      await server.stop();
    }
  });

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
