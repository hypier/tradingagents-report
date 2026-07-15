import { Hono } from 'hono';

import type { RequestIdEnvironment } from '../logging/request-id';
import { apiSuccess } from '../../shared/contracts';

export function healthRoutes() {
  const app = new Hono<RequestIdEnvironment>();

  app.get('/health', (context) =>
    context.json(apiSuccess({ status: 'ok' }, context.get('requestId'))),
  );

  return app;
}
