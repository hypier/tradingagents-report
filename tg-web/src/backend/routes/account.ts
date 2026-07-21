import { Hono } from 'hono';
import { z } from 'zod';

import { LEGAL_DOCUMENT_VERSIONS } from '../account/contract';
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

const consentSchema = z.object({
  documentTypes: z
    .array(z.enum(['risk_disclaimer', 'terms', 'privacy']))
    .min(1)
    .transform((types) => [...new Set(types)]),
});

export function accountRoutes(dependencies: AppDependencies) {
  const app = new Hono<AppEnvironment>();

  app.get('/account/profile', async (context) =>
    context.json(
      apiSuccess(
        {
          profile: await dependencies.database.account.getProfile(
            context.get('auth').userId,
          ),
          legalVersions: LEGAL_DOCUMENT_VERSIONS,
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

  app.post('/account/consents', async (context) => {
    const input = consentSchema.safeParse(
      await context.req.json().catch(() => null),
    );
    if (!input.success) {
      throw new AppError('INVALID_CONSENT', 400, 'Invalid consent record');
    }
    return context.json(
      apiSuccess(
        await dependencies.database.account.recordConsents({
          clerkUserId: context.get('auth').userId,
          documentTypes: input.data.documentTypes,
          ipAddress: context.req.header('cf-connecting-ip') ?? null,
          userAgent: context.req.header('user-agent') ?? null,
        }),
        context.get('requestId'),
      ),
      201,
    );
  });

  return app;
}
