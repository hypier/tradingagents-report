import { Hono } from 'hono';
import { z } from 'zod';

import type { MarketTapeQuote } from '../../shared/market-board';
import { isStockLeaderboardTab } from '../../shared/market-codes';
import { createAnalysisSchema, apiSuccess } from '../../shared/contracts';
import type { AppDependencies, AppEnvironment } from '../app';
import { buildBillingSignature } from '../billing/credit-pricing';
import { BillingRepositoryError } from '../database/billing-repository';
import { metaFlags } from '../database/report-meta-repository';
import type { AnalysisJob } from '../database/repositories';
import { AppError } from '../errors/app-error';
import { resolveAnalysisLlm } from '../llm/resolve-analysis-models';
import { isOhlcvTimeframe } from '../market-assets/tradingview-market-client';

export function analysisRoutes(dependencies: AppDependencies) {
  const app = new Hono<AppEnvironment>();

  app.post('/analyses/estimate', async (context) => {
    const parsed = createAnalysisSchema.safeParse(
      await context.req.json().catch(() => null),
    );
    if (!parsed.success) {
      throw new AppError('INVALID_REQUEST', 400, 'Invalid analysis request');
    }
    const input = parsed.data;
    const resolved = await resolveAnalysisLlm(
      dependencies,
      {
        quickModelId: input.quickModelId,
        deepModelId: input.deepModelId,
      },
      input.configOverrides ?? {},
    );
    const data = await dependencies.database.billing.estimateAnalysis({
      billingSignature: buildBillingSignature({
        analysts: input.analysts,
        configOverrides: resolved.configOverrides,
      }),
    });
    return context.json(
      apiSuccess(
        { reservedPoints: data.reservedPoints },
        context.get('requestId'),
      ),
    );
  });

  app.post('/analyses', async (context) => {
    const parsed = createAnalysisSchema.safeParse(
      await context.req.json().catch(() => null),
    );
    if (!parsed.success) {
      throw new AppError('INVALID_REQUEST', 400, 'Invalid analysis request');
    }
    const input = parsed.data;
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
    const resolved = await resolveAnalysisLlm(
      dependencies,
      {
        quickModelId: input.quickModelId,
        deepModelId: input.deepModelId,
      },
      input.configOverrides ?? {},
    );
    const requestId = input.requestId ?? crypto.randomUUID();
    let reservation: 'created' | 'existing';
    try {
      reservation = await dependencies.database.billing.reserveAnalysis({
        clerkUserId,
        requestId,
        billingSignature: buildBillingSignature({
          analysts: input.analysts,
          configOverrides: resolved.configOverrides,
        }),
      });
    } catch (error) {
      throw billingError(error);
    }

    let data: unknown;
    try {
      const instrument = input.instrument
        ? {
            exchange: input.instrument.exchange.toUpperCase(),
            symbol: input.instrument.symbol.toUpperCase(),
            ...(input.instrument.display_ticker
              ? {
                  display_ticker:
                    input.instrument.display_ticker.toUpperCase(),
                }
              : {}),
          }
        : undefined;
      // Core requires ticker and instrument to resolve to the same listing.
      // Bare symbols like "AAPL" resolve with exchange=null and conflict with
      // NASDAQ:AAPL-style instruments from the watchlist/search UI.
      data = await dependencies.core.submitAnalysis({
        ...(instrument
          ? {
              ticker: `${instrument.exchange}:${instrument.symbol}`,
              instrument,
            }
          : { ticker: input.ticker.toUpperCase() }),
        trade_date: input.tradeDate,
        analysts: input.analysts,
        config_overrides: resolved.configOverrides,
        request_id: requestId,
        ...(input.display
          ? {
              display: {
                ...(input.display.display_name
                  ? { display_name: input.display.display_name }
                  : {}),
                ...(input.display.english_name
                  ? { english_name: input.display.english_name }
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
    const clerkUserId = context.get('auth').userId;
    const query = context.req.query();
    const limit = clampInt(query.limit, 50, 1, 200);
    const offset = clampInt(query.offset, 0, 0, 10_000);
    const status = parseStatus(query.status);
    const watchlist =
      query.watchlist === 'true'
        ? true
        : query.watchlist === 'false'
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
      watchlist: watchlist === true ? true : undefined,
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

  app.post('/analyses/:id/cancel', async (context) => {
    const clerkUserId = context.get('auth').userId;
    const id = context.req.param('id');
    await requireOwnedAnalysis(dependencies, clerkUserId, id);
    const data = await dependencies.core.cancelAnalysis(id);
    return context.json(apiSuccess(data, context.get('requestId')));
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
    const lang = context.req.query('lang') === 'zh' ? 'zh' : 'en';
    return context.json(
      apiSuccess(
        await dependencies.marketAssets.searchMarkets(query, lang),
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
    const normalized = providerSymbol.trim().toUpperCase();
    const cacheKey = `market-snapshot:v2:${normalized}`;
    const forceRefresh = context.req.query('refresh') === '1';
    if (!forceRefresh) {
      const cached = await dependencies.cache.get(cacheKey);
      if (cached) {
        try {
          return context.json(
            apiSuccess(JSON.parse(cached), context.get('requestId')),
          );
        } catch {
          // fall through to refresh
        }
      }
    }

    try {
      const snapshot = await dependencies.marketAssets.getSnapshot(normalized);
      await dependencies.cache.set(cacheKey, JSON.stringify(snapshot), 20);
      return context.json(apiSuccess(snapshot, context.get('requestId')));
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unable to load market snapshot';
      if (message.includes('not configured')) {
        throw new AppError('SERVICE_UNAVAILABLE', 503, message, error);
      }
      throw new AppError('BAD_GATEWAY', 502, message, error);
    }
  });

  app.get('/market-ohlcv', async (context) => {
    const providerSymbol =
      context.req.query('symbol') ?? context.req.query('ticker') ?? '';
    const timeframe = context.req.query('timeframe') ?? 'D';
    const rangeRaw = Number(context.req.query('range') ?? '120');
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
    if (!isOhlcvTimeframe(timeframe)) {
      return context.json(
        {
          error: {
            code: 'VALIDATION_ERROR',
            message: 'timeframe is invalid',
            requestId: context.get('requestId'),
          },
        },
        400,
      );
    }
    const normalized = providerSymbol.trim().toUpperCase();
    const range = Number.isFinite(rangeRaw) ? rangeRaw : 120;
    const cacheKey = `market-ohlcv:v1:${normalized}:${timeframe}:${Math.min(Math.max(Math.trunc(range), 1), 500)}`;
    const cached = await dependencies.cache.get(cacheKey);
    if (cached) {
      try {
        return context.json(
          apiSuccess(JSON.parse(cached), context.get('requestId')),
        );
      } catch {
        // fall through to refresh
      }
    }

    try {
      const ohlcv = await dependencies.marketAssets.getOhlcv(
        normalized,
        timeframe,
        range,
      );
      await dependencies.cache.set(cacheKey, JSON.stringify(ohlcv), 30);
      return context.json(apiSuccess(ohlcv, context.get('requestId')));
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unable to load OHLCV';
      if (message.includes('not configured')) {
        throw new AppError('SERVICE_UNAVAILABLE', 503, message, error);
      }
      if (message.includes('must be EXCHANGE:TICKER') || message.includes('Invalid')) {
        throw new AppError('INVALID_REQUEST', 400, message, error);
      }
      throw new AppError('BAD_GATEWAY', 502, message, error);
    }
  });

  app.get('/market-quotes', async (context) => {
    const symbols = [
      ...new Set(
        (context.req.queries('symbol') ?? [])
          .map((symbol) => symbol.trim().toUpperCase())
          .filter((symbol) => symbol.includes(':')),
      ),
    ].slice(0, 50);
    if (!symbols.length) {
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

    const quotesBySymbol = new Map<string, MarketTapeQuote>();
    const missing: string[] = [];
    await Promise.all(
      symbols.map(async (symbol) => {
        const cacheKey = `market-quote:v1:${symbol}`;
        const cached = await dependencies.cache.get(cacheKey);
        if (!cached) {
          missing.push(symbol);
          return;
        }
        try {
          const parsed = JSON.parse(cached) as MarketTapeQuote;
          if (
            typeof parsed?.symbol === 'string' &&
            typeof parsed?.price === 'number' &&
            typeof parsed?.change_percent === 'number'
          ) {
            quotesBySymbol.set(symbol, parsed);
            return;
          }
        } catch {
          // fall through
        }
        missing.push(symbol);
      }),
    );

    try {
      if (missing.length) {
        const fetched = await dependencies.marketAssets.getQuotesBatch(missing);
        await Promise.all(
          fetched.map(async (quote) => {
            const key = quote.symbol.trim().toUpperCase();
            quotesBySymbol.set(key, quote);
            await dependencies.cache.set(
              `market-quote:v1:${key}`,
              JSON.stringify(quote),
              20,
            );
          }),
        );
      }
      return context.json(
        apiSuccess(
          symbols.flatMap((symbol) => {
            const quote = quotesBySymbol.get(symbol);
            return quote ? [quote] : [];
          }),
          context.get('requestId'),
        ),
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unable to load market quotes';
      if (message.includes('not configured')) {
        throw new AppError('SERVICE_UNAVAILABLE', 503, message, error);
      }
      throw new AppError('BAD_GATEWAY', 502, message, error);
    }
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
    const count = Number(context.req.query('count') ?? '50');
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
            count: Number.isFinite(count) ? count : 50,
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
    const status = error.code === 'INSUFFICIENT_CREDITS' ? 402 : 409;
    return new AppError(error.code, status, error.message, error);
  }
  return new AppError(
    'CREDIT_RESERVATION_FAILED',
    500,
    'Unable to reserve an analysis credit',
    error,
  );
}
