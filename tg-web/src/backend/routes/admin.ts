import { Hono } from 'hono';
import { z } from 'zod';

import { apiSuccess } from '../../shared/contracts';
import type { AppDependencies, AppEnvironment } from '../app';
import { BillingRepositoryError } from '../database/billing-repository';
import { AppError } from '../errors/app-error';
import type { AnalysisJob } from '../database/repositories';
import { adminLlmRoutes } from './admin-llm';
import { adminOpsRoutes } from './admin-ops';

const listUsersSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
  query: z.string().trim().min(1).max(100).optional(),
});

const updateRoleSchema = z.object({
  role: z.enum(['user', 'admin']),
});

const banSchema = z.object({
  banned: z.boolean(),
});

const adjustCreditsSchema = z.object({
  clerkUserId: z.string().trim().min(1),
  delta: z.number().int().refine((value) => value !== 0),
  reason: z.string().trim().min(1).max(500),
  idempotencyKey: z.string().uuid(),
});

const creditAdjustmentSchema = z.object({
  adjustmentId: z.string().uuid(),
  delta: z
    .number()
    .int()
    .min(-1_000_000)
    .max(1_000_000)
    .refine((value) => value !== 0),
  reason: z.string().trim().max(500).optional(),
});

const listAnalysesSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
  status: z.enum(['queued', 'running', 'succeeded', 'failed']).optional(),
  ticker: z.string().trim().min(1).max(32).optional(),
  clerkUserId: z.string().trim().min(1).optional(),
});

const overviewSchema = z.object({
  days: z.coerce.number().int().min(1).max(90).default(30),
});

export function adminRoutes(dependencies: AppDependencies) {
  const app = new Hono<AppEnvironment>();
  app.route('/', adminOpsRoutes(dependencies));
  app.route('/', adminLlmRoutes(dependencies));

  app.get('/admin/overview', async (context) => {
    const input = overviewSchema.safeParse(context.req.query());
    if (!input.success) {
      throw new AppError('INVALID_REQUEST', 400, 'Invalid overview query');
    }
    const to = new Date();
    const from = new Date(to.getTime() - input.data.days * 24 * 60 * 60 * 1000);
    const [metrics, webhookSummary] = await Promise.all([
      dependencies.database.analysisJobs.getAdminOverview({ from, to }),
      dependencies.database.billing.summarizeStripeWebhookEvents({ from, to }),
    ]);
    let stripe: {
      configured: boolean;
      connectionHealthy: boolean | null;
      mode: string | null;
      period: {
        currency: string;
        revenueCents: number;
        refundCents: number;
        paymentFailureCount: number;
        webhookFailedCount: number;
      } | null;
    } | null = null;
    try {
      const [settings, periodSummary] = await Promise.all([
        dependencies.billing.getSettings(),
        dependencies.billing.getAdminPeriodSummary({ from, to }),
      ]);
      const emptyPeriod = {
        currency: 'USD',
        revenueCents: 0,
        refundCents: 0,
        paymentFailureCount: 0,
        webhookFailedCount: webhookSummary.failed,
      };
      stripe = {
        configured: settings.configured,
        connectionHealthy: settings.connectionHealthy,
        mode: settings.mode,
        period: periodSummary
          ? {
              ...periodSummary,
              webhookFailedCount: webhookSummary.failed,
            }
          : settings.configured || webhookSummary.failed > 0
            ? emptyPeriod
            : null,
      };
    } catch {
      stripe = {
        configured: false,
        connectionHealthy: false,
        mode: null,
        period:
          webhookSummary.failed > 0
            ? {
                currency: 'USD',
                revenueCents: 0,
                refundCents: 0,
                paymentFailureCount: 0,
                webhookFailedCount: webhookSummary.failed,
              }
            : null,
      };
    }
    return context.json(
      apiSuccess({ ...metrics, stripe }, context.get('requestId')),
    );
  });

  const stripeEventsSchema = z.object({
    status: z.enum(['processing', 'processed', 'failed', 'ignored']).optional(),
    eventType: z.string().trim().min(1).max(120).optional(),
    days: z.coerce.number().int().min(1).max(90).default(30),
    limit: z.coerce.number().int().min(1).max(200).default(50),
    offset: z.coerce.number().int().min(0).default(0),
  });

  app.get('/admin/stripe/events', async (context) => {
    const input = stripeEventsSchema.safeParse(context.req.query());
    if (!input.success) {
      throw new AppError('INVALID_REQUEST', 400, 'Invalid Stripe events query');
    }
    const to = new Date();
    const from = new Date(to.getTime() - input.data.days * 24 * 60 * 60 * 1000);
    const [events, summary] = await Promise.all([
      dependencies.database.billing.listStripeWebhookEvents({
        status: input.data.status,
        eventType: input.data.eventType,
        from,
        to,
        limit: input.data.limit,
        offset: input.data.offset,
      }),
      dependencies.database.billing.summarizeStripeWebhookEvents({ from, to }),
    ]);
    return context.json(
      apiSuccess(
        {
          days: input.data.days,
          summary,
          events: events.map((event) => ({
            stripeEventId: event.stripeEventId,
            eventType: event.eventType,
            status: event.status,
            error: event.error,
            receivedAt: event.receivedAt,
            processedAt: event.processedAt,
            livemode:
              typeof event.payload.livemode === 'boolean'
                ? event.payload.livemode
                : null,
            customerId: stripePayloadCustomerId(event.payload),
            subscriptionId: stripePayloadSubscriptionId(event.payload),
            invoiceId: stripePayloadInvoiceId(event.payload),
          })),
        },
        context.get('requestId'),
      ),
    );
  });

  app.get('/admin/users', async (context) => {
    const input = listUsersSchema.safeParse(context.req.query());
    if (!input.success) {
      throw new AppError('INVALID_REQUEST', 400, 'Invalid user list query');
    }

    const page = await dependencies.auth.listUsers(input.data);
    const balances = await dependencies.database.billing.getAvailableCredits(
      page.users.map((user) => user.id),
    );
    return context.json(
      apiSuccess(
        {
          ...page,
          users: page.users.map((user) => ({
            ...user,
            availableCredits: balances[user.id] ?? 0,
          })),
        },
        context.get('requestId'),
      ),
    );
  });

  app.get('/admin/users/:userId', async (context) => {
    const userId = context.req.param('userId');
    let user;
    try {
      user = await dependencies.auth.getManagedUser(userId);
    } catch {
      throw new AppError('NOT_FOUND', 404, 'User not found');
    }
    const [usage, jobs, profile] = await Promise.all([
      dependencies.database.billing.getUsage(userId),
      dependencies.database.analysisJobs.listForUser({
        clerkUserId: userId,
        limit: 20,
        offset: 0,
      }),
      dependencies.database.account.getProfile(userId).catch(() => null),
    ]);
    return context.json(
      apiSuccess(
        {
          user,
          profile,
          usage: {
            availableCredits: usage.availableCredits,
            periodCredits: usage.periodCredits,
            bonusCredits: usage.bonusCredits,
            reservedCredits: usage.reservedCredits,
            spentCredits: usage.spentCredits,
            periodEnd: usage.periodEnd,
            subscription: usage.subscription,
            ledger: usage.ledger.slice(0, 50),
          },
          recentJobs: jobs.map((row) =>
            toPublicJob(row.job, {
              clerkUserId: userId,
              creditUnits: row.creditUnits,
            }),
          ),
        },
        context.get('requestId'),
      ),
    );
  });

  app.patch('/admin/users/:userId/role', async (context) => {
    const body = await context.req.json().catch(() => null);
    const input = updateRoleSchema.safeParse(body);
    if (!input.success) {
      throw new AppError('INVALID_REQUEST', 400, 'Invalid user role');
    }

    const currentUser = context.get('authUser');
    const userId = context.req.param('userId');
    if (currentUser.id === userId && input.data.role !== 'admin') {
      throw new AppError(
        'SELF_DEMOTION_NOT_ALLOWED',
        409,
        'Administrators cannot remove their own access',
      );
    }

    const updated = await dependencies.auth.setUserRole(userId, input.data.role);
    await dependencies.database.audit.record({
      actorClerkUserId: currentUser.id,
      action: 'users.set_role',
      targetType: 'user',
      targetId: userId,
      metadata: { role: input.data.role },
    });
    return context.json(apiSuccess(updated, context.get('requestId')));
  });

  app.patch('/admin/users/:userId/ban', async (context) => {
    const body = await context.req.json().catch(() => null);
    const input = banSchema.safeParse(body);
    if (!input.success) {
      throw new AppError('INVALID_REQUEST', 400, 'Invalid ban payload');
    }
    const currentUser = context.get('authUser');
    const userId = context.req.param('userId');
    if (currentUser.id === userId && input.data.banned) {
      throw new AppError(
        'SELF_BAN_NOT_ALLOWED',
        409,
        'Administrators cannot ban their own account',
      );
    }
    const updated = await dependencies.auth.setUserBanned(
      userId,
      input.data.banned,
    );
    await dependencies.database.audit.record({
      actorClerkUserId: currentUser.id,
      action: input.data.banned ? 'users.ban' : 'users.unban',
      targetType: 'user',
      targetId: userId,
    });
    return context.json(apiSuccess(updated, context.get('requestId')));
  });

  app.post('/admin/credits/adjust', async (context) => {
    const input = adjustCreditsSchema.safeParse(
      await context.req.json().catch(() => null),
    );
    if (!input.success) {
      throw new AppError('INVALID_REQUEST', 400, 'Invalid credit adjustment');
    }
    try {
      await dependencies.auth.getManagedUser(input.data.clerkUserId);
    } catch {
      throw new AppError('NOT_FOUND', 404, 'User not found');
    }
    try {
      const availableCredits =
        await dependencies.database.billing.adjustCredits({
          adjustmentId: input.data.idempotencyKey,
          clerkUserId: input.data.clerkUserId,
          actorClerkUserId: context.get('auth').userId,
          delta: input.data.delta,
          reason: input.data.reason,
        });
      await dependencies.database.audit.record({
        actorClerkUserId: context.get('auth').userId,
        action: 'credits.adjust',
        targetType: 'user',
        targetId: input.data.clerkUserId,
        metadata: {
          delta: input.data.delta,
          reason: input.data.reason,
          idempotencyKey: input.data.idempotencyKey,
        },
      });
      const usage = await dependencies.database.billing.getUsage(
        input.data.clerkUserId,
      );
      return context.json(
        apiSuccess(
          {
            ...usage,
            availableCredits,
          },
          context.get('requestId'),
        ),
      );
    } catch (error) {
      throw billingError(error);
    }
  });

  app.post('/admin/users/:userId/credit-adjustments', async (context) => {
    const input = creditAdjustmentSchema.safeParse(
      await context.req.json().catch(() => null),
    );
    if (!input.success) {
      throw new AppError('INVALID_REQUEST', 400, 'Invalid credit adjustment');
    }
    const userId = context.req.param('userId');
    const user = await dependencies.auth.getUser(userId);
    await dependencies.database.account.syncUser(user);
    try {
      const availableCredits =
        await dependencies.database.billing.adjustCredits({
          ...input.data,
          clerkUserId: userId,
          actorClerkUserId: context.get('auth').userId,
        });
      await dependencies.database.audit.record({
        actorClerkUserId: context.get('auth').userId,
        action: 'credits.adjust',
        targetType: 'user',
        targetId: userId,
        metadata: {
          delta: input.data.delta,
          reason: input.data.reason ?? null,
          adjustmentId: input.data.adjustmentId,
        },
      });
      return context.json(
        apiSuccess({ availableCredits }, context.get('requestId')),
      );
    } catch (error) {
      throw billingError(error);
    }
  });

  app.get('/admin/analyses', async (context) => {
    const input = listAnalysesSchema.safeParse(context.req.query());
    if (!input.success) {
      throw new AppError('INVALID_REQUEST', 400, 'Invalid analysis list query');
    }
    const rows = await dependencies.database.analysisJobs.listAllForAdmin(
      input.data,
    );
    const profiles = await dependencies.database.account.listProfilesByIds(
      rows.map((row) => row.clerkUserId),
    );
    return context.json(
      apiSuccess(
        rows.map((row) =>
          toPublicJob(row.job, {
            clerkUserId: row.clerkUserId,
            creditUnits: row.creditUnits,
            user: profiles.get(row.clerkUserId) ?? null,
          }),
        ),
        context.get('requestId'),
      ),
    );
  });

  app.get('/admin/analyses/:id', async (context) => {
    const jobId = context.req.param('id');
    const job = await dependencies.database.analysisJobs.getById(jobId);
    if (!job) {
      throw new AppError('NOT_FOUND', 404, 'Analysis job not found');
    }
    const ownerId =
      job.clerkUserId ??
      (await dependencies.database.analysisJobs.getOwner(jobId));
    const profiles = ownerId
      ? await dependencies.database.account.listProfilesByIds([ownerId])
      : new Map();
    const creditByJobId =
      await dependencies.database.analysisJobs.getCreditUnitsByJobIds([jobId]);
    return context.json(
      apiSuccess(
        toAdminJobDetail(job, {
          clerkUserId: ownerId ?? undefined,
          creditUnits: creditByJobId.get(jobId) ?? null,
          user: ownerId ? (profiles.get(ownerId) ?? null) : null,
        }),
        context.get('requestId'),
      ),
    );
  });

  app.post('/admin/analyses/:id/retry', async (context) => {
    const jobId = context.req.param('id');
    const job = await dependencies.database.analysisJobs.getById(jobId);
    if (!job) {
      throw new AppError('NOT_FOUND', 404, 'Analysis job not found');
    }
    if (job.status !== 'failed') {
      throw new AppError(
        'RETRY_NOT_ALLOWED',
        409,
        'Only failed analysis jobs can be retried',
      );
    }
    const ownerId =
      await dependencies.database.analysisJobs.getOwner(jobId);
    if (!ownerId) {
      throw new AppError(
        'OWNER_NOT_FOUND',
        409,
        'Unable to resolve the owning user for this analysis',
      );
    }

    const request = isRecord(job.request) ? job.request : {};
    const config = isRecord(job.config) ? job.config : {};
    const instrument = isRecord(request.instrument)
      ? request.instrument
      : null;
    const display = isRecord(job.display) ? job.display : {};
    const analysts = Array.isArray(job.analysts)
      ? job.analysts.filter((value): value is string => typeof value === 'string')
      : [];
    const requestId = crypto.randomUUID();
    const configOverrides = {
      ...config,
      ...(typeof request.output_language === 'string'
        ? { output_language: request.output_language }
        : {}),
    };

    let pricing;
    try {
      ({ pricing } =
        await dependencies.database.billing.assertCanStartAnalysis({
          clerkUserId: ownerId,
        }));
    } catch (error) {
      throw billingError(error);
    }

    const normalizedInstrument =
      instrument &&
      typeof instrument.exchange === 'string' &&
      typeof instrument.symbol === 'string'
        ? {
            exchange: String(instrument.exchange).toUpperCase(),
            symbol: String(instrument.symbol).toUpperCase(),
            ...(typeof instrument.display_ticker === 'string'
              ? {
                  display_ticker: String(
                    instrument.display_ticker,
                  ).toUpperCase(),
                }
              : {}),
          }
        : undefined;
    const data = await dependencies.core.submitAnalysis({
      ...(normalizedInstrument
        ? {
            ticker: `${normalizedInstrument.exchange}:${normalizedInstrument.symbol}`,
            instrument: normalizedInstrument,
          }
        : { ticker: job.ticker }),
      trade_date: job.tradeDate,
      analysts,
      config_overrides: configOverrides,
      request_id: requestId,
      clerk_user_id: ownerId,
      credit_pricing: pricing,
      ...(Object.keys(display).length
        ? {
            display: {
              ...(typeof display.display_name === 'string'
                ? { display_name: display.display_name }
                : {}),
              ...(typeof display.logo_url === 'string'
                ? { logo_url: display.logo_url }
                : {}),
              ...(typeof display.country === 'string'
                ? { country: String(display.country).toUpperCase() }
                : {}),
            },
          }
        : {}),
    });

    const created = z
      .object({ id: z.string().uuid() })
      .passthrough()
      .safeParse(data);
    if (!created.success) {
      throw new AppError(
        'INVALID_CORE_RESPONSE',
        502,
        'Analysis service returned an invalid job response',
      );
    }

    await dependencies.database.audit.record({
      actorClerkUserId: context.get('auth').userId,
      action: 'analyses.retry',
      targetType: 'analysis_job',
      targetId: jobId,
      metadata: {
        newJobId: created.data.id,
        ownerUserId: ownerId,
        requestId,
      },
    });

    return context.json(
      apiSuccess(
        {
          originalJobId: jobId,
          job: created.data,
          ownerUserId: ownerId,
          requestId,
        },
        context.get('requestId'),
      ),
      202,
    );
  });

  return app;
}

function toPublicJob(
  job: AnalysisJob,
  extras: {
    clerkUserId?: string;
    creditUnits: number | null;
    user?: { displayName: string; avatarUrl: string; email: string | null } | null;
  },
) {
  const request = isRecord(job.request) ? job.request : {};
  const config = isRecord(job.config) ? job.config : {};
  const display = isRecord(job.display) ? job.display : {};
  return {
    id: job.id,
    request_id: job.requestId,
    ticker: job.ticker,
    exchange: job.exchange,
    trade_date: job.tradeDate,
    asset_type: job.assetType,
    analysts: job.analysts,
    status: job.status,
    decision: job.decision,
    error: job.error,
    progress_percent: job.progressPercent,
    current_step: job.currentStep,
    cost_usd: job.costUsd,
    display,
    output_language:
      (typeof request.output_language === 'string'
        ? request.output_language
        : null) ||
      (typeof config.output_language === 'string'
        ? config.output_language
        : null),
    created_at: job.createdAt,
    updated_at: job.updatedAt,
    started_at: job.startedAt,
    finished_at: job.finishedAt,
    credit_units: extras.creditUnits,
    ...(extras.clerkUserId ? { clerk_user_id: extras.clerkUserId } : {}),
    ...(extras.user
      ? {
          user: {
            display_name: extras.user.displayName,
            image_url: extras.user.avatarUrl,
            email: extras.user.email,
          },
        }
      : {}),
  };
}

/** Admin detail: list fields plus cost/token/config metadata; no final_state/reports. */
function toAdminJobDetail(
  job: AnalysisJob,
  extras: {
    clerkUserId?: string;
    creditUnits: number | null;
    user?: { displayName: string; avatarUrl: string; email: string | null } | null;
  },
) {
  const request = isRecord(job.request) ? job.request : {};
  const config = isRecord(job.config) ? job.config : {};
  return {
    ...toPublicJob(job, extras),
    tokens_used: job.tokensUsed,
    token_usage: isRecord(job.tokenUsage) ? job.tokenUsage : {},
    cost_breakdown: isRecord(job.costBreakdown) ? job.costBreakdown : {},
    credit_pricing: job.creditPricing,
    report_path: job.reportPath,
    request,
    config,
    events: Array.isArray(job.events) ? job.events : [],
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function billingError(error: unknown): AppError {
  if (error instanceof BillingRepositoryError) {
    const status =
      error.code === 'INSUFFICIENT_CREDITS' ||
      error.code === 'SUBSCRIPTION_REQUIRED'
        ? 402
        : error.code === 'IDEMPOTENCY_CONFLICT'
          ? 409
          : 400;
    return new AppError(error.code, status, error.message, error);
  }
  return new AppError(
    'CREDIT_OPERATION_FAILED',
    500,
    'Unable to complete the credit operation',
    error,
  );
}

function stripePayloadCustomerId(
  payload: Record<string, unknown>,
): string | null {
  const subscription = isRecord(payload.subscription)
    ? payload.subscription
    : null;
  const creditGrant = isRecord(payload.creditGrant)
    ? payload.creditGrant
    : null;
  return (
    stringOrNull(subscription?.customerId) ??
    stringOrNull(creditGrant?.customerId)
  );
}

function stripePayloadSubscriptionId(
  payload: Record<string, unknown>,
): string | null {
  const subscription = isRecord(payload.subscription)
    ? payload.subscription
    : null;
  const creditGrant = isRecord(payload.creditGrant)
    ? payload.creditGrant
    : null;
  return (
    stringOrNull(subscription?.id) ??
    stringOrNull(creditGrant?.subscriptionId)
  );
}

function stripePayloadInvoiceId(
  payload: Record<string, unknown>,
): string | null {
  const subscription = isRecord(payload.subscription)
    ? payload.subscription
    : null;
  const creditGrant = isRecord(payload.creditGrant)
    ? payload.creditGrant
    : null;
  return (
    stringOrNull(creditGrant?.invoiceId) ??
    stringOrNull(subscription?.latestInvoiceId)
  );
}

function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}
