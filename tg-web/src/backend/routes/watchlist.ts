import { Hono } from 'hono';
import { z } from 'zod';

import { apiSuccess } from '../../shared/contracts';
import type { AppDependencies, AppEnvironment } from '../app';
import { AppError } from '../errors/app-error';
import { WatchlistRepositoryError } from '../database/watchlist-repository';

const groupSchema = z.object({
  name: z.string().trim().min(1).max(64),
});

const itemSchema = z.object({
  groupId: z.string().uuid().optional(),
  exchange: z.string().trim().min(1).max(16),
  symbol: z.string().trim().min(1).max(32),
  displayTicker: z.string().trim().min(1).max(32),
  providerSymbol: z.string().trim().min(1).max(64),
  displayName: z.string().trim().min(1).max(128),
  logoUrl: z.string().trim().max(512).nullable().optional(),
  notes: z.string().trim().max(500).nullable().optional(),
});

const reorderSchema = z.object({
  groupId: z.string().uuid(),
  itemIds: z.array(z.string().uuid()).min(1),
});

const tagSchema = z.object({
  name: z.string().trim().min(1).max(32),
  color: z.string().trim().max(32).nullable().optional(),
});

const itemTagsSchema = z.object({
  tagIds: z.array(z.string().uuid()),
});

export function watchlistRoutes(dependencies: AppDependencies) {
  const app = new Hono<AppEnvironment>();

  app.get('/watchlist', async (context) => {
    const clerkUserId = context.get('auth').userId;
    await dependencies.database.watchlist.ensureDefaultGroup(clerkUserId);
    return context.json(
      apiSuccess(
        await dependencies.database.watchlist.getSnapshot(clerkUserId),
        context.get('requestId'),
      ),
    );
  });

  app.post('/watchlist/groups', async (context) => {
    const input = groupSchema.parse(await context.req.json());
    try {
      const group = await dependencies.database.watchlist.createGroup({
        clerkUserId: context.get('auth').userId,
        name: input.name,
      });
      return context.json(apiSuccess(group, context.get('requestId')), 201);
    } catch (error) {
      throw watchlistError(error);
    }
  });

  app.patch('/watchlist/groups/:id', async (context) => {
    const input = groupSchema.parse(await context.req.json());
    try {
      const group = await dependencies.database.watchlist.renameGroup({
        clerkUserId: context.get('auth').userId,
        groupId: context.req.param('id'),
        name: input.name,
      });
      return context.json(apiSuccess(group, context.get('requestId')));
    } catch (error) {
      throw watchlistError(error);
    }
  });

  app.delete('/watchlist/groups/:id', async (context) => {
    try {
      await dependencies.database.watchlist.deleteGroup({
        clerkUserId: context.get('auth').userId,
        groupId: context.req.param('id'),
      });
      return context.json(
        apiSuccess({ deleted: true as const }, context.get('requestId')),
      );
    } catch (error) {
      throw watchlistError(error);
    }
  });

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

  app.post('/watchlist/items/reorder', async (context) => {
    const input = reorderSchema.parse(await context.req.json());
    try {
      await dependencies.database.watchlist.reorderItems({
        clerkUserId: context.get('auth').userId,
        groupId: input.groupId,
        itemIds: input.itemIds,
      });
      return context.json(
        apiSuccess({ reordered: true as const }, context.get('requestId')),
      );
    } catch (error) {
      throw watchlistError(error);
    }
  });

  app.post('/watchlist/tags', async (context) => {
    const input = tagSchema.parse(await context.req.json());
    try {
      const tag = await dependencies.database.watchlist.createTag({
        clerkUserId: context.get('auth').userId,
        name: input.name,
        color: input.color,
      });
      return context.json(apiSuccess(tag, context.get('requestId')), 201);
    } catch (error) {
      throw watchlistError(error);
    }
  });

  app.delete('/watchlist/tags/:id', async (context) => {
    try {
      await dependencies.database.watchlist.deleteTag({
        clerkUserId: context.get('auth').userId,
        tagId: context.req.param('id'),
      });
      return context.json(
        apiSuccess({ deleted: true as const }, context.get('requestId')),
      );
    } catch (error) {
      throw watchlistError(error);
    }
  });

  app.put('/watchlist/items/:id/tags', async (context) => {
    const input = itemTagsSchema.parse(await context.req.json());
    try {
      await dependencies.database.watchlist.setItemTags({
        clerkUserId: context.get('auth').userId,
        itemId: context.req.param('id'),
        tagIds: input.tagIds,
      });
      return context.json(
        apiSuccess({ updated: true as const }, context.get('requestId')),
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
