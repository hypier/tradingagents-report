import { Hono } from 'hono';
import { z } from 'zod';

import { apiSuccess } from '../../shared/contracts';
import type { AppEnvironment } from '../app';
import type { AuthService } from '../auth/contract';
import { AppError } from '../errors/app-error';

const listUsersSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
  query: z.string().trim().min(1).max(100).optional(),
});

const updateRoleSchema = z.object({
  role: z.enum(['user', 'admin']),
});

export function adminRoutes(dependencies: { auth: AuthService }) {
  const app = new Hono<AppEnvironment>();

  app.get('/admin/users', async (context) => {
    const input = listUsersSchema.safeParse(context.req.query());
    if (!input.success) {
      throw new AppError('INVALID_REQUEST', 400, 'Invalid user list query');
    }

    return context.json(
      apiSuccess(
        await dependencies.auth.listUsers(input.data),
        context.get('requestId'),
      ),
    );
  });

  app.patch('/admin/users/:userId/role', async (context) => {
    const body = await context.req.json().catch(() => null);
    const input = updateRoleSchema.safeParse(body);
    if (!input.success) {
      throw new AppError('INVALID_REQUEST', 400, 'Invalid user role');
    }

    const currentUser = context.get('authUser');
    const userId = context.req.param('userId');
    if (currentUser.id === userId && input.data.role !== 'admin') {
      throw new AppError(
        'SELF_DEMOTION_NOT_ALLOWED',
        409,
        'Administrators cannot remove their own access',
      );
    }

    return context.json(
      apiSuccess(
        await dependencies.auth.setUserRole(userId, input.data.role),
        context.get('requestId'),
      ),
    );
  });

  return app;
}
