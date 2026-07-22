import { and, asc, eq, inArray } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

import { llmModels, llmProviders } from './schema';
import * as schema from './schema';

export type LlmProviderRow = typeof llmProviders.$inferSelect;
export type LlmModelRow = typeof llmModels.$inferSelect;

export type LlmProviderUpsertInput = {
  id: string;
  displayName: string;
  enabled: boolean;
  backendUrl?: string | null;
  apiKeyCiphertext?: string | null;
  apiKeyHint?: string | null;
  sortOrder?: number;
  notes?: string | null;
  /** When false, leave existing key columns unchanged. */
  updateApiKey?: boolean;
  clearApiKey?: boolean;
};

export type LlmModelUpsertInput = {
  providerId: string;
  model: string;
  displayName: string;
  role: string;
  enabled: boolean;
  currency?: string;
  unitTokens?: number;
  inputPrice?: string | null;
  outputPrice?: string | null;
  cachedInputPrice?: string | null;
  cacheWritePrice?: string | null;
  contextWindow?: number | null;
  maxOutputTokens?: number | null;
  params?: Record<string, unknown>;
  capabilities?: Record<string, unknown>;
  syncedAt?: Date | null;
  syncError?: string | null;
};

export type LlmCatalogRepository = {
  listProviders(): Promise<LlmProviderRow[]>;
  getProvider(id: string): Promise<LlmProviderRow | null>;
  upsertProvider(input: LlmProviderUpsertInput): Promise<LlmProviderRow>;
  deleteProvider(id: string): Promise<boolean>;
  clearProviderApiKey(id: string): Promise<LlmProviderRow | null>;
  listModels(input?: {
    providerId?: string;
    enabledOnly?: boolean;
  }): Promise<LlmModelRow[]>;
  getModel(id: string): Promise<LlmModelRow | null>;
  createModel(input: LlmModelUpsertInput): Promise<LlmModelRow>;
  updateModel(
    id: string,
    input: Partial<LlmModelUpsertInput>,
  ): Promise<LlmModelRow | null>;
  deleteModel(id: string): Promise<boolean>;
  getModelsByIds(ids: string[]): Promise<LlmModelRow[]>;
};

type Database = NodePgDatabase<typeof schema>;

export function createLlmCatalogRepository(
  database: Database,
): LlmCatalogRepository {
  return {
    listProviders() {
      return database
        .select()
        .from(llmProviders)
        .orderBy(asc(llmProviders.sortOrder), asc(llmProviders.id));
    },
    async getProvider(id) {
      const [row] = await database
        .select()
        .from(llmProviders)
        .where(eq(llmProviders.id, id))
        .limit(1);
      return row ?? null;
    },
    async upsertProvider(input) {
      const existing = await this.getProvider(input.id);
      if (!existing) {
        const [created] = await database
          .insert(llmProviders)
          .values({
            id: input.id,
            displayName: input.displayName,
            enabled: input.enabled,
            backendUrl: input.backendUrl ?? null,
            apiKeyCiphertext: input.clearApiKey
              ? null
              : (input.apiKeyCiphertext ?? null),
            apiKeyHint: input.clearApiKey ? null : (input.apiKeyHint ?? null),
            sortOrder: input.sortOrder ?? 0,
            notes: input.notes ?? null,
          })
          .returning();
        return created!;
      }

      const set: Partial<typeof llmProviders.$inferInsert> = {
        displayName: input.displayName,
        enabled: input.enabled,
        backendUrl: input.backendUrl ?? null,
        sortOrder: input.sortOrder ?? existing.sortOrder,
        notes: input.notes ?? null,
        updatedAt: new Date(),
      };
      if (input.clearApiKey) {
        set.apiKeyCiphertext = null;
        set.apiKeyHint = null;
      } else if (input.updateApiKey) {
        set.apiKeyCiphertext = input.apiKeyCiphertext ?? null;
        set.apiKeyHint = input.apiKeyHint ?? null;
      }

      const [updated] = await database
        .update(llmProviders)
        .set(set)
        .where(eq(llmProviders.id, input.id))
        .returning();
      return updated!;
    },
    async deleteProvider(id) {
      const deleted = await database
        .delete(llmProviders)
        .where(eq(llmProviders.id, id))
        .returning({ id: llmProviders.id });
      return deleted.length > 0;
    },
    async clearProviderApiKey(id) {
      const [updated] = await database
        .update(llmProviders)
        .set({
          apiKeyCiphertext: null,
          apiKeyHint: null,
          updatedAt: new Date(),
        })
        .where(eq(llmProviders.id, id))
        .returning();
      return updated ?? null;
    },
    listModels(input = {}) {
      const filters = [];
      if (input.providerId) {
        filters.push(eq(llmModels.providerId, input.providerId));
      }
      if (input.enabledOnly) {
        filters.push(eq(llmModels.enabled, true));
      }
      return database
        .select()
        .from(llmModels)
        .where(filters.length ? and(...filters) : undefined)
        .orderBy(asc(llmModels.providerId), asc(llmModels.model));
    },
    async getModel(id) {
      const [row] = await database
        .select()
        .from(llmModels)
        .where(eq(llmModels.id, id))
        .limit(1);
      return row ?? null;
    },
    async createModel(input) {
      const [created] = await database
        .insert(llmModels)
        .values({
          providerId: input.providerId,
          model: input.model,
          displayName: input.displayName,
          role: input.role,
          enabled: input.enabled,
          currency: input.currency ?? 'USD',
          unitTokens: input.unitTokens ?? 1_000_000,
          inputPrice: input.inputPrice ?? null,
          outputPrice: input.outputPrice ?? null,
          cachedInputPrice: input.cachedInputPrice ?? null,
          cacheWritePrice: input.cacheWritePrice ?? null,
          contextWindow: input.contextWindow ?? null,
          maxOutputTokens: input.maxOutputTokens ?? null,
          params: input.params ?? {},
          capabilities: input.capabilities ?? {},
          syncedAt: input.syncedAt ?? null,
          syncError: input.syncError ?? null,
        })
        .returning();
      return created!;
    },
    async updateModel(id, input) {
      const set: Partial<typeof llmModels.$inferInsert> = {
        updatedAt: new Date(),
      };
      if (input.providerId !== undefined) set.providerId = input.providerId;
      if (input.model !== undefined) set.model = input.model;
      if (input.displayName !== undefined) set.displayName = input.displayName;
      if (input.role !== undefined) set.role = input.role;
      if (input.enabled !== undefined) set.enabled = input.enabled;
      if (input.currency !== undefined) set.currency = input.currency;
      if (input.unitTokens !== undefined) set.unitTokens = input.unitTokens;
      if (input.inputPrice !== undefined) set.inputPrice = input.inputPrice;
      if (input.outputPrice !== undefined) set.outputPrice = input.outputPrice;
      if (input.cachedInputPrice !== undefined) {
        set.cachedInputPrice = input.cachedInputPrice;
      }
      if (input.cacheWritePrice !== undefined) {
        set.cacheWritePrice = input.cacheWritePrice;
      }
      if (input.contextWindow !== undefined) {
        set.contextWindow = input.contextWindow;
      }
      if (input.maxOutputTokens !== undefined) {
        set.maxOutputTokens = input.maxOutputTokens;
      }
      if (input.params !== undefined) set.params = input.params;
      if (input.capabilities !== undefined) {
        set.capabilities = input.capabilities;
      }
      if (input.syncedAt !== undefined) set.syncedAt = input.syncedAt;
      if (input.syncError !== undefined) set.syncError = input.syncError;

      const [updated] = await database
        .update(llmModels)
        .set(set)
        .where(eq(llmModels.id, id))
        .returning();
      return updated ?? null;
    },
    async deleteModel(id) {
      const deleted = await database
        .delete(llmModels)
        .where(eq(llmModels.id, id))
        .returning({ id: llmModels.id });
      return deleted.length > 0;
    },
    async getModelsByIds(ids) {
      if (!ids.length) return [];
      return database
        .select()
        .from(llmModels)
        .where(inArray(llmModels.id, ids));
    },
  };
}
