import { and, asc, desc, eq, max } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

import * as schema from './schema';

export type WatchlistItem = typeof schema.watchlistItems.$inferSelect;

export type WatchlistSnapshot = {
  items: WatchlistItem[];
};

export interface WatchlistRepository {
  getSnapshot(clerkUserId: string): Promise<WatchlistSnapshot>;
  addItem(input: {
    clerkUserId: string;
    exchange: string;
    symbol: string;
    displayTicker: string;
    providerSymbol: string;
    displayName: string;
    logoUrl?: string | null;
  }): Promise<WatchlistItem>;
  removeItem(input: { clerkUserId: string; itemId: string }): Promise<void>;
  findItemByProviderSymbol(
    clerkUserId: string,
    providerSymbol: string,
  ): Promise<WatchlistItem | undefined>;
}

export class WatchlistRepositoryError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'WatchlistRepositoryError';
  }
}

type Database = NodePgDatabase<typeof schema>;

export function createWatchlistRepository(
  database: Database,
): WatchlistRepository {
  return {
    async getSnapshot(clerkUserId) {
      const items = await database
        .select()
        .from(schema.watchlistItems)
        .where(eq(schema.watchlistItems.clerkUserId, clerkUserId))
        .orderBy(
          asc(schema.watchlistItems.sortOrder),
          desc(schema.watchlistItems.createdAt),
        );
      return { items };
    },

    async addItem(input) {
      const providerSymbol = input.providerSymbol.trim().toUpperCase();
      const [{ value: maxSort } = { value: null }] = await database
        .select({ value: max(schema.watchlistItems.sortOrder) })
        .from(schema.watchlistItems)
        .where(eq(schema.watchlistItems.clerkUserId, input.clerkUserId));

      try {
        const [created] = await database
          .insert(schema.watchlistItems)
          .values({
            clerkUserId: input.clerkUserId,
            exchange: input.exchange.trim().toUpperCase(),
            symbol: input.symbol.trim().toUpperCase(),
            displayTicker: input.displayTicker.trim().toUpperCase(),
            providerSymbol,
            displayName: input.displayName.trim() || input.displayTicker,
            logoUrl: input.logoUrl ?? null,
            sortOrder: (maxSort ?? -1) + 1,
          })
          .returning();
        return created!;
      } catch (error) {
        if (isUniqueViolation(error)) {
          throw new WatchlistRepositoryError(
            'ALREADY_EXISTS',
            'Instrument is already on the watchlist',
          );
        }
        throw error;
      }
    },

    async removeItem({ clerkUserId, itemId }) {
      const deleted = await database
        .delete(schema.watchlistItems)
        .where(
          and(
            eq(schema.watchlistItems.id, itemId),
            eq(schema.watchlistItems.clerkUserId, clerkUserId),
          ),
        )
        .returning({ id: schema.watchlistItems.id });
      if (!deleted.length) {
        throw new WatchlistRepositoryError('NOT_FOUND', 'Watchlist item not found');
      }
    },

    async findItemByProviderSymbol(clerkUserId, providerSymbol) {
      const [item] = await database
        .select()
        .from(schema.watchlistItems)
        .where(
          and(
            eq(schema.watchlistItems.clerkUserId, clerkUserId),
            eq(
              schema.watchlistItems.providerSymbol,
              providerSymbol.trim().toUpperCase(),
            ),
          ),
        )
        .limit(1);
      return item;
    },
  };
}

function isUniqueViolation(error: unknown) {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: string }).code === '23505'
  );
}
