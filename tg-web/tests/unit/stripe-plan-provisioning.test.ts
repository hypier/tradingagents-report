import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DEFAULT_MONTHLY_BILLING_PLANS } from '../../src/backend/billing/default-plans';

const stripe = vi.hoisted(() => ({
  products: {
    create: vi.fn(),
    update: vi.fn(),
  },
  prices: {
    create: vi.fn(),
    list: vi.fn(),
    retrieve: vi.fn(),
    update: vi.fn(),
  },
  subscriptions: {
    list: vi.fn(),
  },
  invoices: {
    list: vi.fn(),
  },
  checkout: {
    sessions: {
      create: vi.fn(),
    },
  },
  billingPortal: {
    sessions: {
      create: vi.fn(),
    },
  },
}));

vi.mock('stripe', () => ({
  default: class FakeStripe {
    static createFetchHttpClient() {
      return {};
    }

    static createSubtleCryptoProvider() {
      return {};
    }

    products = stripe.products;
    prices = stripe.prices;
    subscriptions = stripe.subscriptions;
    invoices = stripe.invoices;
    checkout = stripe.checkout;
    billingPortal = stripe.billingPortal;
  },
}));

import { createStripeBillingService } from '../../src/backend/billing/stripe-billing';

describe('default Stripe plan provisioning', () => {
  it('grants points matching the USD catalog prices', () => {
    expect(
      DEFAULT_MONTHLY_BILLING_PLANS.map((plan) => plan.analysisCredits),
    ).toEqual([2_000, 5_000, 10_000]);
  });

  beforeEach(() => {
    vi.clearAllMocks();
    stripe.prices.list.mockResolvedValue({ data: [] });
    stripe.products.create.mockImplementation(async (input) => ({
      id: `prod_${input.metadata.catalog_key}`,
      active: true,
      ...input,
    }));
    stripe.products.update.mockImplementation(async (id, input) => ({
      id,
      active: input.active ?? true,
      metadata: {},
    }));
    stripe.prices.create.mockImplementation(async (input) => ({
      id: `price_${input.metadata.catalog_key}`,
      active: true,
      ...input,
      recurring: { ...input.recurring, interval_count: 1 },
    }));
    stripe.prices.update.mockResolvedValue(undefined);
    stripe.subscriptions.list.mockResolvedValue({ data: [] });
    stripe.invoices.list.mockResolvedValue({ data: [] });
    stripe.checkout.sessions.create.mockResolvedValue({
      url: 'https://checkout.stripe.test/session',
    });
    stripe.billingPortal.sessions.create.mockResolvedValue({
      url: 'https://billing.stripe.test/session',
    });
  });

  it('creates the three monthly products and prices through Stripe', async () => {
    const service = createStripeBillingService({
      secretKey: 'sk_test_secret',
      appBaseUrl: new URL('https://app.example.test'),
    });

    const plans = await service.provisionDefaultPlans();

    expect(plans.map((plan) => plan.unitAmount)).toEqual([
      2_000, 5_000, 10_000,
    ]);
    expect(stripe.products.create).toHaveBeenCalledTimes(3);
    expect(stripe.prices.create).toHaveBeenCalledTimes(3);
    expect(stripe.products.create).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        metadata: expect.objectContaining({
          catalog_key: 'starter-usd-monthly-2000-v2',
          analysis_credits: '2000',
        }),
      }),
      { idempotencyKey: 'tg-default-product-starter-usd-monthly-2000-v2' },
    );
    expect(stripe.prices.create).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({
        unit_amount: 10_000,
        currency: 'usd',
        recurring: { interval: 'month' },
      }),
      { idempotencyKey: 'tg-default-price-scale-usd-monthly-10000-v2' },
    );
  });

  it('reuses existing catalog prices and restores inactive entries', async () => {
    const existing = DEFAULT_MONTHLY_BILLING_PLANS.map((definition, index) =>
      existingPrice(definition, index > 0),
    );
    stripe.prices.list.mockResolvedValue({ data: existing });
    stripe.prices.retrieve.mockImplementation(async (id) =>
      existing.find((price) => price.id === id),
    );
    const service = createStripeBillingService({
      secretKey: 'sk_test_secret',
      appBaseUrl: new URL('https://app.example.test'),
    });

    const plans = await service.provisionDefaultPlans();

    expect(plans).toHaveLength(3);
    expect(stripe.products.create).not.toHaveBeenCalled();
    expect(stripe.prices.create).not.toHaveBeenCalled();
    expect(stripe.products.update).toHaveBeenCalledWith(
      'prod_starter-usd-monthly-2000-v2',
      { active: true },
    );
    expect(stripe.prices.update).toHaveBeenCalledWith(
      'price_starter-usd-monthly-2000-v2',
      { active: true },
    );
  });

  it('upgrades legacy catalog metadata so existing subscriptions grant points', async () => {
    const definition = DEFAULT_MONTHLY_BILLING_PLANS[0]!;
    const legacy = existingPrice(definition, true);
    legacy.metadata.catalog_key = 'starter-usd-monthly-20-v1';
    legacy.metadata.analysis_credits = '20';
    legacy.product.metadata.catalog_key = 'starter-usd-monthly-20-v1';
    legacy.product.metadata.analysis_credits = '20';
    stripe.prices.list.mockResolvedValue({ data: [legacy] });
    stripe.prices.retrieve.mockResolvedValue(existingPrice(definition, true));

    const service = createStripeBillingService({
      secretKey: 'sk_test_secret',
      appBaseUrl: new URL('https://app.example.test'),
    });

    await service.provisionDefaultPlans();

    expect(stripe.products.update).toHaveBeenCalledWith(
      legacy.product.id,
      expect.objectContaining({
        metadata: expect.objectContaining({
          catalog_key: definition.catalogKey,
          analysis_credits: '2000',
        }),
      }),
    );
    expect(stripe.prices.update).toHaveBeenCalledWith(
      legacy.id,
      expect.objectContaining({
        metadata: expect.objectContaining({
          catalog_key: definition.catalogKey,
          analysis_credits: '2000',
        }),
      }),
    );
    expect(stripe.products.create).toHaveBeenCalledTimes(2);
    expect(stripe.prices.create).toHaveBeenCalledTimes(2);
  });

  it('rejects an existing catalog key with conflicting terms', async () => {
    const conflicting = existingPrice(DEFAULT_MONTHLY_BILLING_PLANS[0]!, true);
    conflicting.unit_amount = 2_100;
    stripe.prices.list.mockResolvedValue({ data: [conflicting] });
    const service = createStripeBillingService({
      secretKey: 'sk_test_secret',
      appBaseUrl: new URL('https://app.example.test'),
    });

    await expect(service.provisionDefaultPlans()).rejects.toMatchObject({
      code: 'DEFAULT_BILLING_PLAN_CONFLICT',
      status: 409,
    });
    expect(stripe.products.create).not.toHaveBeenCalled();
  });

  it('rejects duplicate prices for the same catalog key', async () => {
    const existing = existingPrice(DEFAULT_MONTHLY_BILLING_PLANS[0]!, true);
    stripe.prices.list.mockResolvedValue({
      data: [existing, { ...existing, id: 'price_duplicate' }],
    });
    const service = createStripeBillingService({
      secretKey: 'sk_test_secret',
      appBaseUrl: new URL('https://app.example.test'),
    });

    await expect(service.provisionDefaultPlans()).rejects.toMatchObject({
      code: 'DEFAULT_BILLING_PLAN_CONFLICT',
      status: 409,
    });
    expect(stripe.products.create).not.toHaveBeenCalled();
  });

  it('maps a subscription name without a five-level Stripe expansion', async () => {
    const definition = DEFAULT_MONTHLY_BILLING_PLANS[0]!;
    const price = existingPrice(definition, true);
    stripe.prices.list.mockResolvedValue({ data: [price] });
    stripe.subscriptions.list.mockResolvedValue({
      data: [
        {
          id: 'sub_test',
          status: 'active',
          cancel_at_period_end: false,
          latest_invoice: null,
          items: {
            data: [
              {
                price: { id: price.id, product: price.product.id },
                current_period_start: 1,
                current_period_end: 2,
              },
            ],
          },
        },
      ],
    });
    const service = createStripeBillingService({
      secretKey: 'sk_test_secret',
      appBaseUrl: new URL('https://app.example.test'),
    });

    const overview = await service.getOverview('cus_test');

    expect(overview.subscription?.planName).toBe('Starter 20');
    expect(stripe.subscriptions.list).toHaveBeenCalledWith({
      customer: 'cus_test',
      status: 'all',
      limit: 10,
    });
  });

  it('treats a missing Stripe customer as an empty overview', async () => {
    const missing = Object.assign(new Error("No such customer: 'cus_missing'"), {
      code: 'resource_missing',
      param: 'customer',
    });
    stripe.subscriptions.list.mockRejectedValue(missing);
    const service = createStripeBillingService({
      secretKey: 'sk_test_secret',
      appBaseUrl: new URL('https://app.example.test'),
    });

    await expect(service.getOverview('cus_missing')).resolves.toEqual({
      configured: true,
      plans: [],
      subscription: null,
      invoices: [],
    });
  });

  it('uses the active interface language for Stripe-hosted pages', async () => {
    const price = existingPrice(DEFAULT_MONTHLY_BILLING_PLANS[0]!, true);
    stripe.prices.retrieve.mockResolvedValue(price);
    const service = createStripeBillingService({
      secretKey: 'sk_test_secret',
      appBaseUrl: new URL('https://app.example.test'),
    });

    await service.createCheckout(
      'cus_test',
      price.id,
      '00000000-0000-4000-8000-000000000001',
      'zh',
    );
    await service.createPortal('cus_test', 'zh');

    expect(stripe.checkout.sessions.create).toHaveBeenCalledWith(
      expect.objectContaining({ customer: 'cus_test', locale: 'zh' }),
      {
        idempotencyKey:
          'tg-checkout-cus_test-00000000-0000-4000-8000-000000000001',
      },
    );
    expect(stripe.billingPortal.sessions.create).toHaveBeenCalledWith({
      customer: 'cus_test',
      locale: 'zh',
      return_url: 'https://app.example.test/billing',
    });
  });
});

function existingPrice(
  definition: (typeof DEFAULT_MONTHLY_BILLING_PLANS)[number],
  active: boolean,
) {
  return {
    id: `price_${definition.catalogKey}`,
    active,
    unit_amount: definition.unitAmount,
    currency: definition.currency,
    recurring: { interval: definition.interval, interval_count: 1 },
    metadata: {
      managed_by: 'tradingagents-web',
      catalog_key: definition.catalogKey,
      analysis_credits: String(definition.analysisCredits),
    },
    product: {
      id: `prod_${definition.catalogKey}`,
      active,
      deleted: false,
      name: definition.name,
      description: definition.description,
      metadata: {
        managed_by: 'tradingagents-web',
        catalog_key: definition.catalogKey,
        analysis_credits: String(definition.analysisCredits),
        supported_markets: JSON.stringify(definition.supportedMarkets),
        features: JSON.stringify(definition.features),
      },
    },
  };
}
