import { Hono } from 'hono';

import type { AppDependencies } from '../app';
import type { RequestIdEnvironment } from '../logging/request-id';
import { apiSuccess } from '../../shared/contracts';
import {
  DEFAULT_ANALYSIS_EXCHANGE_SEEDS,
  defaultDisplayNameForExchange,
  getExchangeCatalogEntry,
  suggestMarket,
} from '../../shared/exchange-catalog';

export function publicConfigRoutes(dependencies: AppDependencies) {
  const app = new Hono<RequestIdEnvironment>();

  app.get('/public-config', async (context) => {
    const [settingsRaw, exchanges] = await Promise.all([
      dependencies.database.settings.getAll().catch(() => ({})),
      dependencies.database.analysisExchanges
        .list({ enabledOnly: true })
        .catch(() => []),
    ]);
    const settings = settingsRaw as Record<string, Record<string, unknown>>;

    const maintenance = asRecord(settings.maintenance);
    const features = asRecord(settings.features);
    const disclaimer = asRecord(settings.disclaimer);
    const enabledExchanges =
      exchanges.length > 0
        ? exchanges.map((row) => ({
            exchange: row.exchange,
            displayName: row.displayName,
            market: row.market,
          }))
        : DEFAULT_ANALYSIS_EXCHANGE_SEEDS.map((exchange) => {
            const catalog = getExchangeCatalogEntry(exchange);
            return {
              exchange,
              displayName: defaultDisplayNameForExchange(exchange),
              market: suggestMarket(catalog?.country, {
                group: catalog?.group,
              }),
            };
          });

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
          exchanges: enabledExchanges,
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
