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
    CLERK_SECRET_KEY: 'sk_test_secret',
    VITE_CLERK_PUBLISHABLE_KEY: 'pk_test_public',
    CLERK_AUTHORIZED_PARTIES: 'https://example.test',
    CORE_API_KEY: 'test-key',
    CORE_API_URL: 'https://core.example.test',
    HYPERDRIVE: {
      connectionString: 'postgresql://test:test@localhost:5432/tg_web',
    } as Hyperdrive,
  };
}

describe('Cloudflare Worker runtime', () => {
  it('routes invite links to Hono before static assets', async () => {
    const dependencies = {
      database: {
        referrals: {
          isValidCode: vi.fn().mockResolvedValue(true),
        },
      },
    } as unknown as AppDependencies;
    const handler = createWorkerHandler(() => dependencies);

    const response = await handler.fetch(
      new Request(`https://example.test/invite/${'a'.repeat(32)}`) as never,
      workerEnv(),
      {} as ExecutionContext,
    );

    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe('/sign-up');
  });

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
      getAdminPeriodSummary: vi.fn(),
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
      healthcheck: async () => undefined,
      account: {
        syncUser: vi.fn(),
        getProfile: vi.fn(),
        updatePreferences: vi.fn(),
        recordConsents: vi.fn(),
        hasCurrentConsents: vi.fn(),
      },
      billing: {
        setStripeCustomerId: vi.fn(),
        getStripeCustomerId: vi.fn(),
        getUsage: vi.fn(),
        getCreditSettings: vi.fn(),
        updateCreditSettings: vi.fn(),
        estimateAnalysis: vi.fn(),
        getAvailableCredits: vi.fn(),
        reserveAnalysis: vi.fn(),
        attachAnalysis: vi.fn(),
        releaseAnalysis: vi.fn(),
        adjustCredits: vi.fn(),
        processStripeEvent: vi.fn(),
        recordStripeFailure: vi.fn(),
        listStripeWebhookEvents: vi.fn(),
        summarizeStripeWebhookEvents: vi.fn(),
      },
      referrals: {
        isValidCode: vi.fn(),
        completeFirstAccess: vi.fn(),
        getSummary: vi.fn(),
      },
      analysisJobs: {
        getById: vi.fn(),
        list: vi.fn(),
        listForUser: vi.fn(),
        listAllForAdmin: vi.fn(),
        getOwner: vi.fn(),
        ownsJob: vi.fn(),
        getReservationUnits: vi.fn(),
        getAdminOverview: vi.fn(),
      },
      watchlist: {
        getSnapshot: vi.fn(),
        ensureDefaultGroup: vi.fn(),
        createGroup: vi.fn(),
        renameGroup: vi.fn(),
        deleteGroup: vi.fn(),
        addItem: vi.fn(),
        removeItem: vi.fn(),
        reorderItems: vi.fn(),
        createTag: vi.fn(),
        deleteTag: vi.fn(),
        setItemTags: vi.fn(),
        findItemByProviderSymbol: vi.fn(),
      },
      reportMeta: {
        get: vi.fn(),
        listForUser: vi.fn(),
        upsert: vi.fn(),
      },
      shareLinks: {
        create: vi.fn(),
        listForJob: vi.fn(),
        getById: vi.fn(),
        getByToken: vi.fn(),
        revoke: vi.fn(),
        consumeView: vi.fn(),
      },
      settings: {
        getAll: vi.fn().mockResolvedValue({}),
        get: vi.fn(),
        set: vi.fn(),
        setMany: vi.fn(),
      },
      markets: {
        list: vi.fn().mockResolvedValue([]),
        get: vi.fn(),
        upsert: vi.fn(),
        setEnabled: vi.fn(),
      },
      creditRules: {
        list: vi.fn().mockResolvedValue([]),
        listEnabled: vi.fn().mockResolvedValue([]),
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
      },
      audit: {
        record: vi.fn(),
        list: vi.fn(),
      },
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
      encrypt: async () => ({ ciphertext: 'v1.a.b', hint: 'sk-...test' }),
      decrypt: async () => 'sk-test',
    },
      cache: {
        get: async () => null,
        set: async () => undefined,
        delete: async () => undefined,
        healthcheck: async () => undefined,
      },
      core: {
        healthcheck: async () => undefined,
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
