import type { MiddlewareHandler } from 'hono';

import type { AppEnvironment } from '../app';
import { AppError } from '../errors/app-error';
import type { AuthService } from './contract';
import type { AccountRepository } from '../database/repositories';

export function requireAuth(dependencies: {
  auth: AuthService;
  database: { account: Pick<AccountRepository, 'syncUser'> };
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
    const user = await dependencies.auth.getUser(session.userId);
    await dependencies.database.account.syncUser(user);
    context.set('authUser', user);
    await next();
  };
}

export function requireAdmin(): MiddlewareHandler<AppEnvironment> {
  return async (context, next) => {
    const user = context.get('authUser');
    if (user.role !== 'admin') {
      throw new AppError('FORBIDDEN', 403, 'Administrator access is required');
    }

    context.set('authUser', user);
    await next();
  };
}
