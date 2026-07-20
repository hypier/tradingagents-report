import { and, asc, eq, inArray, max } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

import * as schema from './schema';

export type WatchlistGroup = typeof schema.watchlistGroups.$inferSelect;
export type WatchlistItem = typeof schema.watchlistItems.$inferSelect;
export type WatchlistTag = typeof schema.watchlistTags.$inferSelect;

export type WatchlistItemWithTags = WatchlistItem & {
  tags: WatchlistTag[];
};

export type WatchlistGroupWithItems = WatchlistGroup & {
  items: WatchlistItemWithTags[];
};

export type WatchlistSnapshot = {
  groups: WatchlistGroupWithItems[];
  tags: WatchlistTag[];
};

export interface WatchlistRepository {
  getSnapshot(clerkUserId: string): Promise<WatchlistSnapshot>;
  ensureDefaultGroup(clerkUserId: string): Promise<WatchlistGroup>;
  createGroup(input: {
    clerkUserId: string;
    name: string;
  }): Promise<WatchlistGroup>;
  renameGroup(input: {
    clerkUserId: string;
    groupId: string;
    name: string;
  }): Promise<WatchlistGroup>;
  deleteGroup(input: { clerkUserId: string; groupId: string }): Promise<void>;
  addItem(input: {
    clerkUserId: string;
    groupId?: string;
    exchange: string;
    symbol: string;
    displayTicker: string;
    providerSymbol: string;
    displayName: string;
    logoUrl?: string | null;
    notes?: string | null;
  }): Promise<WatchlistItem>;
  removeItem(input: { clerkUserId: string; itemId: string }): Promise<void>;
  reorderItems(input: {
    clerkUserId: string;
    groupId: string;
    itemIds: string[];
  }): Promise<void>;
  createTag(input: {
    clerkUserId: string;
    name: string;
    color?: string | null;
  }): Promise<WatchlistTag>;
  deleteTag(input: { clerkUserId: string; tagId: string }): Promise<void>;
  setItemTags(input: {
    clerkUserId: string;
    itemId: string;
    tagIds: string[];
  }): Promise<void>;
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
      const [groups, items, tags, links] = await Promise.all([
        database
          .select()
          .from(schema.watchlistGroups)
          .where(eq(schema.watchlistGroups.clerkUserId, clerkUserId))
          .orderBy(
            asc(schema.watchlistGroups.sortOrder),
            asc(schema.watchlistGroups.createdAt),
          ),
        database
          .select()
          .from(schema.watchlistItems)
          .where(eq(schema.watchlistItems.clerkUserId, clerkUserId))
          .orderBy(
            asc(schema.watchlistItems.sortOrder),
            asc(schema.watchlistItems.createdAt),
          ),
        database
          .select()
          .from(schema.watchlistTags)
          .where(eq(schema.watchlistTags.clerkUserId, clerkUserId))
          .orderBy(asc(schema.watchlistTags.name)),
        database
          .select({
            itemId: schema.watchlistItemTags.itemId,
            tagId: schema.watchlistItemTags.tagId,
          })
          .from(schema.watchlistItemTags)
          .innerJoin(
            schema.watchlistItems,
            eq(schema.watchlistItemTags.itemId, schema.watchlistItems.id),
          )
          .where(eq(schema.watchlistItems.clerkUserId, clerkUserId)),
      ]);

      const tagsById = Object.fromEntries(tags.map((tag) => [tag.id, tag]));
      const tagIdsByItem = new Map<string, string[]>();
      for (const link of links) {
        const current = tagIdsByItem.get(link.itemId) ?? [];
        current.push(link.tagId);
        tagIdsByItem.set(link.itemId, current);
      }

      const itemsByGroup = new Map<string, WatchlistItemWithTags[]>();
      for (const item of items) {
        const itemTags = (tagIdsByItem.get(item.id) ?? [])
          .map((tagId) => tagsById[tagId])
          .filter(Boolean) as WatchlistTag[];
        const current = itemsByGroup.get(item.groupId) ?? [];
        current.push({ ...item, tags: itemTags });
        itemsByGroup.set(item.groupId, current);
      }

      return {
        groups: groups.map((group) => ({
          ...group,
          items: itemsByGroup.get(group.id) ?? [],
        })),
        tags,
      };
    },

    async ensureDefaultGroup(clerkUserId) {
      const [existing] = await database
        .select()
        .from(schema.watchlistGroups)
        .where(eq(schema.watchlistGroups.clerkUserId, clerkUserId))
        .orderBy(asc(schema.watchlistGroups.sortOrder))
        .limit(1);
      if (existing) return existing;
      const [created] = await database
        .insert(schema.watchlistGroups)
        .values({
          clerkUserId,
          name: 'Watchlist',
          sortOrder: 0,
        })
        .returning();
      return created!;
    },

    async createGroup({ clerkUserId, name }) {
      const [{ value: maxSort } = { value: null }] = await database
        .select({ value: max(schema.watchlistGroups.sortOrder) })
        .from(schema.watchlistGroups)
        .where(eq(schema.watchlistGroups.clerkUserId, clerkUserId));
      const [created] = await database
        .insert(schema.watchlistGroups)
        .values({
          clerkUserId,
          name: name.trim(),
          sortOrder: (maxSort ?? -1) + 1,
        })
        .returning();
      return created!;
    },

    async renameGroup({ clerkUserId, groupId, name }) {
      const [updated] = await database
        .update(schema.watchlistGroups)
        .set({ name: name.trim(), updatedAt: new Date() })
        .where(
          and(
            eq(schema.watchlistGroups.id, groupId),
            eq(schema.watchlistGroups.clerkUserId, clerkUserId),
          ),
        )
        .returning();
      if (!updated) {
        throw new WatchlistRepositoryError('NOT_FOUND', 'Watchlist group not found');
      }
      return updated;
    },

    async deleteGroup({ clerkUserId, groupId }) {
      const deleted = await database
        .delete(schema.watchlistGroups)
        .where(
          and(
            eq(schema.watchlistGroups.id, groupId),
            eq(schema.watchlistGroups.clerkUserId, clerkUserId),
          ),
        )
        .returning({ id: schema.watchlistGroups.id });
      if (!deleted.length) {
        throw new WatchlistRepositoryError('NOT_FOUND', 'Watchlist group not found');
      }
    },

    async addItem(input) {
      const group =
        input.groupId != null
          ? (
              await database
                .select()
                .from(schema.watchlistGroups)
                .where(
                  and(
                    eq(schema.watchlistGroups.id, input.groupId),
                    eq(schema.watchlistGroups.clerkUserId, input.clerkUserId),
                  ),
                )
                .limit(1)
            )[0]
          : await this.ensureDefaultGroup(input.clerkUserId);
      if (!group) {
        throw new WatchlistRepositoryError('NOT_FOUND', 'Watchlist group not found');
      }

      const providerSymbol = input.providerSymbol.trim().toUpperCase();
      const [{ value: maxSort } = { value: null }] = await database
        .select({ value: max(schema.watchlistItems.sortOrder) })
        .from(schema.watchlistItems)
        .where(eq(schema.watchlistItems.groupId, group.id));

      try {
        const [created] = await database
          .insert(schema.watchlistItems)
          .values({
            groupId: group.id,
            clerkUserId: input.clerkUserId,
            exchange: input.exchange.trim().toUpperCase(),
            symbol: input.symbol.trim().toUpperCase(),
            displayTicker: input.displayTicker.trim().toUpperCase(),
            providerSymbol,
            displayName: input.displayName.trim() || input.displayTicker,
            logoUrl: input.logoUrl ?? null,
            notes: input.notes ?? null,
            sortOrder: (maxSort ?? -1) + 1,
          })
          .returning();
        return created!;
      } catch (error) {
        if (isUniqueViolation(error)) {
          throw new WatchlistRepositoryError(
            'ALREADY_EXISTS',
            'Instrument is already on this watchlist group',
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

    async reorderItems({ clerkUserId, groupId, itemIds }) {
      const items = await database
        .select()
        .from(schema.watchlistItems)
        .where(
          and(
            eq(schema.watchlistItems.groupId, groupId),
            eq(schema.watchlistItems.clerkUserId, clerkUserId),
          ),
        );
      const owned = new Set(items.map((item) => item.id));
      if (itemIds.some((id) => !owned.has(id)) || itemIds.length !== items.length) {
        throw new WatchlistRepositoryError(
          'INVALID_ORDER',
          'Watchlist reorder must include every item in the group',
        );
      }
      await database.transaction(async (tx) => {
        for (const [index, itemId] of itemIds.entries()) {
          await tx
            .update(schema.watchlistItems)
            .set({ sortOrder: index, updatedAt: new Date() })
            .where(eq(schema.watchlistItems.id, itemId));
        }
      });
    },

    async createTag({ clerkUserId, name, color }) {
      try {
        const [created] = await database
          .insert(schema.watchlistTags)
          .values({
            clerkUserId,
            name: name.trim(),
            color: color ?? null,
          })
          .returning();
        return created!;
      } catch (error) {
        if (isUniqueViolation(error)) {
          throw new WatchlistRepositoryError(
            'ALREADY_EXISTS',
            'Watchlist tag already exists',
          );
        }
        throw error;
      }
    },

    async deleteTag({ clerkUserId, tagId }) {
      const deleted = await database
        .delete(schema.watchlistTags)
        .where(
          and(
            eq(schema.watchlistTags.id, tagId),
            eq(schema.watchlistTags.clerkUserId, clerkUserId),
          ),
        )
        .returning({ id: schema.watchlistTags.id });
      if (!deleted.length) {
        throw new WatchlistRepositoryError('NOT_FOUND', 'Watchlist tag not found');
      }
    },

    async setItemTags({ clerkUserId, itemId, tagIds }) {
      const [item] = await database
        .select()
        .from(schema.watchlistItems)
        .where(
          and(
            eq(schema.watchlistItems.id, itemId),
            eq(schema.watchlistItems.clerkUserId, clerkUserId),
          ),
        );
      if (!item) {
        throw new WatchlistRepositoryError('NOT_FOUND', 'Watchlist item not found');
      }
      const uniqueTagIds = [...new Set(tagIds)];
      if (uniqueTagIds.length) {
        const ownedTags = await database
          .select({ id: schema.watchlistTags.id })
          .from(schema.watchlistTags)
          .where(
            and(
              eq(schema.watchlistTags.clerkUserId, clerkUserId),
              inArray(schema.watchlistTags.id, uniqueTagIds),
            ),
          );
        if (ownedTags.length !== uniqueTagIds.length) {
          throw new WatchlistRepositoryError('NOT_FOUND', 'Watchlist tag not found');
        }
      }
      await database.transaction(async (tx) => {
        await tx
          .delete(schema.watchlistItemTags)
          .where(eq(schema.watchlistItemTags.itemId, itemId));
        if (uniqueTagIds.length) {
          await tx.insert(schema.watchlistItemTags).values(
            uniqueTagIds.map((tagId) => ({ itemId, tagId })),
          );
        }
      });
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
