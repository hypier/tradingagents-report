import { Hono } from 'hono';
import { z } from 'zod';

import { apiSuccess } from '../../shared/contracts';
import type { AppDependencies, AppEnvironment } from '../app';
import { AppError } from '../errors/app-error';
import { WatchlistRepositoryError } from '../database/watchlist-repository';

const itemSchema = z.object({
  exchange: z.string().trim().min(1).max(16),
  symbol: z.string().trim().min(1).max(32),
  displayTicker: z.string().trim().min(1).max(32),
  providerSymbol: z.string().trim().min(1).max(64),
  displayName: z.string().trim().min(1).max(128),
  logoUrl: z.string().trim().max(512).nullable().optional(),
});

export function watchlistRoutes(dependencies: AppDependencies) {
  const app = new Hono<AppEnvironment>();

  app.get('/watchlist', async (context) =>
    context.json(
      apiSuccess(
        await dependencies.database.watchlist.getSnapshot(
          context.get('auth').userId,
        ),
        context.get('requestId'),
      ),
    ),
  );

  app.post('/watchlist/items', async (context) => {
    const input = itemSchema.parse(await context.req.json());
    try {
      const item = await dependencies.database.watchlist.addItem({
        clerkUserId: context.get('auth').userId,
        ...input,
      });
      return context.json(apiSuccess(item, context.get('requestId')), 201);
    } catch (error) {
      throw watchlistError(error);
    }
  });

  app.delete('/watchlist/items/:id', async (context) => {
    try {
      await dependencies.database.watchlist.removeItem({
        clerkUserId: context.get('auth').userId,
        itemId: context.req.param('id'),
      });
      return context.json(
        apiSuccess({ deleted: true as const }, context.get('requestId')),
      );
    } catch (error) {
      throw watchlistError(error);
    }
  });

  return app;
}

function watchlistError(error: unknown): AppError {
  if (error instanceof WatchlistRepositoryError) {
    const status =
      error.code === 'NOT_FOUND'
        ? 404
        : error.code === 'ALREADY_EXISTS'
          ? 409
          : 400;
    return new AppError(error.code, status, error.message, error);
  }
  if (error instanceof z.ZodError) {
    return new AppError('VALIDATION_ERROR', 400, 'Invalid watchlist input');
  }
  return new AppError(
    'WATCHLIST_ERROR',
    500,
    'Unable to update watchlist',
    error,
  );
}
