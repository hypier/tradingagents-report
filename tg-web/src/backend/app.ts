import { Hono } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';

import type { AuthService, AuthSession, AuthUser } from './auth/contract';
import { requireAdmin, requireAuth } from './auth/middleware';
import type { BillingService } from './billing/contract';
import type { Cache } from './cache/contract';
import type { CoreClientContract } from './core/client';
import type { DatabaseHealth } from './database/client';
import { AppError } from './errors/app-error';
import { toErrorResponse } from './errors/error-response';
import { Logger } from './logging/logger';
import type { MarketAssetClient } from './market-assets/tradingview-market-client';
import {
  createRequestIdMiddleware,
  type RequestIdEnvironment,
} from './logging/request-id';
import { healthRoutes } from './routes/health';
import { publicConfigRoutes } from './routes/public-config';
import { readyRoutes } from './routes/ready';
import { referralRoutes } from './routes/referrals';
import { analysisRoutes } from './routes/analyses';
import { authRoutes } from './routes/auth';
import { accountRoutes } from './routes/account';
import { adminRoutes } from './routes/admin';
import { billingRoutes, stripeWebhookRoutes } from './routes/billing';
import { watchlistRoutes } from './routes/watchlist';
import {
  analysisShareRoutes,
  publicShareRoutes,
} from './routes/share';

export type AppEnvironment = {
  Variables: RequestIdEnvironment['Variables'] & {
    auth: AuthSession;
    authUser: AuthUser;
  };
};

export type AppDependencies = {
  auth: AuthService;
  billing: BillingService;
  database: Pick<
    DatabaseHealth,
    | 'healthcheck'
    | 'account'
    | 'billing'
    | 'referrals'
    | 'analysisJobs'
    | 'watchlist'
    | 'reportMeta'
    | 'shareLinks'
    | 'settings'
    | 'markets'
    | 'creditRules'
    | 'audit'
    | 'modelPrices'
    | 'pricingSources'
  >;
  cache: Cache;
  core: CoreClientContract;
  marketAssets: MarketAssetClient;
  logger: Logger;
  /** Browser Clerk publishable key; exposed via /api/public-config at runtime. */
  clerkPublishableKey: string;
};

export function createApp(dependencies: AppDependencies) {
  const app = new Hono<AppEnvironment>();

  app.route('/', referralRoutes(dependencies));
  app.use('/api/*', createRequestIdMiddleware());
  app.route('/api', healthRoutes());
  app.route('/api', publicConfigRoutes(dependencies));
  app.route('/api', readyRoutes(dependencies));
  app.route('/api', publicShareRoutes(dependencies));
  app.route('/api', stripeWebhookRoutes(dependencies));
  app.use('/api/auth/*', requireAuth(dependencies));
  app.use('/api/account/*', requireAuth(dependencies));
  app.use('/api/billing/*', requireAuth(dependencies));
  app.use('/api/admin/*', requireAuth(dependencies));
  app.use('/api/admin/*', requireAdmin());
  app.use('/api/analyses', requireAuth(dependencies));
  app.use('/api/analyses/*', requireAuth(dependencies));
  app.use('/api/watchlist', requireAuth(dependencies));
  app.use('/api/watchlist/*', requireAuth(dependencies));
  app.use('/api/market-search', requireAuth(dependencies));
  app.use('/api/market-snapshot', requireAuth(dependencies));
  app.use('/api/market-ohlcv', requireAuth(dependencies));
  app.use('/api/market-quotes', requireAuth(dependencies));
  app.use('/api/market-identities', requireAuth(dependencies));
  app.use('/api/market-markets', requireAuth(dependencies));
  app.use('/api/market-board', requireAuth(dependencies));
  app.use('/api/market-tape', requireAuth(dependencies));
  app.route('/api', authRoutes());
  app.route('/api', accountRoutes(dependencies));
  app.route('/api', adminRoutes(dependencies));
  app.route('/api', billingRoutes(dependencies));
  app.route('/api', analysisRoutes(dependencies));
  app.route('/api', analysisShareRoutes(dependencies));
  app.route('/api', watchlistRoutes(dependencies));
  app.notFound((context) => {
    const requestId = context.get('requestId');
    const error = new AppError('NOT_FOUND', 404, 'Not found');
    return context.json(
      toErrorResponse(error, requestId),
      error.status as ContentfulStatusCode,
    );
  });
  app.onError((error, context) => {
    const requestId = context.get('requestId');
    const status = error instanceof AppError ? error.status : 500;
    if (!(error instanceof AppError) || status >= 500) {
      dependencies.logger.error('Request failed', {
        requestId,
        path: context.req.path,
        method: context.req.method,
        status,
        code: error instanceof AppError ? error.code : 'INTERNAL_ERROR',
        error: error instanceof Error ? error.message : String(error),
        cause:
          error instanceof Error && error.cause instanceof Error
            ? error.cause.message
            : undefined,
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
    return context.json(
      toErrorResponse(error, requestId),
      status as ContentfulStatusCode,
    );
  });

  return app;
}

export type AppType = ReturnType<typeof createApp>;
