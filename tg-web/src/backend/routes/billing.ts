import { Hono } from 'hono';
import { z } from 'zod';

import { apiSuccess } from '../../shared/contracts';
import type { AppDependencies, AppEnvironment } from '../app';
import { BillingServiceError } from '../billing/contract';
import { AppError } from '../errors/app-error';

const checkoutSchema = z.object({
  priceId: z
    .string()
    .trim()
    .regex(/^price_[A-Za-z0-9]+$/),
  requestId: z.string().uuid(),
  locale: z.enum(['en', 'zh']),
});

const billingLocaleSchema = z.object({
  locale: z.enum(['en', 'zh']),
});

const priceIdSchema = z
  .string()
  .trim()
  .regex(/^price_[A-Za-z0-9]+$/);

const createPlanSchema = z.object({
  name: z.string().trim().min(1).max(100),
  description: z.string().trim().max(500).optional(),
  unitAmount: z.number().int().min(50).max(100_000_000),
  currency: z.enum(['usd', 'cny', 'hkd', 'eur']),
  interval: z.enum(['month', 'year']),
  analysisCredits: z.number().int().min(1).max(100_000),
  supportedMarkets: z
    .array(z.enum(['US', 'HK', 'CN', 'CRYPTO']))
    .min(1)
    .max(4),
  features: z
    .array(z.string().trim().min(1).max(80))
    .min(1)
    .max(20)
    .refine(
      (features) => JSON.stringify(features).length <= 500,
      'Stripe feature metadata is too long',
    ),
});

const stripeConfigurationSchema = z.object({
  secretKey: z
    .string()
    .trim()
    .regex(/^sk_(test|live)_[A-Za-z0-9_]+$/)
    .min(16)
    .max(256),
  webhookSecret: z
    .string()
    .trim()
    .regex(/^whsec_[A-Za-z0-9_]+$/)
    .min(16)
    .max(256),
});

const positiveDecimal = (maximumFractionDigits: number) =>
  z
    .string()
    .trim()
    .regex(
      new RegExp(`^(?:0|[1-9]\\d*)(?:\\.\\d{1,${maximumFractionDigits}})?$`),
    )
    .refine((value) => Number(value) > 0 && Number(value) <= 1_000_000);

const nonNegativeDecimal = (maximumFractionDigits: number) =>
  z
    .string()
    .trim()
    .regex(
      new RegExp(`^(?:0|[1-9]\\d*)(?:\\.\\d{1,${maximumFractionDigits}})?$`),
    )
    .refine((value) => Number(value) <= 1_000_000);

const creditSettingsSchema = z.object({
  pointsPerUsd: positiveDecimal(6),
  markupBasisPoints: z.number().int().min(0).max(100_000),
  reserveBufferBasisPoints: z.number().int().min(0).max(100_000),
  defaultEstimatedCostUsd: positiveDecimal(8),
  signupGrantUsd: nonNegativeDecimal(2),
  referralRewardUsd: nonNegativeDecimal(2),
});

export function billingRoutes(dependencies: AppDependencies) {
  const app = new Hono<AppEnvironment>();

  app.get('/billing/overview', async (context) => {
    const session = context.get('auth');
    const localCustomerId =
      await dependencies.database.billing.getStripeCustomerId(session.userId);
    const identity = await dependencies.auth.getBillingIdentity(session.userId);
    const [overview, usage] = await Promise.all([
      callBilling(() =>
        dependencies.billing.getOverview(
          localCustomerId ?? identity.stripeCustomerId,
        ),
      ),
      dependencies.database.billing.getUsage(session.userId),
    ]);
    return context.json(
      apiSuccess(
        {
          ...overview,
          usage: {
            availableCredits: usage.availableCredits,
            reservedCredits: usage.reservedCredits,
            spentCredits: usage.spentCredits,
            periodEnd: usage.subscription?.currentPeriodEnd
              ? Math.floor(usage.subscription.currentPeriodEnd.getTime() / 1000)
              : null,
            ledger: usage.ledger,
          },
        },
        context.get('requestId'),
      ),
    );
  });

  app.post('/billing/checkout', async (context) => {
    const body = await context.req.json().catch(() => null);
    const input = checkoutSchema.safeParse(body);
    if (!input.success) {
      throw new AppError('INVALID_REQUEST', 400, 'Invalid subscription plan');
    }

    const customerId = await ensureCustomer(
      dependencies,
      context.get('auth').userId,
    );
    const url = await callBilling(() =>
      dependencies.billing.createCheckout(
        customerId,
        input.data.priceId,
        input.data.requestId,
        input.data.locale,
      ),
    );
    return context.json(apiSuccess({ url }, context.get('requestId')));
  });

  app.post('/billing/portal', async (context) => {
    const input = billingLocaleSchema.safeParse(
      await context.req.json().catch(() => null),
    );
    if (!input.success) {
      throw new AppError('INVALID_REQUEST', 400, 'Invalid billing locale');
    }
    const customerId = await ensureCustomer(
      dependencies,
      context.get('auth').userId,
    );
    const url = await callBilling(() =>
      dependencies.billing.createPortal(customerId, input.data.locale),
    );
    return context.json(apiSuccess({ url }, context.get('requestId')));
  });

  app.get('/admin/billing/settings', async (context) => {
    const settings = await callBilling(() =>
      dependencies.billing.getSettings(),
    );
    return context.json(apiSuccess(settings, context.get('requestId')));
  });

  app.get('/admin/billing/credit-settings', async (context) => {
    return context.json(
      apiSuccess(
        await dependencies.database.billing.getCreditSettings(),
        context.get('requestId'),
      ),
    );
  });

  app.put('/admin/billing/credit-settings', async (context) => {
    const input = creditSettingsSchema.safeParse(
      await context.req.json().catch(() => null),
    );
    if (!input.success) {
      throw new AppError(
        'INVALID_CREDIT_SETTINGS',
        400,
        'Invalid credit billing settings',
      );
    }
    const settings = await dependencies.database.billing.updateCreditSettings({
      ...input.data,
      actorClerkUserId: context.get('auth').userId,
    });
    return context.json(apiSuccess(settings, context.get('requestId')));
  });

  app.post('/admin/billing/configuration', async (context) => {
    const input = stripeConfigurationSchema.safeParse(
      await context.req.json().catch(() => null),
    );
    if (!input.success) {
      throw new AppError(
        'INVALID_STRIPE_CONFIGURATION',
        400,
        'Invalid Stripe payment configuration',
      );
    }
    const settings = await callBilling(() =>
      dependencies.billing.updateConfiguration({
        ...input.data,
        actorClerkUserId: context.get('auth').userId,
      }),
    );
    return context.json(apiSuccess(settings, context.get('requestId')));
  });

  app.post('/admin/billing/configuration/clear', async (context) => {
    const settings = await callBilling(() =>
      dependencies.billing.clearConfiguration(context.get('auth').userId),
    );
    return context.json(apiSuccess(settings, context.get('requestId')));
  });

  app.post('/admin/billing/plans', async (context) => {
    const body = await context.req.json().catch(() => null);
    const input = createPlanSchema.safeParse(body);
    if (!input.success) {
      throw new AppError('INVALID_REQUEST', 400, 'Invalid billing plan');
    }
    const plan = await callBilling(() =>
      dependencies.billing.createPlan(input.data),
    );
    return context.json(apiSuccess(plan, context.get('requestId')), 201);
  });

  app.post('/admin/billing/plans/defaults', async (context) => {
    const plans = await callBilling(() =>
      dependencies.billing.provisionDefaultPlans(),
    );
    return context.json(apiSuccess(plans, context.get('requestId')));
  });

  app.post('/admin/billing/plans/:priceId/archive', async (context) => {
    const input = priceIdSchema.safeParse(context.req.param('priceId'));
    if (!input.success) {
      throw new AppError('INVALID_REQUEST', 400, 'Invalid Stripe price ID');
    }
    await callBilling(() => dependencies.billing.archivePlan(input.data));
    return context.json(
      apiSuccess({ archived: true as const }, context.get('requestId')),
    );
  });

  return app;
}

export function stripeWebhookRoutes(dependencies: AppDependencies) {
  const app = new Hono<AppEnvironment>();

  app.post('/stripe/webhook', async (context) => {
    const signature = context.req.header('stripe-signature');
    if (!signature) {
      throw new AppError(
        'MISSING_STRIPE_SIGNATURE',
        400,
        'Stripe signature is required',
      );
    }

    const payload = await context.req.raw.clone().text();
    const event = await callBilling(() =>
      dependencies.billing.handleWebhook(payload, signature),
    );
    try {
      await dependencies.database.billing.processStripeEvent(event);
    } catch (error) {
      await dependencies.database.billing.recordStripeFailure(event, error);
      throw new AppError(
        'STRIPE_WEBHOOK_PROCESSING_FAILED',
        500,
        'Stripe webhook processing failed',
        error,
      );
    }
    dependencies.logger.info('Stripe webhook accepted', {
      stripeEventId: event.id,
      stripeEventType: event.type,
      requestId: context.get('requestId'),
    });
    return context.json(
      apiSuccess({ received: true as const }, context.get('requestId')),
    );
  });

  return app;
}

async function ensureCustomer(
  dependencies: AppDependencies,
  userId: string,
): Promise<string> {
  const identity = await dependencies.auth.getBillingIdentity(userId);
  const localCustomerId =
    await dependencies.database.billing.getStripeCustomerId(userId);
  if (localCustomerId ?? identity.stripeCustomerId) {
    const customerId = localCustomerId ?? identity.stripeCustomerId!;
    if (!localCustomerId) {
      await dependencies.database.billing.setStripeCustomerId(
        userId,
        customerId,
      );
    }
    return customerId;
  }

  const customerId = await callBilling(() =>
    dependencies.billing.createCustomer({
      clerkUserId: userId,
      email: identity.user.email,
      displayName: identity.user.displayName,
    }),
  );
  await dependencies.auth.setStripeCustomerId(userId, customerId);
  await dependencies.database.billing.setStripeCustomerId(userId, customerId);
  return customerId;
}

async function callBilling<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof BillingServiceError) {
      throw new AppError(error.code, error.status, error.publicMessage, error);
    }
    throw new AppError(
      'STRIPE_REQUEST_FAILED',
      502,
      'Stripe billing request failed',
      error,
    );
  }
}
