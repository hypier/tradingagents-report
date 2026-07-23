import { describe, expect, it, vi } from 'vitest';

import { createApp, type AppDependencies } from '../../src/backend/app';
import { BillingRepositoryError } from '../../src/backend/database/billing-repository';
import { AppError } from '../../src/backend/errors/app-error';
import { Logger } from '../../src/backend/logging/logger';
import {
  DEFAULT_BILLING_SETTINGS,
  toCreditPricingSnapshot,
} from '../../src/shared/product-credits';

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
      getManagedUser: vi.fn().mockResolvedValue({
        id: 'user-1',
        displayName: 'Test User',
        email: 'test@example.test',
        imageUrl: 'https://img.example.test/user-1.png',
        role: 'user',
        createdAt: 1,
        banned: false,
      }),
      listUsers: vi.fn().mockResolvedValue({ users: [], totalCount: 0 }),
      setUserRole: vi.fn(),
      setUserBanned: vi.fn(),
      getBillingIdentity: vi.fn().mockResolvedValue({
        user: {
          id: 'user-1',
          displayName: 'Test User',
          email: 'test@example.test',
          imageUrl: '',
          role: 'user',
        },
        stripeCustomerId: 'cus_test',
      }),
      setStripeCustomerId: vi.fn(),
    },
    billing: {
      getOverview: vi.fn().mockResolvedValue({
        configured: true,
        plans: [],
        subscription: null,
        invoices: [],
      }),
      getSettings: vi.fn().mockResolvedValue({
        configured: true,
        connectionHealthy: true,
        webhookConfigured: true,
        webhookUrl: 'https://app.example.test/api/stripe/webhook',
        mode: 'test',
        plans: [],
        archivedPlans: [],
        configurationSource: 'environment',
        secretKeyHint: 'sk_test_...test',
        webhookSecretHint: 'whsec_...test',
      }),
      getAdminPeriodSummary: vi.fn().mockResolvedValue({
        currency: 'USD',
        revenueCents: 12_500,
        refundCents: 500,
        paymentFailureCount: 2,
      }),
      createCustomer: vi.fn().mockResolvedValue('cus_test'),
      createCheckout: vi
        .fn()
        .mockResolvedValue('https://checkout.stripe.test/session'),
      createPortal: vi
        .fn()
        .mockResolvedValue('https://billing.stripe.test/session'),
      createPlan: vi.fn(),
      updatePlan: vi.fn(),
      provisionDefaultPlans: vi.fn(),
      archivePlan: vi.fn(),
      restorePlan: vi.fn(),
      handleWebhook: vi
        .fn()
        .mockResolvedValue({ id: 'evt_test', type: 'invoice.paid' }),
    },
    database: {
      healthcheck: vi.fn().mockResolvedValue(undefined),
      account: {
        syncUser: vi.fn().mockResolvedValue(undefined),
        getProfile: vi.fn(),
        listProfilesByIds: vi.fn().mockResolvedValue(new Map()),
        updatePreferences: vi.fn(),
      },
      billing: {
        setStripeCustomerId: vi.fn().mockResolvedValue(undefined),
        getStripeCustomerId: vi.fn().mockResolvedValue('cus_test'),
        getUsage: vi.fn().mockResolvedValue({
          availableCredits: 10,
          reservedCredits: 0,
          spentCredits: 0,
          subscription: null,
          ledger: [],
        }),
        getAvailableCredits: vi.fn().mockResolvedValue({}),
        estimateAnalysis: vi.fn().mockResolvedValue({
          analysisBalanceThreshold: 0,
          canStart: true,
          pointsPerUsd: '100',
          markupBasisPoints: 1000,
          availableCredits: 10,
        }),
        getBillingSettings: vi.fn().mockResolvedValue(DEFAULT_BILLING_SETTINGS),
        updateBillingSettings: vi.fn().mockResolvedValue(DEFAULT_BILLING_SETTINGS),
        getRewardsSettings: vi.fn().mockResolvedValue({
          signup: { enabled: true, points: 500 },
          referral: { enabled: true, points: 200 },
          campaign: { enabled: false, points: 0, label: '', code: null },
        }),
        updateRewardsSettings: vi.fn(),
        adjustCredits: vi.fn().mockResolvedValue(100),
        assertCanStartAnalysis: vi.fn().mockResolvedValue({
          settings: DEFAULT_BILLING_SETTINGS,
          pricing: toCreditPricingSnapshot(DEFAULT_BILLING_SETTINGS),
        }),
        processStripeEvent: vi.fn().mockResolvedValue(true),
        recordStripeFailure: vi.fn().mockResolvedValue(undefined),
        listStripeWebhookEvents: vi.fn().mockResolvedValue([]),
        summarizeStripeWebhookEvents: vi.fn().mockResolvedValue({
          processed: 0,
          failed: 0,
          ignored: 0,
          processing: 0,
        }),
        listLedgerForAdmin: vi.fn().mockResolvedValue([]),
        getLedgerEntryForAdmin: vi.fn().mockResolvedValue(null),
      },
      referrals: {
        isValidCode: vi.fn().mockResolvedValue(true),
        completeFirstAccess: vi.fn().mockResolvedValue(undefined),
        getSummary: vi.fn().mockResolvedValue({
          referralPath: '/invite/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
          successfulReferrals: 0,
          earnedCredits: 0,
        }),
      },
      analysisJobs: {
        getById: vi.fn(),
        list: vi.fn().mockResolvedValue([]),
        listForUser: vi.fn().mockResolvedValue([]),
        listAllForAdmin: vi.fn().mockResolvedValue([]),
        getOwner: vi.fn().mockResolvedValue(null),
        getCreditUnitsByJobIds: vi.fn().mockResolvedValue(new Map()),
        ownsJob: vi.fn().mockResolvedValue(true),
        getAdminOverview: vi.fn().mockResolvedValue({
          userCount: 0,
          activeSubscriptionCount: 0,
          period: { from: new Date(0).toISOString(), to: new Date().toISOString() },
          analyses: {
            total: 0,
            succeeded: 0,
            failed: 0,
            queued: 0,
            running: 0,
            successRate: null,
          },
          credits: {
            availableTotal: 0,
            reservedTotal: 0,
            spentTotal: 0,
            periodConsumed: 0,
          },
          queue: { queued: 0, running: 0 },
          timing: { averageSucceededDurationSeconds: null },
        }),
      },
      watchlist: {
        getSnapshot: vi.fn().mockResolvedValue({ items: [] }),
        addItem: vi.fn(),
        removeItem: vi.fn(),
        findItemByProviderSymbol: vi.fn(),
      },
      settings: {
        getAll: vi.fn().mockResolvedValue({
          maintenance: { enabled: false, message: { en: '', zh: '' } },
          features: { watchlist: true },
          disclaimer: { version: null, markdown: { en: null, zh: null } },
          alerts: { webhookUrl: '' },
        }),
        get: vi.fn().mockImplementation(async (key: string) => {
          if (key === 'llm') {
            return {
              key: 'llm',
              value: {
                defaultQuickModelId: '11111111-1111-1111-1111-111111111111',
                defaultDeepModelId: '22222222-2222-2222-2222-222222222222',
              },
              updatedBy: null,
              updatedAt: new Date(),
            };
          }
          return null;
        }),
        set: vi.fn(),
        setMany: vi.fn().mockResolvedValue({}),
      },
      analysisExchanges: {
        list: vi.fn().mockResolvedValue([]),
        get: vi.fn(),
        isEnabled: vi.fn().mockResolvedValue(true),
        upsert: vi.fn(),
        remove: vi.fn().mockResolvedValue(true),
      },
      audit: {
        record: vi.fn().mockResolvedValue({
          id: 'audit-1',
          actorClerkUserId: 'user-1',
          action: 'test',
          targetType: null,
          targetId: null,
          metadata: {},
          createdAt: new Date(),
        }),
        list: vi.fn().mockResolvedValue([]),
      },
      llmCatalog: {
        listProviders: vi.fn().mockResolvedValue([
          {
            id: 'openai',
            displayName: 'OpenAI',
            enabled: true,
            backendUrl: null,
            apiKeyCiphertext: 'v1.a.b',
            apiKeyHint: 'sk-...test',
            sortOrder: 0,
            notes: null,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ]),
        getProvider: vi.fn().mockResolvedValue({
          id: 'openai',
          displayName: 'OpenAI',
          enabled: true,
          backendUrl: null,
          apiKeyCiphertext: 'v1.a.b',
          apiKeyHint: 'sk-...test',
          sortOrder: 0,
          notes: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        }),
        upsertProvider: vi.fn(),
        deleteProvider: vi.fn().mockResolvedValue(false),
        clearProviderApiKey: vi.fn().mockResolvedValue(null),
        listModels: vi.fn().mockResolvedValue([]),
        getModel: vi.fn().mockResolvedValue(null),
        createModel: vi.fn(),
        updateModel: vi.fn(),
        deleteModel: vi.fn().mockResolvedValue(false),
        getModelsByIds: vi.fn().mockImplementation(async (ids: string[]) =>
          [
            {
              id: '11111111-1111-1111-1111-111111111111',
              providerId: 'openai',
              model: 'gpt-quick',
              displayName: 'Quick',
              role: 'quick',
              enabled: true,
              currency: 'USD',
              unitTokens: 1_000_000,
              inputPrice: '1',
              outputPrice: '2',
              cachedInputPrice: null,
              cacheWritePrice: null,
              contextWindow: null,
              maxOutputTokens: null,
              params: {},
              capabilities: {},
              syncedAt: null,
              syncError: null,
              createdAt: new Date(),
              updatedAt: new Date(),
            },
            {
              id: '22222222-2222-2222-2222-222222222222',
              providerId: 'openai',
              model: 'gpt-deep',
              displayName: 'Deep',
              role: 'deep',
              enabled: true,
              currency: 'USD',
              unitTokens: 1_000_000,
              inputPrice: '3',
              outputPrice: '4',
              cachedInputPrice: null,
              cacheWritePrice: null,
              contextWindow: null,
              maxOutputTokens: null,
              params: {},
              capabilities: {},
              syncedAt: null,
              syncError: null,
              createdAt: new Date(),
              updatedAt: new Date(),
            },
          ].filter((row) => ids.includes(row.id)),
        ),
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
    ...overrides,
  };
}

describe('createApp', () => {
  it('captures a valid referral code in an HttpOnly cookie', async () => {
    const dependencies = fakeDependencies();
    const response = await createApp(dependencies).request(
      `/invite/${'a'.repeat(32)}`,
    );

    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe('/sign-up');
    expect(response.headers.get('set-cookie')).toContain(
      `tradingagents_referral=${'a'.repeat(32)}`,
    );
    expect(response.headers.get('set-cookie')).toContain('HttpOnly');
    expect(response.headers.get('set-cookie')).toContain('SameSite=Lax');
  });

  it('redirects invalid referral codes without setting a cookie', async () => {
    const dependencies = fakeDependencies();
    vi.mocked(dependencies.database.referrals.isValidCode).mockResolvedValue(
      false,
    );

    const response = await createApp(dependencies).request(
      `/invite/${'b'.repeat(32)}`,
    );

    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe('/sign-up?invite=invalid');
    expect(response.headers.has('set-cookie')).toBe(false);
  });

  it('settles and clears referral attribution on an authenticated request', async () => {
    const dependencies = fakeDependencies();
    const response = await createApp(dependencies).request(
      '/api/auth/session',
      {
        headers: {
          cookie: `tradingagents_referral=${'c'.repeat(32)}`,
        },
      },
    );

    expect(
      dependencies.database.referrals.completeFirstAccess,
    ).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'user-1' }),
      'c'.repeat(32),
    );
    expect(response.headers.get('set-cookie')).toContain(
      'tradingagents_referral=;',
    );
  });

  it('rejects protected API requests without a Clerk session', async () => {
    const dependencies = fakeDependencies({
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
    });
    const app = createApp(dependencies);

    const response = await app.request('/api/analyses');

    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({
      error: { code: 'UNAUTHENTICATED' },
    });
    expect(dependencies.core.listAnalyses).not.toHaveBeenCalled();
  });

  it('exposes maintenance and markets on public config', async () => {
    const dependencies = fakeDependencies();
    const app = createApp(dependencies);

    const response = await app.request('/api/public-config');

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      data: {
        clerkPublishableKey: 'pk_test_public',
        maintenance: { enabled: false },
        features: { watchlist: true },
      },
    });
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

  it('returns the current user referral summary', async () => {
    const dependencies = fakeDependencies();
    vi.mocked(dependencies.database.referrals.getSummary).mockResolvedValue({
      referralPath: `/invite/${'d'.repeat(32)}`,
      successfulReferrals: 3,
      earnedCredits: 600,
    });

    const response = await createApp(dependencies).request(
      '/api/account/referral',
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      data: {
        referralPath: `/invite/${'d'.repeat(32)}`,
        successfulReferrals: 3,
        earnedCredits: 600,
      },
    });
    expect(dependencies.database.referrals.getSummary).toHaveBeenCalledWith(
      'user-1',
    );
  });

  it('rejects the admin API for a regular user', async () => {
    const dependencies = fakeDependencies();
    const app = createApp(dependencies);

    const response = await app.request('/api/admin/users');

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({
      error: { code: 'FORBIDDEN' },
    });
    expect(dependencies.auth.listUsers).not.toHaveBeenCalled();
  });

  it('lets administrators list users', async () => {
    const dependencies = fakeDependencies();
    vi.mocked(dependencies.auth.getUser).mockResolvedValue({
      id: 'user-1',
      displayName: 'Admin User',
      email: 'admin@example.test',
      imageUrl: '',
      role: 'admin',
    });
    vi.mocked(dependencies.auth.listUsers).mockResolvedValue({
      users: [
        {
          id: 'user-1',
          displayName: 'Admin User',
          email: 'admin@example.test',
          imageUrl: '',
          role: 'admin',
          createdAt: 1,
          banned: false,
        },
      ],
      totalCount: 1,
    });
    vi.mocked(
      dependencies.database.billing.getAvailableCredits,
    ).mockResolvedValue({ 'user-1': 2400 });
    const app = createApp(dependencies);

    const response = await app.request('/api/admin/users?limit=20&offset=0');

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      data: {
        totalCount: 1,
        users: [{ role: 'admin', availableCredits: 2400 }],
      },
    });
    expect(dependencies.auth.listUsers).toHaveBeenCalledWith({
      limit: 20,
      offset: 0,
    });
    expect(
      dependencies.database.billing.getAvailableCredits,
    ).toHaveBeenCalledWith(['user-1']);
  });

  it('prevents an administrator from removing their own role', async () => {
    const dependencies = fakeDependencies();
    vi.mocked(dependencies.auth.getUser).mockResolvedValue({
      id: 'user-1',
      displayName: 'Admin User',
      email: 'admin@example.test',
      imageUrl: '',
      role: 'admin',
    });
    const app = createApp(dependencies);

    const response = await app.request('/api/admin/users/user-1/role', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: 'user' }),
    });

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      error: { code: 'SELF_DEMOTION_NOT_ALLOWED' },
    });
    expect(dependencies.auth.setUserRole).not.toHaveBeenCalled();
  });

  it('lets administrators grant access to another user', async () => {
    const dependencies = fakeDependencies();
    vi.mocked(dependencies.auth.getUser).mockResolvedValue({
      id: 'user-1',
      displayName: 'Admin User',
      email: 'admin@example.test',
      imageUrl: '',
      role: 'admin',
    });
    vi.mocked(dependencies.auth.setUserRole).mockResolvedValue({
      id: 'user-2',
      displayName: 'Second User',
      email: 'second@example.test',
      imageUrl: '',
      role: 'admin',
      createdAt: 2,
      banned: false,
    });
    const app = createApp(dependencies);

    const response = await app.request('/api/admin/users/user-2/role', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: 'admin' }),
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      data: { id: 'user-2', role: 'admin' },
    });
    expect(dependencies.auth.setUserRole).toHaveBeenCalledWith(
      'user-2',
      'admin',
    );
  });

  it('lets administrators view the operations overview', async () => {
    const dependencies = fakeDependencies();
    vi.mocked(dependencies.auth.getUser).mockResolvedValue({
      id: 'user-1',
      displayName: 'Admin User',
      email: 'admin@example.test',
      imageUrl: '',
      role: 'admin',
    });
    vi.mocked(
      dependencies.database.analysisJobs.getAdminOverview,
    ).mockResolvedValue({
      userCount: 3,
      activeSubscriptionCount: 1,
      period: {
        from: '2026-06-20T00:00:00.000Z',
        to: '2026-07-20T00:00:00.000Z',
      },
      analyses: {
        total: 10,
        succeeded: 8,
        failed: 2,
        queued: 0,
        running: 0,
        successRate: 0.8,
      },
      credits: {
        availableTotal: 40,
        reservedTotal: 2,
        spentTotal: 8,
        periodConsumed: 8,
      },
      queue: { queued: 0, running: 0 },
      timing: { averageSucceededDurationSeconds: 12.5 },
    });
    const app = createApp(dependencies);

    const response = await app.request('/api/admin/overview?days=30');

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      data: {
        userCount: 3,
        analyses: { successRate: 0.8 },
        stripe: {
          configured: true,
          connectionHealthy: true,
          period: {
            currency: 'USD',
            revenueCents: 12_500,
            refundCents: 500,
            paymentFailureCount: 2,
            webhookFailedCount: 0,
          },
        },
      },
    });
    expect(dependencies.billing.getAdminPeriodSummary).toHaveBeenCalled();
    expect(
      dependencies.database.billing.summarizeStripeWebhookEvents,
    ).toHaveBeenCalled();
  });

  it('lists Stripe webhook events for administrators', async () => {
    const dependencies = fakeDependencies();
    vi.mocked(dependencies.auth.getUser).mockResolvedValue({
      id: 'user-1',
      displayName: 'Admin User',
      email: 'admin@example.test',
      imageUrl: '',
      role: 'admin',
    });
    vi.mocked(
      dependencies.database.billing.listStripeWebhookEvents,
    ).mockResolvedValue([
      {
        stripeEventId: 'evt_1',
        eventType: 'invoice.paid',
        status: 'failed',
        payload: {
          livemode: false,
          subscription: {
            id: 'sub_1',
            customerId: 'cus_1',
            latestInvoiceId: 'in_1',
          },
        },
        error: 'customer missing',
        receivedAt: new Date('2026-07-20T00:00:00Z'),
        processedAt: null,
        updatedAt: new Date('2026-07-20T00:00:00Z'),
      },
    ]);
    vi.mocked(
      dependencies.database.billing.summarizeStripeWebhookEvents,
    ).mockResolvedValue({
      processed: 3,
      failed: 1,
      ignored: 0,
      processing: 0,
    });
    const app = createApp(dependencies);

    const response = await app.request(
      '/api/admin/stripe/events?status=failed&days=30',
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      data: {
        summary: { processed: 3, failed: 1 },
        events: [
          {
            stripeEventId: 'evt_1',
            eventType: 'invoice.paid',
            status: 'failed',
            customerId: 'cus_1',
            subscriptionId: 'sub_1',
            invoiceId: 'in_1',
          },
        ],
      },
    });
  });

  it('prevents an administrator from banning their own account', async () => {
    const dependencies = fakeDependencies();
    vi.mocked(dependencies.auth.getUser).mockResolvedValue({
      id: 'user-1',
      displayName: 'Admin User',
      email: 'admin@example.test',
      imageUrl: '',
      role: 'admin',
    });
    const app = createApp(dependencies);

    const response = await app.request('/api/admin/users/user-1/ban', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ banned: true }),
    });

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      error: { code: 'SELF_BAN_NOT_ALLOWED' },
    });
    expect(dependencies.auth.setUserBanned).not.toHaveBeenCalled();
  });

  it('lets administrators ban another user and adjust credits', async () => {
    const dependencies = fakeDependencies();
    vi.mocked(dependencies.auth.getUser).mockResolvedValue({
      id: 'user-1',
      displayName: 'Admin User',
      email: 'admin@example.test',
      imageUrl: '',
      role: 'admin',
    });
    vi.mocked(dependencies.auth.setUserBanned).mockResolvedValue({
      id: 'user-2',
      displayName: 'Second User',
      email: 'second@example.test',
      imageUrl: '',
      role: 'user',
      createdAt: 2,
      banned: true,
    });
    vi.mocked(dependencies.auth.getManagedUser).mockResolvedValue({
      id: 'user-2',
      displayName: 'Second User',
      email: 'second@example.test',
      imageUrl: '',
      role: 'user',
      createdAt: 2,
      banned: false,
    });
    const app = createApp(dependencies);

    const banResponse = await app.request('/api/admin/users/user-2/ban', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ banned: true }),
    });
    expect(banResponse.status).toBe(200);
    expect(await banResponse.json()).toMatchObject({
      data: { id: 'user-2', banned: true },
    });

    const adjustResponse = await app.request('/api/admin/credits/adjust', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clerkUserId: 'user-2',
        delta: 5,
        reason: 'manual top-up',
        idempotencyKey: '11111111-1111-4111-8111-111111111111',
      }),
    });
    expect(adjustResponse.status).toBe(200);
    expect(dependencies.database.billing.adjustCredits).toHaveBeenCalledWith({
      clerkUserId: 'user-2',
      delta: 5,
      reason: 'manual top-up',
      adjustmentId: '11111111-1111-4111-8111-111111111111',
      actorClerkUserId: 'user-1',
    });
  });

  it('retries a failed analysis as a new job for the original owner', async () => {
    const dependencies = fakeDependencies();
    vi.mocked(dependencies.auth.getUser).mockResolvedValue({
      id: 'user-1',
      displayName: 'Admin User',
      email: 'admin@example.test',
      imageUrl: '',
      role: 'admin',
    });
    const originalJobId = '22222222-2222-4222-8222-222222222222';
    const createdJobId = '33333333-3333-4333-8333-333333333333';
    vi.mocked(dependencies.database.analysisJobs.getById).mockResolvedValue({
      id: originalJobId,
      status: 'failed',
      ticker: 'AAPL',
      tradeDate: '2026-07-18',
      request: {
        instrument: { exchange: 'NASDAQ', symbol: 'AAPL' },
        output_language: 'en',
      },
      config: { deep_think_llm: 'gpt-5' },
      display: { display_name: 'Apple' },
      analysts: ['market', 'news'],
      createdAt: new Date('2026-07-18T00:00:00.000Z'),
      startedAt: null,
      finishedAt: null,
      progress: null,
      result: null,
      error: 'boom',
      events: [],
    } as never);
    vi.mocked(dependencies.database.analysisJobs.getOwner).mockResolvedValue(
      'user-2',
    );
    vi.mocked(dependencies.core.submitAnalysis).mockResolvedValue({
      id: createdJobId,
      status: 'queued',
    });
    const app = createApp(dependencies);

    const response = await app.request(
      `/api/admin/analyses/${originalJobId}/retry`,
      { method: 'POST' },
    );

    expect(response.status).toBe(202);
    expect(await response.json()).toMatchObject({
      data: {
        originalJobId,
        ownerUserId: 'user-2',
        job: { id: createdJobId },
      },
    });
    expect(dependencies.database.billing.assertCanStartAnalysis).toHaveBeenCalledWith(
      {
        clerkUserId: 'user-2',
      },
    );
    expect(dependencies.core.submitAnalysis).toHaveBeenCalledWith(
      expect.objectContaining({
        ticker: 'NASDAQ:AAPL',
        trade_date: '2026-07-18',
        request_id: expect.any(String),
        clerk_user_id: 'user-2',
        credit_pricing: toCreditPricingSnapshot(DEFAULT_BILLING_SETTINGS),
        instrument: { exchange: 'NASDAQ', symbol: 'AAPL' },
      }),
    );
  });

  it('returns the Stripe billing overview for the current user', async () => {
    const dependencies = fakeDependencies();
    const app = createApp(dependencies);

    const response = await app.request('/api/billing/overview');

    expect(response.status).toBe(200);
    expect(dependencies.auth.getBillingIdentity).toHaveBeenCalledWith('user-1');
    expect(dependencies.billing.getOverview).toHaveBeenCalledWith('cus_test');
  });

  it('creates and stores a Stripe customer before Checkout when needed', async () => {
    const dependencies = fakeDependencies();
    vi.mocked(dependencies.auth.getBillingIdentity).mockResolvedValue({
      user: {
        id: 'user-1',
        displayName: 'Test User',
        email: 'test@example.test',
        imageUrl: '',
        role: 'user',
      },
      stripeCustomerId: null,
    });
    vi.mocked(
      dependencies.database.billing.getStripeCustomerId,
    ).mockResolvedValue(null);
    const app = createApp(dependencies);

    const response = await app.request('/api/billing/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        priceId: 'price_test123',
        requestId: '00000000-0000-4000-8000-000000000001',
        locale: 'zh',
      }),
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      data: { url: 'https://checkout.stripe.test/session' },
    });
    expect(dependencies.billing.createCustomer).toHaveBeenCalledWith({
      clerkUserId: 'user-1',
      email: 'test@example.test',
      displayName: 'Test User',
    });
    expect(dependencies.auth.setStripeCustomerId).toHaveBeenCalledWith(
      'user-1',
      'cus_test',
    );
    expect(dependencies.billing.createCheckout).toHaveBeenCalledWith(
      'cus_test',
      'price_test123',
      '00000000-0000-4000-8000-000000000001',
      'zh',
    );
  });

  it('opens the Stripe customer portal for subscription changes', async () => {
    const dependencies = fakeDependencies();
    const app = createApp(dependencies);

    const response = await app.request('/api/billing/portal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ locale: 'zh' }),
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      data: { url: 'https://billing.stripe.test/session' },
    });
    expect(dependencies.billing.createPortal).toHaveBeenCalledWith(
      'cus_test',
      'zh',
      undefined,
    );
  });

  it('opens a portal deep link when upgrading to a specific price', async () => {
    const dependencies = fakeDependencies();
    const app = createApp(dependencies);

    const response = await app.request('/api/billing/portal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ locale: 'zh', priceId: 'price_growth50' }),
    });

    expect(response.status).toBe(200);
    expect(dependencies.billing.createPortal).toHaveBeenCalledWith(
      'cus_test',
      'zh',
      'price_growth50',
    );
  });

  it('rejects an unsupported Stripe-hosted page locale', async () => {
    const dependencies = fakeDependencies();
    const app = createApp(dependencies);

    const response = await app.request('/api/billing/portal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ locale: 'fr' }),
    });

    expect(response.status).toBe(400);
    expect(dependencies.billing.createPortal).not.toHaveBeenCalled();
  });

  it('lets an administrator create a recurring Stripe plan', async () => {
    const dependencies = fakeDependencies();
    vi.mocked(dependencies.auth.getUser).mockResolvedValue({
      id: 'user-1',
      displayName: 'Admin User',
      email: 'admin@example.test',
      imageUrl: '',
      role: 'admin',
    });
    vi.mocked(dependencies.billing.createPlan).mockResolvedValue({
      id: 'price_test123',
      catalogKey: null,
      name: 'Pro',
      description: null,
      unitAmount: 1900,
      currency: 'usd',
      interval: 'month',
      intervalCount: 1,
      analysisCredits: 20,
      supportedMarkets: ['US'],
      features: ['Full analyst team'],
    });
    const app = createApp(dependencies);

    const response = await app.request('/api/admin/billing/plans', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Pro',
        unitAmount: 1900,
        currency: 'usd',
        interval: 'month',
        analysisCredits: 20,
        supportedMarkets: ['US', 'HK'],
        features: ['Full analyst team'],
      }),
    });

    expect(response.status).toBe(201);
    expect(dependencies.billing.createPlan).toHaveBeenCalledWith({
      name: 'Pro',
      unitAmount: 1900,
      currency: 'usd',
      interval: 'month',
      analysisCredits: 20,
      supportedMarkets: ['US', 'HK'],
      features: ['Full analyst team'],
    });
  });

  it('lets an administrator provision the default monthly Stripe plans', async () => {
    const dependencies = fakeDependencies();
    vi.mocked(dependencies.auth.getUser).mockResolvedValue({
      id: 'user-1',
      displayName: 'Admin User',
      email: 'admin@example.test',
      imageUrl: '',
      role: 'admin',
    });
    vi.mocked(dependencies.billing.provisionDefaultPlans).mockResolvedValue([]);
    const app = createApp(dependencies);

    const response = await app.request('/api/admin/billing/plans/defaults', {
      method: 'POST',
    });

    expect(response.status).toBe(200);
    expect(dependencies.billing.provisionDefaultPlans).toHaveBeenCalledOnce();
  });

  it('lets an administrator archive a managed Stripe plan', async () => {
    const dependencies = fakeDependencies();
    vi.mocked(dependencies.auth.getUser).mockResolvedValue({
      id: 'user-1',
      displayName: 'Admin User',
      email: 'admin@example.test',
      imageUrl: '',
      role: 'admin',
    });
    const app = createApp(dependencies);

    const response = await app.request(
      '/api/admin/billing/plans/price_test123/archive',
      { method: 'POST' },
    );

    expect(response.status).toBe(200);
    expect(dependencies.billing.archivePlan).toHaveBeenCalledWith(
      'price_test123',
    );
  });

  it('lets an administrator restore a managed Stripe plan', async () => {
    const dependencies = fakeDependencies();
    vi.mocked(dependencies.auth.getUser).mockResolvedValue({
      id: 'user-1',
      displayName: 'Admin User',
      email: 'admin@example.test',
      imageUrl: '',
      role: 'admin',
    });
    const restored = {
      id: 'price_test123',
      catalogKey: null,
      name: 'Pro',
      description: null,
      unitAmount: 1900,
      currency: 'usd',
      interval: 'month' as const,
      intervalCount: 1,
      analysisCredits: 50,
      supportedMarkets: ['US'],
      features: [],
    };
    vi.mocked(dependencies.billing.restorePlan).mockResolvedValue(restored);
    const app = createApp(dependencies);

    const response = await app.request(
      '/api/admin/billing/plans/price_test123/restore',
      { method: 'POST' },
    );

    expect(response.status).toBe(200);
    expect(dependencies.billing.restorePlan).toHaveBeenCalledWith(
      'price_test123',
    );
    await expect(response.json()).resolves.toMatchObject({
      data: restored,
    });
  });

  it('lets an administrator update editable fields on a managed Stripe plan', async () => {
    const dependencies = fakeDependencies();
    vi.mocked(dependencies.auth.getUser).mockResolvedValue({
      id: 'user-1',
      displayName: 'Admin User',
      email: 'admin@example.test',
      imageUrl: '',
      role: 'admin',
    });
    const updated = {
      id: 'price_test123',
      catalogKey: null,
      name: 'Pro Plus',
      description: 'Updated',
      unitAmount: 1900,
      currency: 'usd',
      interval: 'month' as const,
      intervalCount: 1,
      analysisCredits: 80,
      supportedMarkets: ['US', 'HK'],
      features: ['Full analyst team'],
    };
    vi.mocked(dependencies.billing.updatePlan).mockResolvedValue(updated);
    const app = createApp(dependencies);

    const response = await app.request(
      '/api/admin/billing/plans/price_test123',
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Pro Plus',
          description: 'Updated',
          analysisCredits: 80,
          supportedMarkets: ['US', 'HK'],
          features: ['Full analyst team'],
        }),
      },
    );

    expect(response.status).toBe(200);
    expect(dependencies.billing.updatePlan).toHaveBeenCalledWith(
      'price_test123',
      {
        name: 'Pro Plus',
        description: 'Updated',
        analysisCredits: 80,
        supportedMarkets: ['US', 'HK'],
        features: ['Full analyst team'],
      },
    );
    await expect(response.json()).resolves.toMatchObject({ data: updated });
  });

  it('requires a Stripe signature and preserves the raw webhook body', async () => {
    const dependencies = fakeDependencies();
    const app = createApp(dependencies);

    const unsigned = await app.request('/api/stripe/webhook', {
      method: 'POST',
      body: '{"id":"evt_test"}',
    });
    expect(unsigned.status).toBe(400);
    expect(dependencies.billing.handleWebhook).not.toHaveBeenCalled();

    const signed = await app.request('/api/stripe/webhook', {
      method: 'POST',
      headers: { 'stripe-signature': 'test-signature' },
      body: '{"id":"evt_test"}',
    });
    expect(signed.status).toBe(200);
    expect(dependencies.billing.handleWebhook).toHaveBeenCalledWith(
      '{"id":"evt_test"}',
      'test-signature',
    );
  });

  it('estimates analysis credits without submitting a Core job', async () => {
    const dependencies = fakeDependencies();
    const app = createApp(dependencies);

    const response = await app.request('/api/analyses/estimate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({
      data: {
        analysisBalanceThreshold: 0,
        canStart: true,
        pointsPerUsd: '100',
        markupBasisPoints: 1000,
        availableCredits: 10,
        reservedPoints: 1,
      },
    });
    expect(dependencies.database.billing.estimateAnalysis).toHaveBeenCalledWith({
      clerkUserId: 'user-1',
    });
    expect(dependencies.core.submitAnalysis).not.toHaveBeenCalled();
  });

  it('lets owners read their report and hides other users reports from non-admins', async () => {
    const dependencies = fakeDependencies();
    vi.mocked(dependencies.database.analysisJobs.ownsJob).mockResolvedValue(
      false,
    );
    vi.mocked(dependencies.core.getAnalysis).mockResolvedValue({
      id: 'job-other',
      status: 'succeeded',
    });
    const app = createApp(dependencies);

    const denied = await app.request('/api/analyses/job-other');
    expect(denied.status).toBe(404);
    expect(dependencies.core.getAnalysis).not.toHaveBeenCalled();

    vi.mocked(dependencies.database.analysisJobs.ownsJob).mockResolvedValue(
      true,
    );
    const allowed = await app.request('/api/analyses/job-own');
    expect(allowed.status).toBe(200);
    expect(dependencies.core.getAnalysis).toHaveBeenCalledWith('job-own');
  });

  it('lets administrators read another users report detail', async () => {
    const dependencies = fakeDependencies();
    vi.mocked(dependencies.auth.getUser).mockResolvedValue({
      id: 'user-1',
      displayName: 'Admin User',
      email: 'admin@example.test',
      imageUrl: '',
      role: 'admin',
    });
    vi.mocked(dependencies.database.analysisJobs.ownsJob).mockResolvedValue(
      false,
    );
    vi.mocked(dependencies.database.analysisJobs.getOwner).mockResolvedValue(
      'user-2',
    );
    vi.mocked(dependencies.core.getAnalysis).mockResolvedValue({
      id: 'job-other',
      status: 'succeeded',
      reports: { final_trade_decision: 'Buy' },
    });
    const app = createApp(dependencies);

    const response = await app.request('/api/analyses/job-other');
    expect(response.status).toBe(200);
    expect(dependencies.database.analysisJobs.getOwner).toHaveBeenCalledWith(
      'job-other',
    );
    expect(dependencies.database.analysisJobs.ownsJob).not.toHaveBeenCalled();
    expect(dependencies.core.getAnalysis).toHaveBeenCalledWith('job-other');
    const body = await response.json();
    expect(body.data).toMatchObject({
      id: 'job-other',
      reports: { final_trade_decision: 'Buy' },
    });
  });

  it('still requires ownership for non-admins to cancel analyses', async () => {
    const dependencies = fakeDependencies();
    vi.mocked(dependencies.database.analysisJobs.ownsJob).mockResolvedValue(
      false,
    );
    const app = createApp(dependencies);

    const response = await app.request('/api/analyses/job-other/cancel', {
      method: 'POST',
    });
    expect(response.status).toBe(404);
    expect(dependencies.core.cancelAnalysis).not.toHaveBeenCalled();
  });

  it('lets an administrator read and update analysis billing settings', async () => {
    const dependencies = fakeDependencies();
    vi.mocked(dependencies.auth.getUser).mockResolvedValue({
      id: 'user-1',
      displayName: 'Admin User',
      email: 'admin@example.test',
      imageUrl: '',
      role: 'admin',
    });
    const updated = {
      analysisBalanceThreshold: 50,
      pointsPerUsd: '200',
      markupBasisPoints: 1500,
    };
    vi.mocked(
      dependencies.database.billing.updateBillingSettings,
    ).mockResolvedValue(updated);
    const app = createApp(dependencies);

    const getResponse = await app.request(
      '/api/admin/billing/analysis-settings',
    );
    expect(getResponse.status).toBe(200);

    const putResponse = await app.request(
      '/api/admin/billing/analysis-settings',
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updated),
      },
    );
    expect(putResponse.status).toBe(200);
    expect(
      dependencies.database.billing.updateBillingSettings,
    ).toHaveBeenCalledWith({
      ...updated,
      actorClerkUserId: 'user-1',
    });
  });

  it('lets an administrator read and update rewards settings', async () => {
    const dependencies = fakeDependencies();
    vi.mocked(dependencies.auth.getUser).mockResolvedValue({
      id: 'user-1',
      displayName: 'Admin User',
      email: 'admin@example.test',
      imageUrl: '',
      role: 'admin',
    });
    const updated = {
      signup: { enabled: true, points: 600 },
      referral: { enabled: false, points: 0 },
      campaign: { enabled: true, points: 100, label: 'Launch', code: 'LAUNCH' },
    };
    vi.mocked(
      dependencies.database.billing.updateRewardsSettings,
    ).mockResolvedValue(updated);
    const app = createApp(dependencies);

    const getResponse = await app.request(
      '/api/admin/billing/rewards-settings',
    );
    expect(getResponse.status).toBe(200);

    const putResponse = await app.request(
      '/api/admin/billing/rewards-settings',
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updated),
      },
    );
    expect(putResponse.status).toBe(200);
    expect(
      dependencies.database.billing.updateRewardsSettings,
    ).toHaveBeenCalledWith({
      ...updated,
      actorClerkUserId: 'user-1',
    });
  });

  it('rejects invalid analysis billing settings', async () => {
    const dependencies = fakeDependencies();
    vi.mocked(dependencies.auth.getUser).mockResolvedValue({
      id: 'user-1',
      displayName: 'Admin User',
      email: 'admin@example.test',
      imageUrl: '',
      role: 'admin',
    });

    const response = await createApp(dependencies).request(
      '/api/admin/billing/analysis-settings',
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          analysisBalanceThreshold: -1,
          pointsPerUsd: '100',
          markupBasisPoints: 1000,
        }),
      },
    );

    expect(response.status).toBe(400);
    expect(
      dependencies.database.billing.updateBillingSettings,
    ).not.toHaveBeenCalled();
  });

  it('lets an administrator adjust a synchronized user credit balance', async () => {
    const dependencies = fakeDependencies();
    vi.mocked(dependencies.auth.getUser)
      .mockResolvedValueOnce({
        id: 'user-1',
        displayName: 'Admin User',
        email: 'admin@example.test',
        imageUrl: '',
        role: 'admin',
      })
      .mockResolvedValueOnce({
        id: 'user-2',
        displayName: 'Second User',
        email: 'second@example.test',
        imageUrl: '',
        role: 'user',
      });
    vi.mocked(dependencies.database.billing.adjustCredits).mockResolvedValue(
      150,
    );
    const app = createApp(dependencies);

    const response = await app.request(
      '/api/admin/users/user-2/credit-adjustments',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          adjustmentId: '00000000-0000-4000-8000-000000000400',
          delta: 50,
          reason: 'Service credit',
        }),
      },
    );

    expect(response.status).toBe(200);
    expect(dependencies.database.account.syncUser).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'user-2' }),
    );
    expect(dependencies.database.billing.adjustCredits).toHaveBeenCalledWith({
      adjustmentId: '00000000-0000-4000-8000-000000000400',
      clerkUserId: 'user-2',
      actorClerkUserId: 'user-1',
      delta: 50,
      reason: 'Service credit',
    });
    expect(await response.json()).toMatchObject({
      data: { availableCredits: 150 },
    });
  });

  it('forwards a validated analysis request to Core', async () => {
    const dependencies = fakeDependencies({
      core: {
        healthcheck: vi.fn(),
        resolveListing: vi.fn(),
        submitAnalysis: vi.fn().mockResolvedValue({
          id: '00000000-0000-4000-8000-000000000002',
          ticker: 'AAPL',
        }),
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
    });
    const app = createApp(dependencies);

    const response = await app.request('/api/analyses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ticker: 'AAPL',
        tradeDate: '2026-07-15',
        analysts: ['market'],
        requestId: '00000000-0000-4000-8000-000000000003',
      }),
    });

    expect(response.status).toBe(202);
    expect(await response.json()).toMatchObject({ data: { ticker: 'AAPL' } });
    expect(dependencies.core.submitAnalysis).toHaveBeenCalledWith({
      ticker: 'AAPL',
      trade_date: '2026-07-15',
      analysts: ['market'],
      config_overrides: {
        llm_provider: 'openai',
        quick_think_llm: 'gpt-quick',
        deep_think_llm: 'gpt-deep',
      },
      request_id: '00000000-0000-4000-8000-000000000003',
      clerk_user_id: 'user-1',
      credit_pricing: toCreditPricingSnapshot(DEFAULT_BILLING_SETTINGS),
    });
  });

  it('forwards instrument and display metadata to Core', async () => {
    const dependencies = fakeDependencies({
      core: {
        healthcheck: vi.fn(),
        resolveListing: vi.fn(),
        submitAnalysis: vi.fn().mockResolvedValue({
          id: '00000000-0000-4000-8000-000000000006',
          ticker: '0700.HK',
        }),
        listAnalyses: vi.fn(),
        getAnalysisEvents: vi.fn(),
      cancelAnalysis: vi.fn(),
        getAnalysis: vi.fn(),
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
    });
    const app = createApp(dependencies);

    const response = await app.request('/api/analyses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ticker: '0700.HK',
        tradeDate: '2026-07-15',
        analysts: ['market'],
        requestId: '00000000-0000-4000-8000-000000000007',
        instrument: {
          exchange: 'HKEX',
          symbol: '700',
          display_ticker: '0700.HK',
        },
        display: {
          display_name: 'Tencent Holdings Ltd.',
          logo_url: 'https://example.test/tencent.svg',
        },
      }),
    });

    expect(response.status).toBe(202);
    expect(dependencies.core.submitAnalysis).toHaveBeenCalledWith({
      ticker: 'HKEX:700',
      trade_date: '2026-07-15',
      analysts: ['market'],
      config_overrides: {
        llm_provider: 'openai',
        quick_think_llm: 'gpt-quick',
        deep_think_llm: 'gpt-deep',
      },
      request_id: '00000000-0000-4000-8000-000000000007',
      clerk_user_id: 'user-1',
      credit_pricing: toCreditPricingSnapshot(DEFAULT_BILLING_SETTINGS),
      instrument: {
        exchange: 'HKEX',
        symbol: '700',
        display_ticker: '0700.HK',
      },
      display: {
        display_name: 'Tencent Holdings Ltd.',
        logo_url: 'https://example.test/tencent.svg',
      },
    });
  });

  it('checks analysis balance before submitting and surfaces Core rejections', async () => {
    const dependencies = fakeDependencies();
    vi.mocked(dependencies.core.submitAnalysis).mockRejectedValue(
      new AppError(
        'CORE_REQUEST_REJECTED',
        400,
        'Analysis service rejected the request',
      ),
    );
    const app = createApp(dependencies);
    const requestId = '00000000-0000-4000-8000-000000000004';

    const response = await app.request('/api/analyses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requestId,
        ticker: 'AAPL',
        tradeDate: '2026-07-15',
        analysts: ['market'],
      }),
    });

    expect(response.status).toBe(400);
    expect(
      dependencies.database.billing.assertCanStartAnalysis,
    ).toHaveBeenCalledWith({
      clerkUserId: 'user-1',
    });
    expect(dependencies.core.submitAnalysis).toHaveBeenCalled();
  });

  it('passes a frozen credit pricing snapshot to Core when creating an analysis', async () => {
    const dependencies = fakeDependencies({
      core: {
        healthcheck: vi.fn(),
        resolveListing: vi.fn(),
        submitAnalysis: vi.fn().mockResolvedValue({
          id: '00000000-0000-4000-8000-000000000005',
          ticker: 'MSFT',
        }),
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
    });
    const app = createApp(dependencies);
    const requestId = '00000000-0000-4000-8000-000000000005';

    const response = await app.request('/api/analyses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requestId,
        ticker: 'MSFT',
        tradeDate: '2026-07-15',
        analysts: ['market'],
      }),
    });

    expect(response.status).toBe(202);
    expect(
      dependencies.database.billing.assertCanStartAnalysis,
    ).toHaveBeenCalledWith({
      clerkUserId: 'user-1',
    });
    expect(dependencies.core.submitAnalysis).toHaveBeenCalledWith(
      expect.objectContaining({
        clerk_user_id: 'user-1',
        credit_pricing: toCreditPricingSnapshot(DEFAULT_BILLING_SETTINGS),
        request_id: requestId,
      }),
    );
  });

  it('returns 402 without submitting to Core when credits are insufficient', async () => {
    const dependencies = fakeDependencies();
    vi.mocked(
      dependencies.database.billing.assertCanStartAnalysis,
    ).mockRejectedValue(
      new BillingRepositoryError(
        'INSUFFICIENT_CREDITS',
        'Available credits are not above the analysis balance threshold',
      ),
    );
    const app = createApp(dependencies);

    const response = await app.request('/api/analyses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ticker: 'MSFT',
        tradeDate: '2026-07-15',
        analysts: ['market'],
      }),
    });

    expect(response.status).toBe(402);
    expect(await response.json()).toMatchObject({
      error: { code: 'INSUFFICIENT_CREDITS' },
    });
    expect(dependencies.core.submitAnalysis).not.toHaveBeenCalled();
  });

  it('returns server-side TradingView asset identities', async () => {
    const marketAssets = {
      searchMarkets: vi.fn(),
      getIdentities: vi.fn().mockResolvedValue([
        {
          ticker: '700',
          display_name: 'Tencent Holdings Ltd.',
          logo_url: 'https://tv-logo.tradingviewapi.com/logo/tencent.svg',
        },
      ]),
      getSnapshot: vi.fn(),
      listMarkets: vi.fn().mockResolvedValue([]),
      getStockLeaderboard: vi.fn(),
      getMarketTape: vi.fn(),
      createStreamToken: vi.fn(),
      getOhlcv: vi.fn(),
      getQuotesBatch: vi.fn(),
    };
    const app = createApp(fakeDependencies({ marketAssets }));

    const response = await app.request('/api/market-identities?ticker=700');

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      data: [{ ticker: '700', display_name: 'Tencent Holdings Ltd.' }],
    });
    expect(marketAssets.getIdentities).toHaveBeenCalledWith(['700']);
  });

  it('returns TradingView market search hits', async () => {
    const marketAssets = {
      searchMarkets: vi.fn().mockResolvedValue([
        {
          ticker: '0700.HK',
          exchange: 'HKEX',
          symbol: '700',
          display_ticker: '0700.HK',
          provider_symbol: 'HKEX:700',
          display_name: 'Tencent Holdings Ltd.',
        },
      ]),
      getIdentities: vi.fn(),
      getSnapshot: vi.fn(),
      listMarkets: vi.fn().mockResolvedValue([]),
      getStockLeaderboard: vi.fn(),
      getMarketTape: vi.fn(),
      createStreamToken: vi.fn(),
      getOhlcv: vi.fn(),
      getQuotesBatch: vi.fn(),
    };
    const app = createApp(fakeDependencies({ marketAssets }));

    const response = await app.request('/api/market-search?q=tencent');

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      data: [{ display_ticker: '0700.HK', provider_symbol: 'HKEX:700' }],
    });
    expect(marketAssets.searchMarkets).toHaveBeenCalledWith('tencent', 'en');
  });

  it('returns a server-side TradingView market snapshot', async () => {
    const marketAssets = {
      searchMarkets: vi.fn(),
      getIdentities: vi.fn(),
      getSnapshot: vi.fn().mockResolvedValue({
        ticker: '0700.HK',
        display_name: 'Tencent Holdings Ltd.',
        last_price: 481.8,
        currency: 'HKD',
        change_percent: 1.65,
        source: 'tradingview',
      }),
      listMarkets: vi.fn().mockResolvedValue([]),
      getStockLeaderboard: vi.fn(),
      getMarketTape: vi.fn(),
      createStreamToken: vi.fn(),
      getOhlcv: vi.fn(),
      getQuotesBatch: vi.fn(),
    };
    const cache = {
      get: vi.fn().mockResolvedValue(null),
      set: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn(),
      healthcheck: vi.fn(),
    };
    const app = createApp(fakeDependencies({ marketAssets, cache }));

    const response = await app.request(
      '/api/market-snapshot?symbol=HKEX%3A700',
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      data: { ticker: '0700.HK', last_price: 481.8 },
    });
    expect(marketAssets.getSnapshot).toHaveBeenCalledWith('HKEX:700');
    expect(cache.set).toHaveBeenCalledWith(
      'market-snapshot:v2:HKEX:700',
      expect.any(String),
      20,
    );
  });

  it('returns server-side OHLCV candles for chart rendering', async () => {
    const marketAssets = {
      searchMarkets: vi.fn(),
      getIdentities: vi.fn(),
      getSnapshot: vi.fn(),
      listMarkets: vi.fn().mockResolvedValue([]),
      getStockLeaderboard: vi.fn(),
      getMarketTape: vi.fn(),
      createStreamToken: vi.fn(),
      getOhlcv: vi.fn().mockResolvedValue({
        symbol: 'SZSE:300750',
        timeframe: '5',
        bars: [
          {
            time: 1_700_000_300,
            open: 1,
            high: 2,
            low: 0.5,
            close: 1.5,
            volume: 100,
          },
        ],
        source: 'tradingview',
      }),
      getQuotesBatch: vi.fn(),
    };
    const cache = {
      get: vi.fn().mockResolvedValue(null),
      set: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn(),
      healthcheck: vi.fn(),
    };
    const app = createApp(fakeDependencies({ marketAssets, cache }));

    const response = await app.request(
      '/api/market-ohlcv?symbol=SZSE%3A300750&timeframe=5&range=5',
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      data: {
        symbol: 'SZSE:300750',
        timeframe: '5',
        bars: [{ time: 1_700_000_300, close: 1.5 }],
      },
    });
    expect(marketAssets.getOhlcv).toHaveBeenCalledWith('SZSE:300750', '5', 5);
    expect(cache.set).toHaveBeenCalledWith(
      'market-ohlcv:v1:SZSE:300750:5:5',
      expect.any(String),
      30,
    );
  });

  it('returns batched market quotes for watchlist rows', async () => {
    const marketAssets = {
      searchMarkets: vi.fn(),
      getIdentities: vi.fn(),
      getSnapshot: vi.fn(),
      listMarkets: vi.fn().mockResolvedValue([]),
      getStockLeaderboard: vi.fn(),
      getMarketTape: vi.fn(),
      createStreamToken: vi.fn(),
      getOhlcv: vi.fn(),
      getQuotesBatch: vi.fn().mockResolvedValue([
        {
          symbol: 'SZSE:300750',
          name: 'CATL',
          price: 379.58,
          change_percent: 1.24,
          currency: 'CNY',
          linkable: true,
        },
        {
          symbol: 'HKEX:700',
          name: 'Tencent',
          price: 481.8,
          change_percent: -0.5,
          currency: 'HKD',
          linkable: true,
        },
      ]),
    };
    const cache = {
      get: vi.fn().mockResolvedValue(null),
      set: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn(),
      healthcheck: vi.fn(),
    };
    const app = createApp(fakeDependencies({ marketAssets, cache }));

    const response = await app.request(
      '/api/market-quotes?symbol=SZSE%3A300750&symbol=HKEX%3A700',
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      data: [
        { symbol: 'SZSE:300750', price: 379.58, change_percent: 1.24 },
        { symbol: 'HKEX:700', price: 481.8, change_percent: -0.5 },
      ],
    });
    expect(marketAssets.getQuotesBatch).toHaveBeenCalledWith([
      'SZSE:300750',
      'HKEX:700',
    ]);
    expect(cache.set).toHaveBeenCalledWith(
      'market-quote:v1:SZSE:300750',
      expect.any(String),
      20,
    );
  });

  it('serves a cached TradingView market snapshot without upstream', async () => {
    const marketAssets = {
      searchMarkets: vi.fn(),
      getIdentities: vi.fn(),
      getSnapshot: vi.fn(),
      listMarkets: vi.fn().mockResolvedValue([]),
      getStockLeaderboard: vi.fn(),
      getMarketTape: vi.fn(),
      createStreamToken: vi.fn(),
      getOhlcv: vi.fn(),
      getQuotesBatch: vi.fn(),
    };
    const cache = {
      get: vi.fn().mockResolvedValue(
        JSON.stringify({
          ticker: 'AAPL',
          last_price: 326.59,
          currency: 'USD',
          change_percent: -2.14,
          source: 'tradingview',
        }),
      ),
      set: vi.fn(),
      delete: vi.fn(),
      healthcheck: vi.fn(),
    };
    const app = createApp(fakeDependencies({ marketAssets, cache }));

    const response = await app.request(
      '/api/market-snapshot?symbol=NASDAQ%3AAAPL',
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      data: { ticker: 'AAPL', last_price: 326.59 },
    });
    expect(marketAssets.getSnapshot).not.toHaveBeenCalled();
  });

  it('bypasses market snapshot cache when refresh=1', async () => {
    const marketAssets = {
      searchMarkets: vi.fn(),
      getIdentities: vi.fn(),
      getSnapshot: vi.fn().mockResolvedValue({
        ticker: 'AAPL',
        last_price: 330,
        currency: 'USD',
        change_percent: 0.5,
        source: 'tradingview',
      }),
      listMarkets: vi.fn().mockResolvedValue([]),
      getStockLeaderboard: vi.fn(),
      getMarketTape: vi.fn(),
      createStreamToken: vi.fn(),
      getOhlcv: vi.fn(),
      getQuotesBatch: vi.fn(),
    };
    const cache = {
      get: vi.fn().mockResolvedValue(
        JSON.stringify({
          ticker: 'AAPL',
          last_price: 326.59,
          currency: 'USD',
          change_percent: -2.14,
          source: 'tradingview',
        }),
      ),
      set: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn(),
      healthcheck: vi.fn(),
    };
    const app = createApp(fakeDependencies({ marketAssets, cache }));

    const response = await app.request(
      '/api/market-snapshot?symbol=NASDAQ%3AAAPL&refresh=1',
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      data: { ticker: 'AAPL', last_price: 330 },
    });
    expect(cache.get).not.toHaveBeenCalled();
    expect(marketAssets.getSnapshot).toHaveBeenCalledWith('NASDAQ:AAPL');
  });

  it('returns TradingView market codes for the quotes desk', async () => {
    const marketAssets = {
      searchMarkets: vi.fn(),
      getIdentities: vi.fn(),
      getSnapshot: vi.fn(),
      listMarkets: vi.fn().mockResolvedValue([
        { code: 'america', displayName: 'United States' },
        { code: 'japan', displayName: 'Japan' },
      ]),
      getStockLeaderboard: vi.fn(),
      getMarketTape: vi.fn(),
      createStreamToken: vi.fn(),
      getOhlcv: vi.fn(),
      getQuotesBatch: vi.fn(),
    };
    const app = createApp(fakeDependencies({ marketAssets }));

    const response = await app.request('/api/market-markets?lang=en');

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      data: {
        markets: [
          { code: 'america', displayName: 'United States' },
          { code: 'japan', displayName: 'Japan' },
        ],
      },
    });
    expect(marketAssets.listMarkets).toHaveBeenCalledWith('en');
  });

  it('returns a market board for a TradingView market_code', async () => {
    const marketAssets = {
      searchMarkets: vi.fn(),
      getIdentities: vi.fn(),
      getSnapshot: vi.fn(),
      listMarkets: vi.fn().mockResolvedValue([]),
      getStockLeaderboard: vi.fn().mockResolvedValue({
        marketCode: 'hongkong',
        tab: 'active',
        totalCount: 12,
        items: [
          {
            rank: 1,
            symbol: 'HKEX:700',
            name: '700',
            description: 'Tencent',
            exchange: 'HKEX',
            price: 400,
            change_percent: 1.2,
            currency: 'HKD',
            linkable: true,
          },
        ],
      }),
      getMarketTape: vi.fn(),
      createStreamToken: vi.fn(),
      getOhlcv: vi.fn(),
      getQuotesBatch: vi.fn(),
    };
    const app = createApp(fakeDependencies({ marketAssets }));

    const response = await app.request(
      '/api/market-board?market_code=hongkong&tab=active',
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      data: {
        marketCode: 'hongkong',
        items: [{ symbol: 'HKEX:700' }],
      },
    });
    expect(marketAssets.getStockLeaderboard).toHaveBeenCalledWith(
      expect.objectContaining({
        marketCode: 'hongkong',
        tab: 'active',
      }),
    );
  });

  it('returns a market tape for a TradingView market_code', async () => {
    const marketAssets = {
      searchMarkets: vi.fn(),
      getIdentities: vi.fn(),
      getSnapshot: vi.fn(),
      listMarkets: vi.fn().mockResolvedValue([]),
      getStockLeaderboard: vi.fn(),
      createStreamToken: vi.fn(),
      getOhlcv: vi.fn(),
      getQuotesBatch: vi.fn(),
      getMarketTape: vi.fn().mockResolvedValue({
        marketCode: 'america',
        pinned: [
          {
            symbol: 'SP:SPX',
            name: 'S&P 500',
            price: 5000,
            change_percent: 0.2,
            currency: 'USD',
            linkable: true,
          },
        ],
        tape: [],
      }),
    };
    const app = createApp(fakeDependencies({ marketAssets }));

    const response = await app.request('/api/market-tape?market_code=america');

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      data: { marketCode: 'america', pinned: [{ symbol: 'SP:SPX' }] },
    });
    expect(marketAssets.getMarketTape).toHaveBeenCalledWith('america', 'en');
  });

  it('returns a TradingView SSE stream token', async () => {
    const marketAssets = {
      searchMarkets: vi.fn(),
      getIdentities: vi.fn(),
      getSnapshot: vi.fn(),
      listMarkets: vi.fn().mockResolvedValue([]),
      getStockLeaderboard: vi.fn(),
      getMarketTape: vi.fn(),
      createStreamToken: vi.fn().mockResolvedValue({
        token: 'jwt-test',
        sseUrl: 'https://ws.tradingviewapi.com/sse/stream',
        expiresAt: 1_700_000_000_000,
      }),
      getOhlcv: vi.fn(),
      getQuotesBatch: vi.fn(),
    };
    const app = createApp(fakeDependencies({ marketAssets }));

    const response = await app.request('/api/market-stream-token');

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      data: {
        token: 'jwt-test',
        sseUrl: 'https://ws.tradingviewapi.com/sse/stream',
        expiresAt: 1_700_000_000_000,
      },
    });
    expect(marketAssets.createStreamToken).toHaveBeenCalled();
  });

  it('returns JSON for an unknown API path instead of the SPA document', async () => {
    const app = createApp(fakeDependencies());

    const response = await app.request('/api/unknown');

    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({
      error: { code: 'NOT_FOUND' },
    });
  });

  it('logs unexpected errors that become INTERNAL_ERROR responses', async () => {
    const logger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };
    const dependencies = fakeDependencies({
      logger: logger as unknown as Logger,
      database: {
        healthcheck: vi.fn().mockResolvedValue(undefined),
        account: {
          syncUser: vi.fn(),
          getProfile: vi.fn(),
          listProfilesByIds: vi.fn().mockResolvedValue(new Map()),
          updatePreferences: vi.fn(),
        },
        billing: {
          setStripeCustomerId: vi.fn(),
          getStripeCustomerId: vi.fn(),
          getUsage: vi.fn(),
          getBillingSettings: vi.fn(),
          updateBillingSettings: vi.fn(),
          getRewardsSettings: vi.fn(),
          updateRewardsSettings: vi.fn(),
          estimateAnalysis: vi.fn(),
          getAvailableCredits: vi.fn(),
          adjustCredits: vi.fn(),
          assertCanStartAnalysis: vi.fn(),
          processStripeEvent: vi.fn(),
          recordStripeFailure: vi.fn(),
          listStripeWebhookEvents: vi.fn().mockResolvedValue([]),
          summarizeStripeWebhookEvents: vi.fn().mockResolvedValue({
            processed: 0,
            failed: 0,
            ignored: 0,
            processing: 0,
          }),
          listLedgerForAdmin: vi.fn().mockResolvedValue([]),
          getLedgerEntryForAdmin: vi.fn().mockResolvedValue(null),
        },
        referrals: {
          isValidCode: vi.fn(),
          completeFirstAccess: vi
            .fn()
            .mockRejectedValue(
              new Error('connect ECONNREFUSED 127.0.0.1:5432'),
            ),
          getSummary: vi.fn(),
        },
        analysisJobs: {
          getById: vi.fn(),
          list: vi.fn(),
          listForUser: vi.fn(),
          listAllForAdmin: vi.fn(),
          getOwner: vi.fn(),
          getCreditUnitsByJobIds: vi.fn().mockResolvedValue(new Map()),
          ownsJob: vi.fn(),
          getAdminOverview: vi.fn(),
        },
        watchlist: {
          getSnapshot: vi.fn(),
          addItem: vi.fn(),
          removeItem: vi.fn(),
          findItemByProviderSymbol: vi.fn(),
        },
        settings: {
          getAll: vi.fn().mockResolvedValue({}),
          get: vi.fn(),
          set: vi.fn(),
          setMany: vi.fn(),
        },
        analysisExchanges: {
          list: vi.fn().mockResolvedValue([]),
          get: vi.fn(),
          isEnabled: vi.fn().mockResolvedValue(true),
          upsert: vi.fn(),
          remove: vi.fn().mockResolvedValue(true),
        },
        audit: {
          record: vi.fn(),
          list: vi.fn().mockResolvedValue([]),
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
    });
    const app = createApp(dependencies);

    const response = await app.request('/api/analyses');

    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({
      error: { code: 'INTERNAL_ERROR' },
    });
    expect(logger.error).toHaveBeenCalledWith(
      'Request failed',
      expect.objectContaining({
        path: '/api/analyses',
        code: 'INTERNAL_ERROR',
        error: 'connect ECONNREFUSED 127.0.0.1:5432',
      }),
    );
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

  it('exposes the Clerk publishable key via public config', async () => {
    const app = createApp(
      fakeDependencies({ clerkPublishableKey: 'pk_live_from_runtime' }),
    );

    const response = await app.request('/api/public-config');

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      data: { clerkPublishableKey: 'pk_live_from_runtime' },
    });
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
