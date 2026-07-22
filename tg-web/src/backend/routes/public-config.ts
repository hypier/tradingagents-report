import { Hono } from 'hono';

import type { AppDependencies } from '../app';
import type { RequestIdEnvironment } from '../logging/request-id';
import { apiSuccess } from '../../shared/contracts';
import { PRODUCT_MARKET_CATALOG } from '../../shared/product-markets';

export function publicConfigRoutes(dependencies: AppDependencies) {
  const app = new Hono<RequestIdEnvironment>();

  app.get('/public-config', async (context) => {
    const [settingsRaw, markets] = await Promise.all([
      dependencies.database.settings.getAll().catch(() => ({})),
      dependencies.database.markets
        .list({ enabledOnly: true })
        .catch(() => []),
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
          }))
        : PRODUCT_MARKET_CATALOG.filter((row) => row.enabled).map((row) => ({
            code: row.code,
            displayName: row.displayName,
            timezone: row.timezone,
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
