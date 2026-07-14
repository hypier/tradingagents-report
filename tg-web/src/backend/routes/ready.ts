import { Hono } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';

import { AppError } from '../errors/app-error';
import { toErrorResponse } from '../errors/error-response';
import type { RequestIdEnvironment } from '../logging/request-id';
import { apiSuccess } from '../../shared/contracts';
import type { AppDependencies } from '../app';

type DependencyName = 'database' | 'cache' | 'core';

export function readyRoutes(dependencies: AppDependencies) {
  const app = new Hono<RequestIdEnvironment>();

  app.get('/ready', async (context) => {
    const checks = await Promise.allSettled([
      dependencies.database.healthcheck(),
      dependencies.cache.healthcheck(),
      dependencies.core.healthcheck(),
    ]);
    const dependencyNames: DependencyName[] = ['database', 'cache', 'core'];
    const dependencyStatus = Object.fromEntries(
      checks.map((check, index) => [
        dependencyNames[index] as DependencyName,
        check.status === 'fulfilled' ? 'ok' : 'error',
      ]),
    ) as Record<DependencyName, 'ok' | 'error'>;
    const requestId = context.get('requestId');

    checks.forEach((check, index) => {
      if (check.status === 'rejected') {
        dependencies.logger.warn('Readiness dependency check failed', {
          dependency: dependencyNames[index],
          requestId,
        });
      }
    });

    if (
      dependencyStatus.database === 'error' ||
      dependencyStatus.core === 'error'
    ) {
      const error = new AppError(
        'DEPENDENCY_UNAVAILABLE',
        503,
        'Service dependencies are temporarily unavailable',
      );
      return context.json(
        toErrorResponse(error, requestId),
        error.status as ContentfulStatusCode,
      );
    }

    const status = dependencyStatus.cache === 'error' ? 'degraded' : 'ok';
    return context.json(
      apiSuccess({ status, dependencies: dependencyStatus }, requestId),
    );
  });

  return app;
}
