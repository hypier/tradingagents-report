import { describe, expect, it, vi } from 'vitest';

import { createApp, type AppDependencies } from '../../src/backend/app';
import { buildBillingSignature } from '../../src/backend/billing/credit-pricing';
import { BillingRepositoryError } from '../../src/backend/database/billing-repository';
import { AppError } from '../../src/backend/errors/app-error';
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
        configurationSource: 'environment',
        configurationEditable: false,
        secretKeyHint: 'sk_test_...test',
        webhookSecretHint: 'whsec_...test',
        updatedAt: null,
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
      provisionDefaultPlans: vi.fn(),
      archivePlan: vi.fn(),
      updateConfiguration: vi.fn(),
      clearConfiguration: vi.fn(),
      handleWebhook: vi
        .fn()
        .mockResolvedValue({ id: 'evt_test', type: 'invoice.paid' }),
    },
    database: {
      healthcheck: vi.fn().mockResolvedValue(undefined),
      account: {
        syncUser: vi.fn().mockResolvedValue(undefined),
        getProfile: vi.fn(),
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
          estimatedCostUsd: '1.00000000',
          reservedPoints: 132,
          source: 'default',
          sampleCount: 0,
        }),
        getCreditSettings: vi.fn().mockResolvedValue({
          id: 'default',
          pointsPerUsd: '100.000000',
          markupBasisPoints: 1000,
          reserveBufferBasisPoints: 2000,
          defaultEstimatedCostUsd: '1.00000000',
          signupGrantUsd: '5.00',
          referralRewardUsd: '2.00',
          updatedByClerkUserId: null,
          createdAt: new Date('2026-07-20T00:00:00Z'),
          updatedAt: new Date('2026-07-20T00:00:00Z'),
        }),
        updateCreditSettings: vi.fn(),
        adjustCredits: vi.fn().mockResolvedValue(100),
        reserveAnalysis: vi.fn().mockResolvedValue('created'),
        attachAnalysis: vi.fn().mockResolvedValue(undefined),
        releaseAnalysis: vi.fn().mockResolvedValue(undefined),
        processStripeEvent: vi.fn().mockResolvedValue(true),
        recordStripeFailure: vi.fn().mockResolvedValue(undefined),
        listStripeWebhookEvents: vi.fn().mockResolvedValue([]),
        summarizeStripeWebhookEvents: vi.fn().mockResolvedValue({
          processed: 0,
          failed: 0,
          ignored: 0,
          processing: 0,
        }),
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
        ownsJob: vi.fn().mockResolvedValue(true),
        getReservationUnits: vi.fn().mockResolvedValue(1),
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
      reportMeta: {
        get: vi.fn(),
        listForUser: vi.fn().mockResolvedValue([]),
        upsert: vi.fn(),
      },
      shareLinks: {
        create: vi.fn(),
        listForJob: vi.fn().mockResolvedValue([]),
        getById: vi.fn(),
        getByToken: vi.fn(),
        revoke: vi.fn(),
        consumeView: vi.fn().mockResolvedValue(null),
      },
      settings: {
        getAll: vi.fn().mockResolvedValue({
          maintenance: { enabled: false, message: { en: '', zh: '' } },
          features: { watchlist: true, shareLinks: true },
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
      markets: {
        list: vi.fn().mockResolvedValue([
          {
            code: 'US',
            enabled: 1,
            displayName: 'United States',
            timezone: 'America/New_York',
            currency: 'USD',
            sessionNotes: null,
            disclaimer: null,
            sortOrder: 10,
            updatedAt: new Date(),
          },
        ]),
        get: vi.fn(),
        upsert: vi.fn(),
        setEnabled: vi.fn(),
      },
      creditRules: {
        list: vi.fn().mockResolvedValue([]),
        listEnabled: vi.fn().mockResolvedValue([
          {
            id: 'rule-1',
            label: 'Default',
            market: null,
            minAnalysts: 1,
            maxAnalysts: 99,
            units: 1,
            enabled: 1,
            priority: 0,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ]),
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
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
      modelPrices: {
        list: vi.fn().mockResolvedValue([]),
        upsert: vi.fn(),
        delete: vi.fn(),
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
        features: { watchlist: true, shareLinks: true },
      },
    });
  });

  it('serves a shared report by token without auth', async () => {
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
    const jobId = '44444444-4444-4444-8444-444444444444';
    vi.mocked(dependencies.database.shareLinks.consumeView).mockResolvedValue({
      id: 'share-1',
      token: 'abc123',
      analysisJobId: jobId,
      clerkUserId: 'user-2',
      expiresAt: new Date(Date.now() + 86_400_000),
      revokedAt: null,
      maxViews: null,
      viewCount: 1,
      createdAt: new Date(),
    });
    vi.mocked(dependencies.database.analysisJobs.getById).mockResolvedValue({
      id: jobId,
      status: 'succeeded',
      ticker: 'AAPL',
      tradeDate: '2026-07-18',
      exchange: 'NASDAQ',
      assetType: 'equity',
      analysts: ['market'],
      request: {},
      config: {},
      display: { display_name: 'Apple' },
      decision: 'Buy',
      error: null,
      progressPercent: 100,
      currentStep: null,
      costUsd: '0',
      requestId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      startedAt: null,
      finishedAt: new Date(),
      finalState: null,
      reportPath: null,
      tokensUsed: 0,
      tokenUsage: {},
      costBreakdown: {},
      events: [],
    } as never);
    vi.mocked(dependencies.core.getAnalysis).mockResolvedValue({
      id: jobId,
      reports: { market_report: '# Market' },
      decision: 'Buy',
    });
    const app = createApp(dependencies);

    const response = await app.request('/api/shared/abc123');

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      data: {
        id: jobId,
        ticker: 'AAPL',
        reports: { market_report: '# Market' },
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
    expect(dependencies.database.billing.reserveAnalysis).toHaveBeenCalledWith(
      expect.objectContaining({
        clerkUserId: 'user-2',
        billingSignature: expect.any(String),
      }),
    );
    expect(dependencies.core.submitAnalysis).toHaveBeenCalledWith(
      expect.objectContaining({
        ticker: 'NASDAQ:AAPL',
        trade_date: '2026-07-18',
        request_id: expect.any(String),
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

  it('lets an administrator update encrypted Stripe configuration', async () => {
    const dependencies = fakeDependencies();
    vi.mocked(dependencies.auth.getUser).mockResolvedValue({
      id: 'user-1',
      displayName: 'Admin User',
      email: 'admin@example.test',
      imageUrl: '',
      role: 'admin',
    });
    vi.mocked(dependencies.billing.updateConfiguration).mockResolvedValue(
      await dependencies.billing.getSettings(),
    );
    const app = createApp(dependencies);

    const response = await app.request('/api/admin/billing/configuration', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        secretKey: 'sk_test_1234567890abcdef',
        webhookSecret: 'whsec_1234567890abcdef',
      }),
    });

    expect(response.status).toBe(200);
    expect(dependencies.billing.updateConfiguration).toHaveBeenCalledWith({
      secretKey: 'sk_test_1234567890abcdef',
      webhookSecret: 'whsec_1234567890abcdef',
      actorClerkUserId: 'user-1',
    });
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
      body: JSON.stringify({
        ticker: 'AAPL',
        tradeDate: '2026-07-15',
        analysts: ['news', 'market'],
        configOverrides: { llm_provider: 'openai' },
      }),
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({
      data: { reservedPoints: 132 },
    });
    expect(body.data).not.toHaveProperty('estimatedCostUsd');
    expect(dependencies.database.billing.estimateAnalysis).toHaveBeenCalledWith(
      {
        billingSignature: buildBillingSignature({
          analysts: ['news', 'market'],
          configOverrides: {
            llm_provider: 'openai',
            quick_think_llm: 'gpt-quick',
            deep_think_llm: 'gpt-deep',
          },
        }),
      },
    );
    expect(dependencies.core.submitAnalysis).not.toHaveBeenCalled();
  });

  it('rejects an invalid analysis estimate request as a client error', async () => {
    const dependencies = fakeDependencies();
    const app = createApp(dependencies);

    const response = await app.request('/api/analyses/estimate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ticker: '', analysts: [] }),
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: { code: 'INVALID_REQUEST' },
    });
    expect(
      dependencies.database.billing.estimateAnalysis,
    ).not.toHaveBeenCalled();
  });

  it('lets an administrator read and update credit billing settings', async () => {
    const dependencies = fakeDependencies();
    vi.mocked(dependencies.auth.getUser).mockResolvedValue({
      id: 'user-1',
      displayName: 'Admin User',
      email: 'admin@example.test',
      imageUrl: '',
      role: 'admin',
    });
    vi.mocked(
      dependencies.database.billing.updateCreditSettings,
    ).mockResolvedValue(
      await dependencies.database.billing.getCreditSettings(),
    );
    const app = createApp(dependencies);

    const getResponse = await app.request('/api/admin/billing/credit-settings');
    expect(getResponse.status).toBe(200);

    const putResponse = await app.request(
      '/api/admin/billing/credit-settings',
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pointsPerUsd: '200',
          markupBasisPoints: 1500,
          reserveBufferBasisPoints: 2500,
          defaultEstimatedCostUsd: '2.5',
          signupGrantUsd: '5.25',
          referralRewardUsd: '0',
        }),
      },
    );
    expect(putResponse.status).toBe(200);
    expect(
      dependencies.database.billing.updateCreditSettings,
    ).toHaveBeenCalledWith({
      pointsPerUsd: '200',
      markupBasisPoints: 1500,
      reserveBufferBasisPoints: 2500,
      defaultEstimatedCostUsd: '2.5',
      signupGrantUsd: '5.25',
      referralRewardUsd: '0',
      actorClerkUserId: 'user-1',
    });
  });

  it('rejects reward settings with more than two decimal places', async () => {
    const dependencies = fakeDependencies();
    vi.mocked(dependencies.auth.getUser).mockResolvedValue({
      id: 'user-1',
      displayName: 'Admin User',
      email: 'admin@example.test',
      imageUrl: '',
      role: 'admin',
    });

    const response = await createApp(dependencies).request(
      '/api/admin/billing/credit-settings',
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pointsPerUsd: '100',
          markupBasisPoints: 1000,
          reserveBufferBasisPoints: 2000,
          defaultEstimatedCostUsd: '1',
          signupGrantUsd: '5.001',
          referralRewardUsd: '2',
        }),
      },
    );

    expect(response.status).toBe(400);
    expect(
      dependencies.database.billing.updateCreditSettings,
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

  it('releases a new credit reservation when Core rejects the request', async () => {
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
    expect(dependencies.database.billing.reserveAnalysis).toHaveBeenCalledWith({
      clerkUserId: 'user-1',
      requestId,
      billingSignature: buildBillingSignature({
        analysts: ['market'],
        configOverrides: {
          llm_provider: 'openai',
          quick_think_llm: 'gpt-quick',
          deep_think_llm: 'gpt-deep',
        },
      }),
    });
    expect(dependencies.database.billing.releaseAnalysis).toHaveBeenCalledWith(
      requestId,
      'analysis_request_rejected',
    );
  });

  it('attaches a credit reservation to an accepted Core job', async () => {
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
    expect(dependencies.database.billing.reserveAnalysis).toHaveBeenCalledWith({
      clerkUserId: 'user-1',
      requestId,
      billingSignature: buildBillingSignature({
        analysts: ['market'],
        configOverrides: {
          llm_provider: 'openai',
          quick_think_llm: 'gpt-quick',
          deep_think_llm: 'gpt-deep',
        },
      }),
    });
    expect(dependencies.database.billing.attachAnalysis).toHaveBeenCalledWith(
      requestId,
      '00000000-0000-4000-8000-000000000005',
    );
  });

  it('returns 402 without submitting to Core when credits are insufficient', async () => {
    const dependencies = fakeDependencies();
    vi.mocked(dependencies.database.billing.reserveAnalysis).mockRejectedValue(
      new BillingRepositoryError(
        'INSUFFICIENT_CREDITS',
        'There are not enough analysis credits available',
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
          updatePreferences: vi.fn(),
        },
        billing: {
          setStripeCustomerId: vi.fn(),
          getStripeCustomerId: vi.fn(),
          getUsage: vi.fn(),
          getCreditSettings: vi.fn(),
          updateCreditSettings: vi.fn(),
          estimateAnalysis: vi.fn(),
          getAvailableCredits: vi.fn(),
          adjustCredits: vi.fn(),
          reserveAnalysis: vi.fn(),
          attachAnalysis: vi.fn(),
          releaseAnalysis: vi.fn(),
          processStripeEvent: vi.fn(),
          recordStripeFailure: vi.fn(),
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
          ownsJob: vi.fn(),
          getReservationUnits: vi.fn(),
          getAdminOverview: vi.fn(),
        },
        watchlist: {
          getSnapshot: vi.fn(),
          addItem: vi.fn(),
          removeItem: vi.fn(),
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
          list: vi.fn().mockResolvedValue([]),
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
