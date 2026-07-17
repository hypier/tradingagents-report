import { Hono } from 'hono';

import { createAnalysisSchema, apiSuccess } from '../../shared/contracts';
import type { AppDependencies } from '../app';
import type { RequestIdEnvironment } from '../logging/request-id';

export function analysisRoutes(dependencies: AppDependencies) {
  const app = new Hono<RequestIdEnvironment>();

  app.post('/analyses', async (context) => {
    const input = createAnalysisSchema.parse(await context.req.json());
    const data = await dependencies.core.submitAnalysis({
      ticker: input.ticker.toUpperCase(),
      trade_date: input.tradeDate,
      analysts: input.analysts,
      config_overrides: input.configOverrides,
    });
    return context.json(apiSuccess(data, context.get('requestId')), 202);
  });

  app.get('/analyses', async (context) => {
    const data = await dependencies.core.listAnalyses(
      new URLSearchParams(context.req.query()),
    );
    return context.json(apiSuccess(data, context.get('requestId')));
  });

  app.get('/analyses/:id', async (context) =>
    context.json(
      apiSuccess(
        await dependencies.core.getAnalysis(context.req.param('id')),
        context.get('requestId'),
      ),
    ),
  );

  app.get('/analyses/:id/events', async (context) =>
    context.json(
      apiSuccess(
        await dependencies.core.getAnalysisEvents(context.req.param('id')),
        context.get('requestId'),
      ),
    ),
  );

  app.get('/market-search', async (context) => {
    const query = context.req.query('q') ?? '';
    if (!query.trim()) {
      return context.json(
        {
          error: {
            code: 'VALIDATION_ERROR',
            message: 'q is required',
            requestId: context.get('requestId'),
          },
        },
        400,
      );
    }
    return context.json(
      apiSuccess(
        await dependencies.marketAssets.searchMarkets(query),
        context.get('requestId'),
      ),
    );
  });

  app.get('/market-snapshot', async (context) => {
    const providerSymbol =
      context.req.query('symbol') ?? context.req.query('ticker') ?? '';
    if (!providerSymbol.trim()) {
      return context.json(
        {
          error: {
            code: 'VALIDATION_ERROR',
            message: 'symbol is required',
            requestId: context.get('requestId'),
          },
        },
        400,
      );
    }
    return context.json(
      apiSuccess(
        await dependencies.marketAssets.getSnapshot(providerSymbol),
        context.get('requestId'),
      ),
    );
  });

  app.get('/market-identities', async (context) => {
    const tickers = [
      ...new Set(
        (context.req.queries('ticker') ?? [])
          .map((ticker) => ticker.trim().toUpperCase())
          .filter(Boolean),
      ),
    ];
    if (!tickers.length) {
      return context.json(
        {
          error: {
            code: 'VALIDATION_ERROR',
            message: 'ticker is required',
            requestId: context.get('requestId'),
          },
        },
        400,
      );
    }
    return context.json(
      apiSuccess(
        await dependencies.marketAssets.getIdentities(tickers),
        context.get('requestId'),
      ),
    );
  });

  return app;
}
