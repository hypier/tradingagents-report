import { Hono } from 'hono';

import type { AppDependencies } from '../app';
import type { RequestIdEnvironment } from '../logging/request-id';
import { apiSuccess } from '../../shared/contracts';

export function publicConfigRoutes(dependencies: AppDependencies) {
  const app = new Hono<RequestIdEnvironment>();

  app.get('/public-config', (context) =>
    context.json(
      apiSuccess(
        { clerkPublishableKey: dependencies.clerkPublishableKey },
        context.get('requestId'),
      ),
    ),
  );

  return app;
}
