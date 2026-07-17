import { Hono } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';

import type { AuthService, AuthSession } from './auth/contract';
import { requireAuth } from './auth/middleware';
import type { Cache } from './cache/contract';
import type { CoreClientContract } from './core/client';
import { AppError } from './errors/app-error';
import { toErrorResponse } from './errors/error-response';
import { Logger } from './logging/logger';
import type { MarketAssetClient } from './market-assets/tradingview-market-client';
import {
  createRequestIdMiddleware,
  type RequestIdEnvironment,
} from './logging/request-id';
import { healthRoutes } from './routes/health';
import { readyRoutes } from './routes/ready';
import { analysisRoutes } from './routes/analyses';
import { authRoutes } from './routes/auth';

export type AppEnvironment = {
  Variables: RequestIdEnvironment['Variables'] & {
    auth: AuthSession;
  };
};

export type AppDependencies = {
  auth: AuthService;
  database: { healthcheck(): Promise<void> };
  cache: Cache;
  core: CoreClientContract;
  marketAssets: MarketAssetClient;
  logger: Logger;
};

export function createApp(dependencies: AppDependencies) {
  const app = new Hono<AppEnvironment>();

  app.use('/api/*', createRequestIdMiddleware());
  app.route('/api', healthRoutes());
  app.route('/api', readyRoutes(dependencies));
  app.use('/api/auth/*', requireAuth(dependencies));
  app.use('/api/analyses', requireAuth(dependencies));
  app.use('/api/analyses/*', requireAuth(dependencies));
  app.use('/api/market-snapshot', requireAuth(dependencies));
  app.use('/api/market-identities', requireAuth(dependencies));
  app.route('/api', authRoutes(dependencies));
  app.route('/api', analysisRoutes(dependencies));
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
    return context.json(
      toErrorResponse(error, requestId),
      status as ContentfulStatusCode,
    );
  });

  return app;
}

export type AppType = ReturnType<typeof createApp>;
