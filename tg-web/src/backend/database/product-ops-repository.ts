/**
 * P3 产品运营仓库：系统设置、分析交易所门禁、操作日志。
 */
import { and, desc, eq, gte, lte } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

import * as schema from './schema';

type Database = NodePgDatabase<typeof schema>;

export type AnalysisExchange = typeof schema.analysisExchanges.$inferSelect;
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

export type AnalysisExchangesRepository = {
  list(input?: { enabledOnly?: boolean }): Promise<AnalysisExchange[]>;
  get(exchange: string): Promise<AnalysisExchange | undefined>;
  isEnabled(exchange: string): Promise<boolean>;
  upsert(input: {
    exchange: string;
    enabled: boolean;
    displayName: string;
    market?: string | null;
  }): Promise<AnalysisExchange>;
  remove(exchange: string): Promise<boolean>;
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

export function createAnalysisExchangesRepository(
  database: Database,
): AnalysisExchangesRepository {
  return {
    list(input) {
      if (input?.enabledOnly) {
        return database
          .select()
          .from(schema.analysisExchanges)
          .where(eq(schema.analysisExchanges.enabled, 1))
          .orderBy(schema.analysisExchanges.exchange);
      }
      return database
        .select()
        .from(schema.analysisExchanges)
        .orderBy(schema.analysisExchanges.exchange);
    },
    async get(exchange) {
      const [row] = await database
        .select()
        .from(schema.analysisExchanges)
        .where(eq(schema.analysisExchanges.exchange, exchange.toUpperCase()))
        .limit(1);
      return row;
    },
    async isEnabled(exchange) {
      const row = await this.get(exchange);
      return Boolean(row && row.enabled);
    },
    async upsert(input) {
      const exchange = input.exchange.trim().toUpperCase();
      const [row] = await database
        .insert(schema.analysisExchanges)
        .values({
          exchange,
          enabled: input.enabled ? 1 : 0,
          displayName: input.displayName,
          market: input.market?.trim().toUpperCase() || null,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: schema.analysisExchanges.exchange,
          set: {
            enabled: input.enabled ? 1 : 0,
            displayName: input.displayName,
            market: input.market?.trim().toUpperCase() || null,
            updatedAt: new Date(),
          },
        })
        .returning();
      return row;
    },
    async remove(exchange) {
      const rows = await database
        .delete(schema.analysisExchanges)
        .where(
          eq(schema.analysisExchanges.exchange, exchange.trim().toUpperCase()),
        )
        .returning();
      return rows.length > 0;
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
