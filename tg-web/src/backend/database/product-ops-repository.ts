/**
 * P3 产品运营仓库：设置、市场、额度规则、审计。
 */
import { and, desc, eq, gte, lte } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

import * as schema from './schema';

type Database = NodePgDatabase<typeof schema>;

export type MarketMetadata = typeof schema.marketMetadata.$inferSelect;
export type CreditRule = typeof schema.creditRules.$inferSelect;
export type AdminAuditEvent = typeof schema.adminAuditEvents.$inferSelect;
export type ProductSetting = typeof schema.productSettings.$inferSelect;

export type ProductSettingsRepository = {
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
  list(input?: { enabledOnly?: boolean }): Promise<MarketMetadata[]>;
  get(code: string): Promise<MarketMetadata | undefined>;
  upsert(input: {
    code: string;
    enabled: boolean;
    displayName: string;
    timezone: string;
    currency: string;
    sessionNotes?: string | null;
    disclaimer?: string | null;
    sortOrder: number;
  }): Promise<MarketMetadata>;
  setEnabled(code: string, enabled: boolean): Promise<MarketMetadata | undefined>;
};

export type CreditRulesRepository = {
  list(): Promise<CreditRule[]>;
  listEnabled(): Promise<CreditRule[]>;
  create(input: {
    label: string;
    market: string | null;
    minAnalysts: number;
    maxAnalysts: number;
    units: number;
    enabled: boolean;
    priority: number;
  }): Promise<CreditRule>;
  update(
    id: string,
    input: Partial<{
      label: string;
      market: string | null;
      minAnalysts: number;
      maxAnalysts: number;
      units: number;
      enabled: boolean;
      priority: number;
    }>,
  ): Promise<CreditRule | undefined>;
  delete(id: string): Promise<boolean>;
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

export function createProductSettingsRepository(
  database: Database,
): ProductSettingsRepository {
  return {
    async getAll() {
      const rows = await database.select().from(schema.productSettings);
      return Object.fromEntries(rows.map((row) => [row.key, row.value]));
    },
    async get(key) {
      const [row] = await database
        .select()
        .from(schema.productSettings)
        .where(eq(schema.productSettings.key, key))
        .limit(1);
      return row?.value ?? null;
    },
    async set(key, value, updatedBy) {
      const [row] = await database
        .insert(schema.productSettings)
        .values({
          key,
          value,
          updatedBy,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: schema.productSettings.key,
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
          .from(schema.marketMetadata)
          .where(eq(schema.marketMetadata.enabled, 1))
          .orderBy(schema.marketMetadata.sortOrder);
      }
      return database
        .select()
        .from(schema.marketMetadata)
        .orderBy(schema.marketMetadata.sortOrder);
    },
    async get(code) {
      const [row] = await database
        .select()
        .from(schema.marketMetadata)
        .where(eq(schema.marketMetadata.code, code))
        .limit(1);
      return row;
    },
    async upsert(input) {
      const [row] = await database
        .insert(schema.marketMetadata)
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
          target: schema.marketMetadata.code,
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
        .update(schema.marketMetadata)
        .set({ enabled: enabled ? 1 : 0, updatedAt: new Date() })
        .where(eq(schema.marketMetadata.code, code))
        .returning();
      return row;
    },
  };
}

export function createCreditRulesRepository(
  database: Database,
): CreditRulesRepository {
  return {
    list() {
      return database
        .select()
        .from(schema.creditRules)
        .orderBy(desc(schema.creditRules.priority), schema.creditRules.label);
    },
    listEnabled() {
      return database
        .select()
        .from(schema.creditRules)
        .where(eq(schema.creditRules.enabled, 1))
        .orderBy(desc(schema.creditRules.priority));
    },
    async create(input) {
      const [row] = await database
        .insert(schema.creditRules)
        .values({
          label: input.label,
          market: input.market,
          minAnalysts: input.minAnalysts,
          maxAnalysts: input.maxAnalysts,
          units: input.units,
          enabled: input.enabled ? 1 : 0,
          priority: input.priority,
        })
        .returning();
      return row;
    },
    async update(id, input) {
      const patch: Partial<typeof schema.creditRules.$inferInsert> = {
        updatedAt: new Date(),
      };
      if (input.label !== undefined) patch.label = input.label;
      if (input.market !== undefined) patch.market = input.market;
      if (input.minAnalysts !== undefined) patch.minAnalysts = input.minAnalysts;
      if (input.maxAnalysts !== undefined) patch.maxAnalysts = input.maxAnalysts;
      if (input.units !== undefined) patch.units = input.units;
      if (input.enabled !== undefined) patch.enabled = input.enabled ? 1 : 0;
      if (input.priority !== undefined) patch.priority = input.priority;
      const [row] = await database
        .update(schema.creditRules)
        .set(patch)
        .where(eq(schema.creditRules.id, id))
        .returning();
      return row;
    },
    async delete(id) {
      const rows = await database
        .delete(schema.creditRules)
        .where(eq(schema.creditRules.id, id))
        .returning({ id: schema.creditRules.id });
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
