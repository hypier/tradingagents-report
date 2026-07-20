import { Hono } from 'hono';
import { z } from 'zod';

import { apiSuccess } from '../../shared/contracts';
import type { AppDependencies, AppEnvironment } from '../app';
import { BillingRepositoryError } from '../database/billing-repository';
import { AppError } from '../errors/app-error';

const listUsersSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
  query: z.string().trim().min(1).max(100).optional(),
});

const updateRoleSchema = z.object({
  role: z.enum(['user', 'admin']),
});

const creditAdjustmentSchema = z.object({
  adjustmentId: z.string().uuid(),
  delta: z
    .number()
    .int()
    .min(-1_000_000)
    .max(1_000_000)
    .refine((value) => value !== 0),
  reason: z.string().trim().max(500).optional(),
});

export function adminRoutes(dependencies: AppDependencies) {
  const app = new Hono<AppEnvironment>();

  app.get('/admin/users', async (context) => {
    const input = listUsersSchema.safeParse(context.req.query());
    if (!input.success) {
      throw new AppError('INVALID_REQUEST', 400, 'Invalid user list query');
    }

    const page = await dependencies.auth.listUsers(input.data);
    const balances = await dependencies.database.billing.getAvailableCredits(
      page.users.map((user) => user.id),
    );
    return context.json(
      apiSuccess(
        {
          ...page,
          users: page.users.map((user) => ({
            ...user,
            availableCredits: balances[user.id] ?? 0,
          })),
        },
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

  app.post('/admin/users/:userId/credit-adjustments', async (context) => {
    const input = creditAdjustmentSchema.safeParse(
      await context.req.json().catch(() => null),
    );
    if (!input.success) {
      throw new AppError('INVALID_REQUEST', 400, 'Invalid credit adjustment');
    }
    const userId = context.req.param('userId');
    const user = await dependencies.auth.getUser(userId);
    await dependencies.database.account.syncUser(user);
    try {
      const availableCredits =
        await dependencies.database.billing.adjustCredits({
          ...input.data,
          clerkUserId: userId,
          actorClerkUserId: context.get('auth').userId,
        });
      return context.json(
        apiSuccess({ availableCredits }, context.get('requestId')),
      );
    } catch (error) {
      if (error instanceof BillingRepositoryError) {
        const status =
          error.code === 'INSUFFICIENT_CREDITS' ||
          error.code === 'IDEMPOTENCY_CONFLICT'
            ? 409
            : 500;
        throw new AppError(error.code, status, error.message, error);
      }
      throw error;
    }
  });

  return app;
}
