/**
 * P3 产品运营仓库：系统设置、市场配置、操作日志。
 */
import { and, desc, eq, gte, lte } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

import * as schema from './schema';

type Database = NodePgDatabase<typeof schema>;

export type MarketConfig = typeof schema.marketConfigs.$inferSelect;
export type AdminAuditEvent = typeof schema.adminAuditEvents.$inferSelect;
export type SystemSetting = typeof schema.systemSettings.$inferSelect;

export type SystemSettingsRepository = {
  getAll(): Promise<Record<string, Record<string, unknown>>>;
  get(key: string): Promise<Record<string, unknown> | null>;
  set(
    key: string,
    value: Record<string, unknown>,
    updatedBy: string | null,
  ): Promise<Record<string, unknown>>;
  setMany(
    entries: Array<{ key: string; value: Record<string, unknown> }>,
    updatedBy: string | null,
  ): Promise<Record<string, Record<string, unknown>>>;
};

export type MarketsRepository = {
  list(input?: { enabledOnly?: boolean }): Promise<MarketConfig[]>;
  get(code: string): Promise<MarketConfig | undefined>;
  upsert(input: {
    code: string;
    enabled: boolean;
    displayName: string;
    timezone: string;
    currency: string;
    sessionNotes?: string | null;
    disclaimer?: string | null;
    sortOrder: number;
  }): Promise<MarketConfig>;
  setEnabled(code: string, enabled: boolean): Promise<MarketConfig | undefined>;
};

export type AdminAuditRepository = {
  record(input: {
    actorClerkUserId: string;
    action: string;
    targetType?: string | null;
    targetId?: string | null;
    metadata?: Record<string, unknown>;
  }): Promise<AdminAuditEvent>;
  list(input: {
    action?: string;
    actorClerkUserId?: string;
    from?: Date;
    to?: Date;
    limit: number;
    offset: number;
  }): Promise<AdminAuditEvent[]>;
};

export function createSystemSettingsRepository(
  database: Database,
): SystemSettingsRepository {
  return {
    async getAll() {
      const rows = await database.select().from(schema.systemSettings);
      return Object.fromEntries(rows.map((row) => [row.key, row.value]));
    },
    async get(key) {
      const [row] = await database
        .select()
        .from(schema.systemSettings)
        .where(eq(schema.systemSettings.key, key))
        .limit(1);
      return row?.value ?? null;
    },
    async set(key, value, updatedBy) {
      const [row] = await database
        .insert(schema.systemSettings)
        .values({
          key,
          value,
          updatedBy,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: schema.systemSettings.key,
          set: {
            value,
            updatedBy,
            updatedAt: new Date(),
          },
        })
        .returning();
      return row.value;
    },
    async setMany(entries, updatedBy) {
      for (const entry of entries) {
        await this.set(entry.key, entry.value, updatedBy);
      }
      return this.getAll();
    },
  };
}

export function createMarketsRepository(database: Database): MarketsRepository {
  return {
    list(input) {
      if (input?.enabledOnly) {
        return database
          .select()
          .from(schema.marketConfigs)
          .where(eq(schema.marketConfigs.enabled, 1))
          .orderBy(schema.marketConfigs.sortOrder);
      }
      return database
        .select()
        .from(schema.marketConfigs)
        .orderBy(schema.marketConfigs.sortOrder);
    },
    async get(code) {
      const [row] = await database
        .select()
        .from(schema.marketConfigs)
        .where(eq(schema.marketConfigs.code, code))
        .limit(1);
      return row;
    },
    async upsert(input) {
      const [row] = await database
        .insert(schema.marketConfigs)
        .values({
          code: input.code.toUpperCase(),
          enabled: input.enabled ? 1 : 0,
          displayName: input.displayName,
          timezone: input.timezone,
          currency: input.currency,
          sessionNotes: input.sessionNotes ?? null,
          disclaimer: input.disclaimer ?? null,
          sortOrder: input.sortOrder,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: schema.marketConfigs.code,
          set: {
            enabled: input.enabled ? 1 : 0,
            displayName: input.displayName,
            timezone: input.timezone,
            currency: input.currency,
            sessionNotes: input.sessionNotes ?? null,
            disclaimer: input.disclaimer ?? null,
            sortOrder: input.sortOrder,
            updatedAt: new Date(),
          },
        })
        .returning();
      return row;
    },
    async setEnabled(code, enabled) {
      const [row] = await database
        .update(schema.marketConfigs)
        .set({ enabled: enabled ? 1 : 0, updatedAt: new Date() })
        .where(eq(schema.marketConfigs.code, code))
        .returning();
      return row;
    },
  };
}

export function createAdminAuditRepository(
  database: Database,
): AdminAuditRepository {
  return {
    async record(input) {
      const [row] = await database
        .insert(schema.adminAuditEvents)
        .values({
          actorClerkUserId: input.actorClerkUserId,
          action: input.action,
          targetType: input.targetType ?? null,
          targetId: input.targetId ?? null,
          metadata: input.metadata ?? {},
        })
        .returning();
      return row;
    },
    list(input) {
      const conditions = [];
      if (input.action) {
        conditions.push(eq(schema.adminAuditEvents.action, input.action));
      }
      if (input.actorClerkUserId) {
        conditions.push(
          eq(schema.adminAuditEvents.actorClerkUserId, input.actorClerkUserId),
        );
      }
      if (input.from) {
        conditions.push(gte(schema.adminAuditEvents.createdAt, input.from));
      }
      if (input.to) {
        conditions.push(lte(schema.adminAuditEvents.createdAt, input.to));
      }
      return database
        .select()
        .from(schema.adminAuditEvents)
        .where(conditions.length ? and(...conditions) : undefined)
        .orderBy(desc(schema.adminAuditEvents.createdAt))
        .limit(input.limit)
        .offset(input.offset);
    },
  };
}
