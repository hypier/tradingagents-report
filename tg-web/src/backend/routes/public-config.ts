import { Hono } from 'hono';
import { z } from 'zod';

import type { AppDependencies } from '../app';
import type { RequestIdEnvironment } from '../logging/request-id';
import { apiSuccess } from '../../shared/contracts';
import { resolveCreditUnits } from '../../shared/analysis-credits';
import { PRODUCT_MARKET_CATALOG } from '../../shared/product-markets';

export function publicConfigRoutes(dependencies: AppDependencies) {
  const app = new Hono<RequestIdEnvironment>();

  app.get('/public-config', async (context) => {
    const [settingsRaw, markets, creditRules] = await Promise.all([
      dependencies.database.settings.getAll().catch(() => ({})),
      dependencies.database.markets
        .list({ enabledOnly: true })
        .catch(() => []),
      dependencies.database.creditRules.listEnabled().catch(() => []),
    ]);
    const settings = settingsRaw as Record<string, Record<string, unknown>>;

    const maintenance = asRecord(settings.maintenance);
    const features = asRecord(settings.features);
    const disclaimer = asRecord(settings.disclaimer);
    const enabledMarkets =
      markets.length > 0
        ? markets.map((row) => ({
            code: row.code,
            displayName: row.displayName,
            timezone: row.timezone,
            currency: row.currency,
            sessionNotes: row.sessionNotes,
          }))
        : PRODUCT_MARKET_CATALOG.filter((row) => row.enabled).map((row) => ({
            code: row.code,
            displayName: row.displayName,
            timezone: row.timezone,
            currency: row.currency,
            sessionNotes: row.sessionNotes,
          }));

    return context.json(
      apiSuccess(
        {
          clerkPublishableKey: dependencies.clerkPublishableKey,
          maintenance: {
            enabled: Boolean(maintenance.enabled),
            message: {
              en:
                typeof asRecord(maintenance.message).en === 'string'
                  ? String(asRecord(maintenance.message).en)
                  : '',
              zh:
                typeof asRecord(maintenance.message).zh === 'string'
                  ? String(asRecord(maintenance.message).zh)
                  : '',
            },
          },
          features: {
            watchlist: features.watchlist !== false,
          },
          markets: enabledMarkets,
          disclaimerMarkdown: {
            en:
              typeof asRecord(disclaimer.markdown).en === 'string'
                ? String(asRecord(disclaimer.markdown).en)
                : null,
            zh:
              typeof asRecord(disclaimer.markdown).zh === 'string'
                ? String(asRecord(disclaimer.markdown).zh)
                : null,
          },
          creditRules: creditRules.map((rule) => ({
            market: rule.market,
            minAnalysts: rule.minAnalysts,
            maxAnalysts: rule.maxAnalysts,
            units: rule.units,
            priority: rule.priority,
          })),
        },
        context.get('requestId'),
      ),
    );
  });

  app.get('/credit-estimate', async (context) => {
    const input = z
      .object({
        market: z.string().trim().min(1).max(16).optional(),
        analysts: z.coerce.number().int().min(1).max(20).default(4),
      })
      .safeParse(context.req.query());
    if (!input.success) {
      return context.json(
        apiSuccess({ units: 1 }, context.get('requestId')),
      );
    }
    const rules = await dependencies.database.creditRules
      .listEnabled()
      .catch(() => []);
    return context.json(
      apiSuccess(
        {
          units: resolveCreditUnits(
            {
              market: input.data.market ?? null,
              analystCount: input.data.analysts,
            },
            rules,
          ),
        },
        context.get('requestId'),
      ),
    );
  });

  return app;
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)
    : {};
}
