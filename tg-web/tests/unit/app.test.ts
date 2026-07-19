import { describe, expect, it, vi } from 'vitest';

import { createApp, type AppDependencies } from '../../src/backend/app';
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
      listUsers: vi.fn().mockResolvedValue({ users: [], totalCount: 0 }),
      setUserRole: vi.fn(),
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
      createCustomer: vi.fn().mockResolvedValue('cus_test'),
      createCheckout: vi
        .fn()
        .mockResolvedValue('https://checkout.stripe.test/session'),
      createPortal: vi
        .fn()
        .mockResolvedValue('https://billing.stripe.test/session'),
      createPlan: vi.fn(),
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
        recordConsents: vi.fn(),
        hasCurrentConsents: vi.fn().mockResolvedValue(true),
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
        reserveAnalysis: vi.fn().mockResolvedValue('created'),
        attachAnalysis: vi.fn().mockResolvedValue(undefined),
        releaseAnalysis: vi.fn().mockResolvedValue(undefined),
        processStripeEvent: vi.fn().mockResolvedValue(true),
        recordStripeFailure: vi.fn().mockResolvedValue(undefined),
      },
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
    ...overrides,
  };
}

describe('createApp', () => {
  it('rejects protected API requests without a Clerk session', async () => {
    const dependencies = fakeDependencies({
      auth: {
        authenticate: vi.fn().mockResolvedValue(null),
        getUser: vi.fn(),
        listUsers: vi.fn(),
        setUserRole: vi.fn(),
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

  it('records versioned legal consent for the local account profile', async () => {
    const dependencies = fakeDependencies();
    vi.mocked(dependencies.database.account.recordConsents).mockResolvedValue({
      clerkUserId: 'user-1',
      displayName: 'Test User',
      email: 'test@example.test',
      avatarUrl: '',
      interfaceLanguage: 'en',
      reportLanguage: 'English',
      timezone: 'UTC',
      defaultMarket: 'US',
      stripeCustomerId: null,
      consents: [],
      hasCurrentConsents: true,
    });
    const app = createApp(dependencies);

    const response = await app.request('/api/account/consents', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'user-agent': 'test-agent',
      },
      body: JSON.stringify({
        documentTypes: ['risk_disclaimer', 'terms', 'privacy'],
      }),
    });

    expect(response.status).toBe(201);
    expect(dependencies.database.account.recordConsents).toHaveBeenCalledWith({
      clerkUserId: 'user-1',
      documentTypes: ['risk_disclaimer', 'terms', 'privacy'],
      ipAddress: null,
      userAgent: 'test-agent',
    });
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
        },
      ],
      totalCount: 1,
    });
    const app = createApp(dependencies);

    const response = await app.request('/api/admin/users?limit=20&offset=0');

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      data: { totalCount: 1, users: [{ role: 'admin' }] },
    });
    expect(dependencies.auth.listUsers).toHaveBeenCalledWith({
      limit: 20,
      offset: 0,
    });
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
    );
  });

  it('opens the Stripe customer portal for subscription changes', async () => {
    const dependencies = fakeDependencies();
    const app = createApp(dependencies);

    const response = await app.request('/api/billing/portal', {
      method: 'POST',
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      data: { url: 'https://billing.stripe.test/session' },
    });
    expect(dependencies.billing.createPortal).toHaveBeenCalledWith('cus_test');
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
      },
      marketAssets: {
        searchMarkets: vi.fn(),
        getIdentities: vi.fn(),
        getSnapshot: vi.fn(),
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
      config_overrides: {},
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
        getAnalysis: vi.fn(),
      },
      marketAssets: {
        searchMarkets: vi.fn(),
        getIdentities: vi.fn(),
        getSnapshot: vi.fn(),
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
      ticker: '0700.HK',
      trade_date: '2026-07-15',
      analysts: ['market'],
      config_overrides: {},
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

  it('blocks analysis until current legal documents are accepted', async () => {
    const dependencies = fakeDependencies();
    vi.mocked(
      dependencies.database.account.hasCurrentConsents,
    ).mockResolvedValue(false);
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

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({
      error: { code: 'CONSENT_REQUIRED' },
    });
    expect(
      dependencies.database.billing.reserveAnalysis,
    ).not.toHaveBeenCalled();
    expect(dependencies.core.submitAnalysis).not.toHaveBeenCalled();
  });

  it('releases a reserved credit when Core rejects the request', async () => {
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
    expect(dependencies.database.billing.releaseAnalysis).toHaveBeenCalledWith(
      requestId,
      'analysis_request_rejected',
    );
  });

  it('does not release an existing reservation when a retry is rejected', async () => {
    const dependencies = fakeDependencies();
    vi.mocked(dependencies.database.billing.reserveAnalysis).mockResolvedValue(
      'existing',
    );
    vi.mocked(dependencies.core.submitAnalysis).mockRejectedValue(
      new AppError(
        'CORE_REQUEST_REJECTED',
        409,
        'Analysis service rejected the request',
      ),
    );
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

    expect(response.status).toBe(409);
    expect(
      dependencies.database.billing.releaseAnalysis,
    ).not.toHaveBeenCalled();
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
    };
    const app = createApp(fakeDependencies({ marketAssets }));

    const response = await app.request('/api/market-search?q=tencent');

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      data: [{ display_ticker: '0700.HK', provider_symbol: 'HKEX:700' }],
    });
    expect(marketAssets.searchMarkets).toHaveBeenCalledWith('tencent');
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
    };
    const app = createApp(fakeDependencies({ marketAssets }));

    const response = await app.request(
      '/api/market-snapshot?symbol=HKEX%3A700',
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      data: { ticker: '0700.HK', last_price: 481.8 },
    });
    expect(marketAssets.getSnapshot).toHaveBeenCalledWith('HKEX:700');
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
