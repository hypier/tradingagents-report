import { describe, expect, it, vi } from 'vitest';
import type Stripe from 'stripe';

import { BillingServiceError } from '../../src/backend/billing/contract';
import { DEFAULT_MONTHLY_BILLING_PLANS } from '../../src/backend/billing/default-plans';
import {
  createStripeBillingService,
  normalizeWebhookEvent,
} from '../../src/backend/billing/stripe-billing';

describe('createStripeBillingService', () => {
  it('defines the USD 20, 50, and 100 monthly catalog', () => {
    expect(
      DEFAULT_MONTHLY_BILLING_PLANS.map((plan) => ({
        unitAmount: plan.unitAmount,
        interval: plan.interval,
        analysisCredits: plan.analysisCredits,
      })),
    ).toEqual([
      { unitAmount: 2_000, interval: 'month', analysisCredits: 2_000 },
      { unitAmount: 5_000, interval: 'month', analysisCredits: 5_000 },
      { unitAmount: 10_000, interval: 'month', analysisCredits: 10_000 },
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
      archivedPlans: [],
      configurationSource: 'none',
      secretKeyHint: null,
      webhookSecretHint: null,
    });
    await expect(
      service.getAdminPeriodSummary({
        from: new Date('2026-06-20T00:00:00Z'),
        to: new Date('2026-07-20T00:00:00Z'),
      }),
    ).resolves.toBeNull();
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

describe('normalizeWebhookEvent', () => {
  const stripe = {
    subscriptions: {
      retrieve: vi.fn(),
    },
    prices: {
      retrieve: vi.fn(),
    },
    charges: {
      retrieve: vi.fn(),
    },
  } as unknown as Stripe;

  it('maps create, cycle, and upgrade invoice grants', async () => {
    stripe.subscriptions.retrieve = vi.fn().mockResolvedValue({
      id: 'sub_1',
      customer: 'cus_1',
      status: 'active',
      cancel_at_period_end: false,
      latest_invoice: 'in_1',
      items: {
        data: [
          {
            current_period_start: 100,
            current_period_end: 200,
            price: {
              id: 'price_1',
              metadata: { analysis_credits: '2000' },
              product: { id: 'prod_1', deleted: false, metadata: {} },
            },
          },
        ],
      },
    });

    const baseInvoice = {
      id: 'in_1',
      customer: 'cus_1',
      subscription: 'sub_1',
      parent: { subscription_details: { subscription: 'sub_1' } },
    };

    await expect(
      normalizeWebhookEvent(
        {
          id: 'evt_create',
          type: 'invoice.paid',
          created: 1,
          livemode: false,
          data: {
            object: { ...baseInvoice, billing_reason: 'subscription_create' },
          },
        } as unknown as Stripe.Event,
        stripe,
      ),
    ).resolves.toMatchObject({
      creditGrant: {
        grantKind: 'create',
        expireBeforeGrant: false,
        credits: 2000,
      },
    });

    await expect(
      normalizeWebhookEvent(
        {
          id: 'evt_cycle',
          type: 'invoice.paid',
          created: 1,
          livemode: false,
          data: {
            object: { ...baseInvoice, billing_reason: 'subscription_cycle' },
          },
        } as unknown as Stripe.Event,
        stripe,
      ),
    ).resolves.toMatchObject({
      creditGrant: {
        grantKind: 'cycle',
        expireBeforeGrant: true,
        credits: 2000,
      },
    });

    await expect(
      normalizeWebhookEvent(
        {
          id: 'evt_update',
          type: 'invoice.paid',
          created: 1,
          livemode: false,
          data: {
            object: { ...baseInvoice, billing_reason: 'subscription_update' },
          },
        } as unknown as Stripe.Event,
        stripe,
      ),
    ).resolves.toMatchObject({
      creditGrant: {
        grantKind: 'upgrade_delta',
        expireBeforeGrant: false,
        credits: 2000,
      },
    });
  });

  it('treats cancel_at as scheduled cancel-at-period-end', async () => {
    const scheduled = await normalizeWebhookEvent(
      {
        id: 'evt_cancel_at',
        type: 'customer.subscription.updated',
        created: 1,
        livemode: false,
        data: {
          object: {
            id: 'sub_1',
            customer: 'cus_1',
            status: 'active',
            cancel_at_period_end: false,
            cancel_at: 200,
            canceled_at: 150,
            latest_invoice: null,
            items: {
              data: [
                {
                  current_period_start: 100,
                  current_period_end: 200,
                  price: { id: 'price_1' },
                },
              ],
            },
          },
        },
      } as unknown as Stripe.Event,
      stripe,
    );
    expect(scheduled).toMatchObject({
      subscription: {
        status: 'active',
        cancelAtPeriodEnd: true,
        currentPeriodEnd: 200,
      },
    });
    expect(scheduled.expirePeriod).toBeFalsy();
  });

  it('grants upgrade deltas when portal changes price without invoice.paid', async () => {
    stripe.prices.retrieve = vi.fn().mockResolvedValue({
      id: 'price_growth',
      metadata: { analysis_credits: '5000' },
      product: { id: 'prod_growth', deleted: false, metadata: {} },
    });

    const upgraded = await normalizeWebhookEvent(
      {
        id: 'evt_upgrade_items',
        type: 'customer.subscription.updated',
        created: 1,
        livemode: false,
        data: {
          object: {
            id: 'sub_1',
            customer: 'cus_1',
            status: 'active',
            cancel_at_period_end: false,
            latest_invoice: 'in_old',
            items: {
              data: [
                {
                  current_period_start: 100,
                  current_period_end: 200,
                  price: { id: 'price_growth' },
                },
              ],
            },
          },
          previous_attributes: {
            items: {
              data: [{ id: 'si_1', price: { id: 'price_starter' } }],
            },
          },
        },
      } as unknown as Stripe.Event,
      stripe,
    );

    expect(upgraded.creditGrant).toMatchObject({
      grantKind: 'upgrade_delta',
      credits: 5000,
      priceId: 'price_growth',
      expireBeforeGrant: false,
      invoiceId: 'subupd:sub_1:price_growth:200',
    });
    expect(upgraded.expirePeriod).toBeFalsy();
  });

  it('marks canceled subscriptions for period expiry and builds refund clawbacks', async () => {
    await expect(
      normalizeWebhookEvent(
        {
          id: 'evt_canceled',
          type: 'customer.subscription.updated',
          created: 1,
          livemode: false,
          data: {
            object: {
              id: 'sub_1',
              customer: 'cus_1',
              status: 'canceled',
              cancel_at_period_end: false,
              latest_invoice: null,
              items: { data: [{ price: { id: 'price_1' } }] },
            },
          },
        } as unknown as Stripe.Event,
        stripe,
      ),
    ).resolves.toMatchObject({
      expirePeriod: true,
      subscription: { status: 'canceled' },
    });

    const pastDue = await normalizeWebhookEvent(
      {
        id: 'evt_past_due',
        type: 'customer.subscription.updated',
        created: 1,
        livemode: false,
        data: {
          object: {
            id: 'sub_1',
            customer: 'cus_1',
            status: 'past_due',
            cancel_at_period_end: false,
            latest_invoice: null,
            items: { data: [{ price: { id: 'price_1' } }] },
          },
        },
      } as unknown as Stripe.Event,
      stripe,
    );
    expect(pastDue.subscription?.status).toBe('past_due');
    expect(pastDue.expirePeriod).toBeFalsy();

    await expect(
      normalizeWebhookEvent(
        {
          id: 'evt_refund',
          type: 'charge.refunded',
          created: 1,
          livemode: false,
          data: {
            object: {
              id: 'ch_1',
              customer: 'cus_1',
              invoice: 'in_1',
              amount: 2000,
              amount_refunded: 1000,
            },
          },
        } as unknown as Stripe.Event,
        stripe,
      ),
    ).resolves.toMatchObject({
      creditClawback: {
        chargeId: 'ch_1',
        amountRefunded: 1000,
        amountPaid: 2000,
        reason: 'refund',
      },
    });
  });
});
