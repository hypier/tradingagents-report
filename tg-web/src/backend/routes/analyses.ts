import { Hono } from 'hono';
import { z } from 'zod';

import { createAnalysisSchema, apiSuccess } from '../../shared/contracts';
import type { AppDependencies, AppEnvironment } from '../app';
import { AppError } from '../errors/app-error';
import { BillingRepositoryError } from '../database/billing-repository';

export function analysisRoutes(dependencies: AppDependencies) {
  const app = new Hono<AppEnvironment>();

  app.post('/analyses', async (context) => {
    const input = createAnalysisSchema.parse(await context.req.json());
    const clerkUserId = context.get('auth').userId;
    if (
      !(await dependencies.database.account.hasCurrentConsents(clerkUserId))
    ) {
      throw new AppError(
        'CONSENT_REQUIRED',
        403,
        'Accept the current legal documents before running an analysis',
      );
    }
    const requestId = input.requestId ?? crypto.randomUUID();
    let reservation: 'created' | 'existing';
    try {
      reservation = await dependencies.database.billing.reserveAnalysis({
        clerkUserId,
        requestId,
        units: 1,
      });
    } catch (error) {
      throw billingError(error);
    }

    let data: unknown;
    try {
      data = await dependencies.core.submitAnalysis({
        ticker: input.ticker.toUpperCase(),
        trade_date: input.tradeDate,
        analysts: input.analysts,
        config_overrides: input.configOverrides,
        request_id: requestId,
        ...(input.instrument
          ? {
              instrument: {
                exchange: input.instrument.exchange.toUpperCase(),
                symbol: input.instrument.symbol.toUpperCase(),
                ...(input.instrument.display_ticker
                  ? {
                      display_ticker:
                        input.instrument.display_ticker.toUpperCase(),
                    }
                  : {}),
              },
            }
          : {}),
        ...(input.display
          ? {
              display: {
                ...(input.display.display_name
                  ? { display_name: input.display.display_name }
                  : {}),
                ...(input.display.logo_url
                  ? { logo_url: input.display.logo_url }
                  : {}),
                ...(input.display.country
                  ? { country: input.display.country.toUpperCase() }
                  : {}),
              },
            }
          : {}),
      });
    } catch (error) {
      if (
        reservation === 'created' &&
        error instanceof AppError &&
        error.code === 'CORE_REQUEST_REJECTED'
      ) {
        await dependencies.database.billing.releaseAnalysis(
          requestId,
          'analysis_request_rejected',
        );
      }
      throw error;
    }

    const result = z
      .object({ id: z.string().uuid() })
      .passthrough()
      .safeParse(data);
    if (!result.success) {
      throw new AppError(
        'INVALID_CORE_RESPONSE',
        502,
        'Analysis service returned an invalid job response',
      );
    }
    try {
      await dependencies.database.billing.attachAnalysis(
        requestId,
        result.data.id,
      );
    } catch (error) {
      dependencies.logger.warn('Unable to attach analysis credit reservation', {
        requestId,
        analysisJobId: result.data.id,
        error: String(error),
      });
    }
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

function billingError(error: unknown): AppError {
  if (error instanceof BillingRepositoryError) {
    const status =
      error.code === 'INSUFFICIENT_CREDITS' ||
      error.code === 'SUBSCRIPTION_REQUIRED'
        ? 402
        : 409;
    return new AppError(error.code, status, error.message, error);
  }
  return new AppError(
    'CREDIT_RESERVATION_FAILED',
    500,
    'Unable to reserve an analysis credit',
    error,
  );
}
