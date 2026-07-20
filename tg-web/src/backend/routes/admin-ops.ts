import { Hono } from 'hono';
import { z } from 'zod';

import { apiSuccess } from '../../shared/contracts';
import type { AppDependencies, AppEnvironment } from '../app';
import { AppError } from '../errors/app-error';

const settingsPatchSchema = z.object({
  maintenance: z
    .object({
      enabled: z.boolean(),
      message: z.object({
        en: z.string().max(2000),
        zh: z.string().max(2000),
      }),
    })
    .optional(),
  features: z
    .object({
      watchlist: z.boolean(),
      shareLinks: z.boolean(),
    })
    .optional(),
  disclaimer: z
    .object({
      version: z.string().trim().min(1).max(64).nullable(),
      markdown: z.object({
        en: z.string().max(50_000).nullable(),
        zh: z.string().max(50_000).nullable(),
      }),
    })
    .optional(),
  alerts: z
    .object({
      webhookUrl: z.string().trim().max(2000),
    })
    .optional(),
});

const marketUpsertSchema = z.object({
  code: z.string().trim().min(1).max(16),
  enabled: z.boolean(),
  displayName: z.string().trim().min(1).max(100),
  timezone: z.string().trim().min(1).max(64),
  currency: z.string().trim().min(1).max(16),
  sessionNotes: z.string().trim().max(2000).nullable().optional(),
  disclaimer: z.string().trim().max(5000).nullable().optional(),
  sortOrder: z.number().int().min(0).max(10_000),
});

const creditRuleSchema = z.object({
  label: z.string().trim().min(1).max(120),
  market: z.string().trim().min(1).max(16).nullable(),
  minAnalysts: z.number().int().min(1).max(20),
  maxAnalysts: z.number().int().min(1).max(20),
  units: z.number().int().min(0).max(100),
  enabled: z.boolean(),
  priority: z.number().int().min(0).max(10_000),
});

const auditQuerySchema = z.object({
  action: z.string().trim().min(1).max(100).optional(),
  actor: z.string().trim().min(1).optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export function adminOpsRoutes(dependencies: AppDependencies) {
  const app = new Hono<AppEnvironment>();

  app.get('/admin/settings', async (context) => {
    return context.json(
      apiSuccess(
        await dependencies.database.settings.getAll(),
        context.get('requestId'),
      ),
    );
  });

  app.patch('/admin/settings', async (context) => {
    const input = settingsPatchSchema.safeParse(
      await context.req.json().catch(() => null),
    );
    if (!input.success) {
      throw new AppError('INVALID_REQUEST', 400, 'Invalid settings payload');
    }
    const actor = context.get('auth').userId;
    const entries = Object.entries(input.data)
      .filter(([, value]) => value !== undefined)
      .map(([key, value]) => ({
        key,
        value: value as Record<string, unknown>,
      }));
    if (!entries.length) {
      throw new AppError('INVALID_REQUEST', 400, 'No settings to update');
    }
    const settings = await dependencies.database.settings.setMany(
      entries,
      actor,
    );
    await dependencies.database.audit.record({
      actorClerkUserId: actor,
      action: 'settings.update',
      targetType: 'product_settings',
      targetId: entries.map((entry) => entry.key).join(','),
      metadata: { keys: entries.map((entry) => entry.key) },
    });
    return context.json(apiSuccess(settings, context.get('requestId')));
  });

  app.get('/admin/markets', async (context) => {
    return context.json(
      apiSuccess(
        await dependencies.database.markets.list(),
        context.get('requestId'),
      ),
    );
  });

  app.put('/admin/markets/:code', async (context) => {
    const body = await context.req.json().catch(() => null);
    const input = marketUpsertSchema.safeParse({
      ...(isRecord(body) ? body : {}),
      code: context.req.param('code'),
    });
    if (!input.success) {
      throw new AppError('INVALID_REQUEST', 400, 'Invalid market payload');
    }
    const market = await dependencies.database.markets.upsert(input.data);
    await dependencies.database.audit.record({
      actorClerkUserId: context.get('auth').userId,
      action: 'markets.upsert',
      targetType: 'market',
      targetId: market.code,
      metadata: { enabled: Boolean(market.enabled) },
    });
    return context.json(apiSuccess(market, context.get('requestId')));
  });

  app.get('/admin/credit-rules', async (context) => {
    return context.json(
      apiSuccess(
        await dependencies.database.creditRules.list(),
        context.get('requestId'),
      ),
    );
  });

  app.post('/admin/credit-rules', async (context) => {
    const input = creditRuleSchema.safeParse(
      await context.req.json().catch(() => null),
    );
    if (!input.success) {
      throw new AppError('INVALID_REQUEST', 400, 'Invalid credit rule');
    }
    if (input.data.minAnalysts > input.data.maxAnalysts) {
      throw new AppError(
        'INVALID_REQUEST',
        400,
        'minAnalysts cannot exceed maxAnalysts',
      );
    }
    const rule = await dependencies.database.creditRules.create(input.data);
    await dependencies.database.audit.record({
      actorClerkUserId: context.get('auth').userId,
      action: 'credit_rules.create',
      targetType: 'credit_rule',
      targetId: rule.id,
      metadata: { units: rule.units, market: rule.market },
    });
    return context.json(apiSuccess(rule, context.get('requestId')), 201);
  });

  app.patch('/admin/credit-rules/:id', async (context) => {
    const input = creditRuleSchema.partial().safeParse(
      await context.req.json().catch(() => null),
    );
    if (!input.success) {
      throw new AppError('INVALID_REQUEST', 400, 'Invalid credit rule patch');
    }
    const rule = await dependencies.database.creditRules.update(
      context.req.param('id'),
      input.data,
    );
    if (!rule) {
      throw new AppError('NOT_FOUND', 404, 'Credit rule not found');
    }
    await dependencies.database.audit.record({
      actorClerkUserId: context.get('auth').userId,
      action: 'credit_rules.update',
      targetType: 'credit_rule',
      targetId: rule.id,
    });
    return context.json(apiSuccess(rule, context.get('requestId')));
  });

  app.delete('/admin/credit-rules/:id', async (context) => {
    const id = context.req.param('id');
    const deleted = await dependencies.database.creditRules.delete(id);
    if (!deleted) {
      throw new AppError('NOT_FOUND', 404, 'Credit rule not found');
    }
    await dependencies.database.audit.record({
      actorClerkUserId: context.get('auth').userId,
      action: 'credit_rules.delete',
      targetType: 'credit_rule',
      targetId: id,
    });
    return context.json(apiSuccess({ id }, context.get('requestId')));
  });

  app.get('/admin/models', async (context) => {
    const [prices, sources] = await Promise.all([
      dependencies.database.modelPrices.list({}),
      dependencies.database.pricingSources.list(),
    ]);
    return context.json(
      apiSuccess(
        {
          prices: prices.map((row) => ({
            provider: row.provider,
            model: row.model,
            billingMode: row.billingMode,
            contextTier: row.contextTier,
            currency: row.currency,
            unitTokens: row.unitTokens,
            inputPrice: row.inputPrice,
            outputPrice: row.outputPrice,
            sourceUrl: row.sourceUrl,
            updatedAt: row.updatedAt,
          })),
          sources: sources.map((row) => ({
            sourceUrl: row.sourceUrl,
            updateIntervalSeconds: row.updateIntervalSeconds,
            lastCheckedAt: row.lastCheckedAt,
            lastSuccessAt: row.lastSuccessAt,
            lastError: row.lastError,
            modelCount: row.modelCount,
            updatedAt: row.updatedAt,
          })),
        },
        context.get('requestId'),
      ),
    );
  });

  app.get('/admin/datasources', async (context) => {
    const checks = await Promise.all([
      probe('database', () => dependencies.database.healthcheck()),
      probe('cache', () => dependencies.cache.healthcheck()),
      probe('core', () => dependencies.core.healthcheck()),
    ]);
    const sources = await dependencies.database.pricingSources
      .list()
      .catch(() => []);
    return context.json(
      apiSuccess(
        {
          dependencies: checks,
          vendors: [
            {
              id: 'tradingview',
              label: 'TradingView market data',
              status: 'configured',
            },
            {
              id: 'core',
              label: 'Analysis core',
              status:
                checks.find((item) => item.id === 'core')?.ok ?? false
                  ? 'healthy'
                  : 'unhealthy',
            },
            {
              id: 'llm_pricing',
              label: 'LLM pricing sources',
              status: sources.some((row) => row.lastError)
                ? 'degraded'
                : 'healthy',
              errors: sources
                .filter((row) => row.lastError)
                .map((row) => ({
                  sourceUrl: row.sourceUrl,
                  error: row.lastError,
                })),
            },
          ],
        },
        context.get('requestId'),
      ),
    );
  });

  app.get('/admin/audit', async (context) => {
    const input = auditQuerySchema.safeParse(context.req.query());
    if (!input.success) {
      throw new AppError('INVALID_REQUEST', 400, 'Invalid audit query');
    }
    const rows = await dependencies.database.audit.list({
      action: input.data.action,
      actorClerkUserId: input.data.actor,
      from: input.data.from ? new Date(input.data.from) : undefined,
      to: input.data.to ? new Date(input.data.to) : undefined,
      limit: input.data.limit,
      offset: input.data.offset,
    });
    return context.json(apiSuccess(rows, context.get('requestId')));
  });

  return app;
}

async function probe(id: string, check: () => Promise<void>) {
  try {
    await check();
    return { id, ok: true as const, error: null };
  } catch (error) {
    return {
      id,
      ok: false as const,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
