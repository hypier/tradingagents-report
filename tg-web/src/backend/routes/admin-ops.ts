import { Hono } from 'hono';
import { z } from 'zod';

import { apiSuccess } from '../../shared/contracts';
import {
  defaultDisplayNameForExchange,
  getExchangeCatalogEntry,
  listCatalogMarketCodes,
  suggestMarket,
} from '../../shared/exchange-catalog';
import { LLM_SETTINGS_KEY } from '../../shared/llm-providers';
import type { AppDependencies, AppEnvironment } from '../app';
import { AppError } from '../errors/app-error';
import { validateLlmDefaults } from '../llm/llm-defaults';

const CATALOG_MARKET_CODES = new Set(listCatalogMarketCodes());

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
  llm: z
    .object({
      defaultQuickModelId: z.string().uuid(),
      defaultDeepModelId: z.string().uuid(),
    })
    .optional(),
});

const exchangeUpsertSchema = z.object({
  exchange: z.string().trim().min(1).max(32),
  enabled: z.boolean(),
  displayName: z.string().trim().min(1).max(100),
  market: z
    .string()
    .trim()
    .toUpperCase()
    .max(16)
    .nullable()
    .optional()
    .transform((value) => {
      if (!value) return null;
      return CATALOG_MARKET_CODES.has(value) ? value : null;
    }),
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
    const patch = { ...input.data };
    if (patch.llm) {
      patch.llm = (await validateLlmDefaults(
        dependencies.database.llmCatalog,
        patch.llm,
      )) as typeof patch.llm;
    }
    const entries = Object.entries(patch)
      .filter(([, value]) => value !== undefined)
      .map(([key, value]) => ({
        key: key === 'llm' ? LLM_SETTINGS_KEY : key,
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
      targetType: 'system_settings',
      targetId: entries.map((entry) => entry.key).join(','),
      metadata: { keys: entries.map((entry) => entry.key) },
    });
    return context.json(apiSuccess(settings, context.get('requestId')));
  });

  app.get('/admin/markets', async (context) => {
    return context.json(
      apiSuccess(
        await dependencies.database.analysisExchanges.list(),
        context.get('requestId'),
      ),
    );
  });

  app.put('/admin/markets/:exchange', async (context) => {
    const body = await context.req.json().catch(() => null);
    const exchangeParam = context.req.param('exchange').trim().toUpperCase();
    const catalog = getExchangeCatalogEntry(exchangeParam);
    if (!catalog) {
      throw new AppError(
        'INVALID_REQUEST',
        400,
        'Exchange is not in the catalog',
      );
    }
    const input = exchangeUpsertSchema.safeParse({
      ...(isRecord(body) ? body : {}),
      exchange: exchangeParam,
      displayName:
        typeof (body as { displayName?: unknown } | null)?.displayName ===
        'string'
          ? (body as { displayName: string }).displayName
          : defaultDisplayNameForExchange(exchangeParam),
      market:
        (body as { market?: unknown } | null)?.market !== undefined
          ? (body as { market: unknown }).market
          : suggestMarket(catalog.country, { group: catalog.group }),
    });
    if (!input.success) {
      throw new AppError('INVALID_REQUEST', 400, 'Invalid exchange payload');
    }
    const row = await dependencies.database.analysisExchanges.upsert({
      exchange: input.data.exchange,
      enabled: input.data.enabled,
      displayName: input.data.displayName,
      market:
        input.data.market ??
        suggestMarket(catalog.country, { group: catalog.group }),
    });
    await dependencies.database.audit.record({
      actorClerkUserId: context.get('auth').userId,
      action: 'analysis_exchanges.upsert',
      targetType: 'analysis_exchange',
      targetId: row.exchange,
      metadata: { enabled: Boolean(row.enabled) },
    });
    return context.json(apiSuccess(row, context.get('requestId')));
  });

  app.delete('/admin/markets/:exchange', async (context) => {
    const exchange = context.req.param('exchange').trim().toUpperCase();
    const removed =
      await dependencies.database.analysisExchanges.remove(exchange);
    if (!removed) {
      throw new AppError('NOT_FOUND', 404, 'Exchange not configured');
    }
    await dependencies.database.audit.record({
      actorClerkUserId: context.get('auth').userId,
      action: 'analysis_exchanges.delete',
      targetType: 'analysis_exchange',
      targetId: exchange,
      metadata: {},
    });
    return context.json(apiSuccess({ exchange }, context.get('requestId')));
  });

  app.get('/admin/datasources', async (context) => {
    const checks = await Promise.all([
      probe('database', () => dependencies.database.healthcheck()),
      probe('cache', () => dependencies.cache.healthcheck()),
      probe('core', () => dependencies.core.healthcheck()),
    ]);
    const providers = await dependencies.database.llmCatalog
      .listProviders()
      .catch(() => []);
    const enabledWithoutKey = providers.filter(
      (row) => row.enabled && !row.apiKeyCiphertext,
    );
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
              id: 'llm_providers',
              label: 'LLM providers',
              status: enabledWithoutKey.length ? 'degraded' : 'healthy',
              errors: enabledWithoutKey.map((row) => ({
                providerId: row.id,
                error: 'Enabled provider is missing API key',
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
