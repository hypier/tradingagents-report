import { Hono } from 'hono';
import { z } from 'zod';

import { resolveCreditUnits } from '../../shared/analysis-credits';
import {
  isStockLeaderboardTab,
  marketFromExchange,
} from '../../shared/market-codes';
import { createAnalysisSchema, apiSuccess } from '../../shared/contracts';
import type { AppDependencies, AppEnvironment } from '../app';
import { AppError } from '../errors/app-error';
import { BillingRepositoryError } from '../database/billing-repository';
import { metaFlags } from '../database/report-meta-repository';
import type { AnalysisJob } from '../database/repositories';

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
    const market =
      marketFromExchange(input.instrument?.exchange) ??
      (input.display?.country
        ? input.display.country.toUpperCase()
        : null);
    const creditRules = await dependencies.database.creditRules.listEnabled();
    const creditUnits = resolveCreditUnits(
      { market, analystCount: input.analysts.length },
      creditRules,
    );
    let reservation: 'created' | 'existing' | 'skipped' = 'skipped';
    if (creditUnits > 0) {
      try {
        reservation = await dependencies.database.billing.reserveAnalysis({
          clerkUserId,
          requestId,
          units: creditUnits,
        });
      } catch (error) {
        throw billingError(error);
      }
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
    if (reservation !== 'skipped') {
      try {
        await dependencies.database.billing.attachAnalysis(
          requestId,
          result.data.id,
        );
      } catch (error) {
        dependencies.logger.warn(
          'Unable to attach analysis credit reservation',
          {
            requestId,
            analysisJobId: result.data.id,
            error: String(error),
          },
        );
      }
    }
    return context.json(apiSuccess(data, context.get('requestId')), 202);
  });

  app.get('/analyses', async (context) => {
    const clerkUserId = context.get('auth').userId;
    const query = context.req.query();
    const limit = clampInt(query.limit, 50, 1, 200);
    const offset = clampInt(query.offset, 0, 0, 10_000);
    const status = parseStatus(query.status);
    const favorite =
      query.favorite === 'true'
        ? true
        : query.favorite === 'false'
          ? false
          : undefined;
    const archived =
      query.archived === 'true'
        ? true
        : query.archived === 'false'
          ? false
          : undefined;

    const rows = await dependencies.database.analysisJobs.listForUser({
      clerkUserId,
      ticker: query.ticker?.trim() || undefined,
      exchange: query.exchange?.trim() || undefined,
      status,
      tradeDateFrom: query.trade_date_from?.trim() || undefined,
      tradeDateTo: query.trade_date_to?.trim() || undefined,
      favorite: favorite === true ? true : undefined,
      archived:
        archived === true ? true : archived === false ? false : undefined,
      limit,
      offset,
    });

    return context.json(
      apiSuccess(
        rows.map((row) =>
          toPublicJob(row.job, {
            creditUnits: row.creditUnits,
            isFavorite: row.isFavorite,
            isArchived: row.isArchived,
          }),
        ),
        context.get('requestId'),
      ),
    );
  });

  app.get('/analyses/:id', async (context) => {
    const clerkUserId = context.get('auth').userId;
    const id = context.req.param('id');
    await requireOwnedAnalysis(dependencies, clerkUserId, id);
    const data = await dependencies.core.getAnalysis(id);
    const meta = await dependencies.database.reportMeta.get(clerkUserId, id);
    const creditUnits =
      await dependencies.database.analysisJobs.getReservationUnits(
        clerkUserId,
        id,
      );
    return context.json(
      apiSuccess(
        {
          ...(isRecord(data) ? data : {}),
          ...metaFlags(meta),
          credit_units: creditUnits,
        },
        context.get('requestId'),
      ),
    );
  });

  app.get('/analyses/:id/events', async (context) => {
    const clerkUserId = context.get('auth').userId;
    const id = context.req.param('id');
    await requireOwnedAnalysis(dependencies, clerkUserId, id);
    return context.json(
      apiSuccess(
        await dependencies.core.getAnalysisEvents(id),
        context.get('requestId'),
      ),
    );
  });

  app.patch('/analyses/:id/meta', async (context) => {
    const clerkUserId = context.get('auth').userId;
    const id = context.req.param('id');
    await requireOwnedAnalysis(dependencies, clerkUserId, id);
    const input = z
      .object({
        isFavorite: z.boolean().optional(),
        isArchived: z.boolean().optional(),
        notes: z.string().trim().max(500).nullable().optional(),
      })
      .parse(await context.req.json());
    const meta = await dependencies.database.reportMeta.upsert({
      clerkUserId,
      analysisJobId: id,
      ...input,
    });
    return context.json(
      apiSuccess(metaFlags(meta), context.get('requestId')),
    );
  });

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

  app.get('/market-markets', async (context) => {
    const lang = context.req.query('lang') === 'zh' ? 'zh' : 'en';
    return context.json(
      apiSuccess(
        {
          markets: await dependencies.marketAssets.listMarkets(lang),
        },
        context.get('requestId'),
      ),
    );
  });

  app.get('/market-board', async (context) => {
    const marketCode =
      context.req.query('market_code') ?? context.req.query('market') ?? '';
    const tab = context.req.query('tab') ?? 'active';
    const lang = context.req.query('lang') === 'zh' ? 'zh' : 'en';
    const count = Number(context.req.query('count') ?? '20');
    const start = Number(context.req.query('start') ?? '0');
    if (!marketCode.trim()) {
      return context.json(
        {
          error: {
            code: 'VALIDATION_ERROR',
            message: 'market_code is required',
            requestId: context.get('requestId'),
          },
        },
        400,
      );
    }
    if (!isStockLeaderboardTab(tab)) {
      return context.json(
        {
          error: {
            code: 'VALIDATION_ERROR',
            message: 'tab is invalid',
            requestId: context.get('requestId'),
          },
        },
        400,
      );
    }
    try {
      return context.json(
        apiSuccess(
          await dependencies.marketAssets.getStockLeaderboard({
            marketCode,
            tab,
            count: Number.isFinite(count) ? count : 20,
            start: Number.isFinite(start) ? start : 0,
            lang,
          }),
          context.get('requestId'),
        ),
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unable to load market board';
      if (message.includes('not configured')) {
        throw new AppError('SERVICE_UNAVAILABLE', 503, message, error);
      }
      throw new AppError('BAD_GATEWAY', 502, message, error);
    }
  });

  app.get('/market-tape', async (context) => {
    const marketCode =
      context.req.query('market_code') ?? context.req.query('market') ?? '';
    const lang = context.req.query('lang') === 'zh' ? 'zh' : 'en';
    if (!marketCode.trim()) {
      return context.json(
        {
          error: {
            code: 'VALIDATION_ERROR',
            message: 'market_code is required',
            requestId: context.get('requestId'),
          },
        },
        400,
      );
    }
    try {
      return context.json(
        apiSuccess(
          await dependencies.marketAssets.getMarketTape(marketCode, lang),
          context.get('requestId'),
        ),
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unable to load market tape';
      if (message.includes('not configured')) {
        throw new AppError('SERVICE_UNAVAILABLE', 503, message, error);
      }
      throw new AppError('BAD_GATEWAY', 502, message, error);
    }
  });

  app.get('/market-stream-token', async (context) => {
    try {
      return context.json(
        apiSuccess(
          await dependencies.marketAssets.createStreamToken(),
          context.get('requestId'),
        ),
      );
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Unable to create market stream token';
      if (message.includes('not configured')) {
        throw new AppError('SERVICE_UNAVAILABLE', 503, message, error);
      }
      throw new AppError('BAD_GATEWAY', 502, message, error);
    }
  });

  return app;
}

async function requireOwnedAnalysis(
  dependencies: AppDependencies,
  clerkUserId: string,
  analysisJobId: string,
) {
  const owned = await dependencies.database.analysisJobs.ownsJob(
    clerkUserId,
    analysisJobId,
  );
  if (!owned) {
    throw new AppError('NOT_FOUND', 404, 'Analysis job not found');
  }
}

function toPublicJob(
  job: AnalysisJob,
  extras: {
    creditUnits: number | null;
    isFavorite: boolean;
    isArchived: boolean;
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
    is_favorite: extras.isFavorite,
    is_archived: extras.isArchived,
  };
}

function parseStatus(value?: string) {
  if (
    value === 'queued' ||
    value === 'running' ||
    value === 'succeeded' ||
    value === 'failed'
  ) {
    return value;
  }
  return undefined;
}

function clampInt(
  value: string | undefined,
  fallback: number,
  min: number,
  max: number,
) {
  const parsed = Number.parseInt(value ?? '', 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
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
