import { Hono } from 'hono';

import { apiSuccess } from '../../shared/contracts';
import type { AppEnvironment } from '../app';

export function authRoutes() {
  const app = new Hono<AppEnvironment>();

  app.get('/auth/session', async (context) => {
    const session = context.get('auth');
    const user = context.get('authUser');

    return context.json(
      apiSuccess(
        {
          authenticated: true as const,
          session: { id: session.sessionId },
          user,
        },
        context.get('requestId'),
      ),
    );
  });

  return app;
}
