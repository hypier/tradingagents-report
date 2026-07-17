import type { MiddlewareHandler } from 'hono';

import type { AppEnvironment } from '../app';
import { AppError } from '../errors/app-error';
import type { AuthService } from './contract';

export function requireAuth(dependencies: {
  auth: AuthService;
}): MiddlewareHandler<AppEnvironment> {
  return async (context, next) => {
    const session = await dependencies.auth.authenticate(context.req.raw);
    if (session === null) {
      throw new AppError(
        'UNAUTHENTICATED',
        401,
        'A valid Clerk session is required',
      );
    }

    context.set('auth', session);
    await next();
  };
}
