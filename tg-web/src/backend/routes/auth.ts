import { Hono } from 'hono';

import { apiSuccess } from '../../shared/contracts';
import type { AppEnvironment } from '../app';
import type { AuthService } from '../auth/contract';

export function authRoutes(dependencies: { auth: AuthService }) {
  const app = new Hono<AppEnvironment>();

  app.get('/auth/session', async (context) => {
    const session = context.get('auth');
    const user = await dependencies.auth.getUser(session.userId);

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
