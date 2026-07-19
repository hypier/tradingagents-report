import { describe, expect, it } from 'vitest';

import { BillingServiceError } from '../../src/backend/billing/contract';
import { DEFAULT_MONTHLY_BILLING_PLANS } from '../../src/backend/billing/default-plans';
import { createStripeBillingService } from '../../src/backend/billing/stripe-billing';

describe('createStripeBillingService', () => {
  it('defines the USD 20, 50, and 100 monthly catalog', () => {
    expect(
      DEFAULT_MONTHLY_BILLING_PLANS.map((plan) => ({
        unitAmount: plan.unitAmount,
        interval: plan.interval,
        analysisCredits: plan.analysisCredits,
      })),
    ).toEqual([
      { unitAmount: 2_000, interval: 'month', analysisCredits: 20 },
      { unitAmount: 5_000, interval: 'month', analysisCredits: 50 },
      { unitAmount: 10_000, interval: 'month', analysisCredits: 100 },
    ]);
  });

  it('starts in a safe unconfigured state without a Stripe secret', async () => {
    const service = createStripeBillingService({
      appBaseUrl: new URL('https://app.example.test'),
    });

    await expect(service.getOverview(null)).resolves.toEqual({
      configured: false,
      plans: [],
      subscription: null,
      invoices: [],
    });
    await expect(service.getSettings()).resolves.toEqual({
      configured: false,
      connectionHealthy: false,
      webhookConfigured: false,
      webhookUrl: 'https://app.example.test/api/stripe/webhook',
      mode: 'unconfigured',
      plans: [],
      configurationSource: 'none',
      configurationEditable: false,
      secretKeyHint: null,
      webhookSecretHint: null,
      updatedAt: null,
    });
    await expect(service.createPortal('cus_test', 'en')).rejects.toMatchObject({
      code: 'BILLING_NOT_CONFIGURED',
      status: 503,
    } satisfies Partial<BillingServiceError>);
    await expect(service.provisionDefaultPlans()).rejects.toMatchObject({
      code: 'BILLING_NOT_CONFIGURED',
      status: 503,
    } satisfies Partial<BillingServiceError>);
  });
});
