import { describe, expect, it } from 'vitest';

import { BillingServiceError } from '../../src/backend/billing/contract';
import { createStripeBillingService } from '../../src/backend/billing/stripe-billing';

describe('createStripeBillingService', () => {
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
    await expect(service.createPortal('cus_test')).rejects.toMatchObject({
      code: 'BILLING_NOT_CONFIGURED',
      status: 503,
    } satisfies Partial<BillingServiceError>);
  });
});
