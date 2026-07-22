import { Hono } from 'hono';
import { z } from 'zod';

import type { AppDependencies, AppEnvironment } from '../app';
import { AppError } from '../errors/app-error';
import { apiSuccess } from '../../shared/contracts';
import { isValidTimezone } from '../../shared/timezone';

const preferencesSchema = z.object({
  interfaceLanguage: z.enum(['en', 'zh-CN']),
  reportLanguage: z.string().trim().min(1).max(64),
  timezone: z
    .string()
    .trim()
    .min(1)
    .max(64)
    .refine(isValidTimezone, 'Invalid timezone'),
  defaultMarket: z.enum(['US', 'HK', 'CN', 'CRYPTO']),
});

export function accountRoutes(dependencies: AppDependencies) {
  const app = new Hono<AppEnvironment>();

  app.get('/account/referral', async (context) =>
    context.json(
      apiSuccess(
        await dependencies.database.referrals.getSummary(
          context.get('auth').userId,
        ),
        context.get('requestId'),
      ),
    ),
  );

  app.get('/account/profile', async (context) =>
    context.json(
      apiSuccess(
        {
          profile: await dependencies.database.account.getProfile(
            context.get('auth').userId,
          ),
        },
        context.get('requestId'),
      ),
    ),
  );

  app.patch('/account/profile', async (context) => {
    const input = preferencesSchema.safeParse(
      await context.req.json().catch(() => null),
    );
    if (!input.success) {
      throw new AppError('INVALID_PROFILE', 400, 'Invalid profile preferences');
    }
    return context.json(
      apiSuccess(
        await dependencies.database.account.updatePreferences(
          context.get('auth').userId,
          input.data,
        ),
        context.get('requestId'),
      ),
    );
  });

  return app;
}
