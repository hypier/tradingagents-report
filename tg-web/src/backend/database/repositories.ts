/**
 * 仓库组合入口。
 *
 * - 账户 / 计费 / 自选 / 报告元数据放在独立文件中。
 * - 分析任务、LLM 价格、定价来源、管理员 Stripe 配置等轻量 CRUD 在此内联定义。
 */
import { and, desc, eq, gte, lte, sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

import { analysisJobs, llmModelPrices, llmPricingSources } from './schema';
import * as schema from './schema';
import {
  createAccountRepository,
  type AccountRepository,
} from './account-repository';
import {
  createBillingRepository,
  type BillingRepository,
} from './billing-repository';
import {
  createReportMetaRepository,
  type ReportMetaRepository,
} from './report-meta-repository';
import {
  createWatchlistRepository,
  type WatchlistRepository,
} from './watchlist-repository';

export type { AccountRepository } from './account-repository';
export type { BillingRepository } from './billing-repository';
export type { ReportMetaRepository } from './report-meta-repository';
export type { WatchlistRepository } from './watchlist-repository';

export type AnalysisJob = typeof analysisJobs.$inferSelect;
export type ModelPrice = typeof llmModelPrices.$inferSelect;
export type NewModelPrice = typeof llmModelPrices.$inferInsert;
export type PricingSource = typeof llmPricingSources.$inferSelect;
export type ModelPriceKey = Pick<
  ModelPrice,
  'provider' | 'model' | 'billingMode' | 'contextTier'
>;

export type UserAnalysisListItem = {
  job: AnalysisJob;
  creditUnits: number | null;
  isFavorite: boolean;
  isArchived: boolean;
};

/** `analysis_jobs` 的只读访问，供管理/列表路径使用。 */
export type AnalysisJobsRepository = {
  getById(id: string): Promise<AnalysisJob | undefined>;
  list(input: {
    ticker?: string;
    status?: AnalysisJob['status'];
    limit: number;
    offset: number;
  }): Promise<AnalysisJob[]>;
  listForUser(input: {
    clerkUserId: string;
    ticker?: string;
    exchange?: string;
    status?: AnalysisJob['status'];
    tradeDateFrom?: string;
    tradeDateTo?: string;
    favorite?: boolean;
    archived?: boolean;
    limit: number;
    offset: number;
  }): Promise<UserAnalysisListItem[]>;
  ownsJob(clerkUserId: string, analysisJobId: string): Promise<boolean>;
  getReservationUnits(
    clerkUserId: string,
    analysisJobId: string,
  ): Promise<number | null>;
};

/** `llm_model_prices` 的 upsert / 删除辅助。 */
export type ModelPricesRepository = {
  list(input: { provider?: string }): Promise<ModelPrice[]>;
  upsert(input: NewModelPrice): Promise<ModelPrice>;
  delete(key: ModelPriceKey): Promise<void>;
};

/** `llm_pricing_sources` 的读取辅助。 */
export type PricingSourcesRepository = {
  list(): Promise<PricingSource[]>;
};

/**
 * 管理员 Stripe 凭据存储（`billing_provider_configs`）。
 * 与负责用户账单/积分状态的 `BillingRepository` 不同。
 */
export type BillingConfigRepository = {
  getStripe(): Promise<
    typeof schema.billingProviderConfigs.$inferSelect | undefined
  >;
  setStripe(input: {
    secretKeyCiphertext: string;
    webhookSecretCiphertext: string;
    actorClerkUserId: string;
  }): Promise<void>;
  clearStripe(actorClerkUserId: string): Promise<void>;
};

type Database = NodePgDatabase<typeof schema>;

/** 将全部仓库绑定到同一个 Drizzle 数据库实例。 */
export function createRepositories(database: Database): {
  analysisJobs: AnalysisJobsRepository;
  modelPrices: ModelPricesRepository;
  pricingSources: PricingSourcesRepository;
  account: AccountRepository;
  billing: BillingRepository;
  billingConfig: BillingConfigRepository;
  watchlist: WatchlistRepository;
  reportMeta: ReportMetaRepository;
} {
  return {
    account: createAccountRepository(database),
    billing: createBillingRepository(database),
    watchlist: createWatchlistRepository(database),
    reportMeta: createReportMetaRepository(database),
    billingConfig: {
      async getStripe() {
        const [configuration] = await database
          .select()
          .from(schema.billingProviderConfigs)
          .where(eq(schema.billingProviderConfigs.provider, 'stripe'));
        return configuration;
      },
      async setStripe(input) {
        await database.transaction(async (tx) => {
          await tx
            .insert(schema.billingProviderConfigs)
            .values({
              provider: 'stripe',
              secretKeyCiphertext: input.secretKeyCiphertext,
              webhookSecretCiphertext: input.webhookSecretCiphertext,
              updatedByClerkUserId: input.actorClerkUserId,
            })
            .onConflictDoUpdate({
              target: schema.billingProviderConfigs.provider,
              set: {
                secretKeyCiphertext: input.secretKeyCiphertext,
                webhookSecretCiphertext: input.webhookSecretCiphertext,
                updatedByClerkUserId: input.actorClerkUserId,
                updatedAt: new Date(),
              },
            });
          await tx.insert(schema.billingConfigAuditEvents).values({
            provider: 'stripe',
            action: 'configured',
            actorClerkUserId: input.actorClerkUserId,
          });
        });
      },
      async clearStripe(actorClerkUserId) {
        await database.transaction(async (tx) => {
          await tx
            .delete(schema.billingProviderConfigs)
            .where(eq(schema.billingProviderConfigs.provider, 'stripe'));
          await tx.insert(schema.billingConfigAuditEvents).values({
            provider: 'stripe',
            action: 'cleared',
            actorClerkUserId,
          });
        });
      },
    },
    analysisJobs: {
      async getById(id) {
        const [analysisJob] = await database
          .select()
          .from(analysisJobs)
          .where(eq(analysisJobs.id, id));

        return analysisJob;
      },
      list(input) {
        const where = input.ticker
          ? input.status
            ? and(
                eq(analysisJobs.ticker, input.ticker),
                eq(analysisJobs.status, input.status),
              )
            : eq(analysisJobs.ticker, input.ticker)
          : input.status
            ? eq(analysisJobs.status, input.status)
            : undefined;

        return database
          .select()
          .from(analysisJobs)
          .where(where)
          .orderBy(desc(analysisJobs.createdAt))
          .limit(input.limit)
          .offset(input.offset);
      },
      async listForUser(input) {
        const conditions = [
          eq(schema.creditReservations.clerkUserId, input.clerkUserId),
          sql`${schema.creditReservations.analysisJobId} is not null`,
        ];
        if (input.ticker) {
          conditions.push(
            eq(analysisJobs.ticker, input.ticker.trim().toUpperCase()),
          );
        }
        if (input.exchange) {
          conditions.push(
            eq(analysisJobs.exchange, input.exchange.trim().toUpperCase()),
          );
        }
        if (input.status) {
          conditions.push(eq(analysisJobs.status, input.status));
        }
        if (input.tradeDateFrom) {
          conditions.push(gte(analysisJobs.tradeDate, input.tradeDateFrom));
        }
        if (input.tradeDateTo) {
          conditions.push(lte(analysisJobs.tradeDate, input.tradeDateTo));
        }
        if (input.favorite === true) {
          conditions.push(eq(schema.userReportMeta.isFavorite, 1));
        }
        if (input.archived === true) {
          conditions.push(eq(schema.userReportMeta.isArchived, 1));
        } else if (input.archived === false) {
          conditions.push(
            sql`coalesce(${schema.userReportMeta.isArchived}, 0) = 0`,
          );
        }

        const rows = await database
          .select({
            job: analysisJobs,
            creditUnits: schema.creditReservations.units,
            isFavorite: schema.userReportMeta.isFavorite,
            isArchived: schema.userReportMeta.isArchived,
          })
          .from(schema.creditReservations)
          .innerJoin(
            analysisJobs,
            eq(schema.creditReservations.analysisJobId, analysisJobs.id),
          )
          .leftJoin(
            schema.userReportMeta,
            and(
              eq(schema.userReportMeta.clerkUserId, input.clerkUserId),
              eq(schema.userReportMeta.analysisJobId, analysisJobs.id),
            ),
          )
          .where(and(...conditions))
          .orderBy(desc(analysisJobs.createdAt))
          .limit(input.limit)
          .offset(input.offset);

        return rows.map((row) => ({
          job: row.job,
          creditUnits: row.creditUnits,
          isFavorite: Boolean(row.isFavorite),
          isArchived: Boolean(row.isArchived),
        }));
      },
      async ownsJob(clerkUserId, analysisJobId) {
        const [row] = await database
          .select({ id: schema.creditReservations.requestId })
          .from(schema.creditReservations)
          .where(
            and(
              eq(schema.creditReservations.clerkUserId, clerkUserId),
              eq(schema.creditReservations.analysisJobId, analysisJobId),
            ),
          )
          .limit(1);
        return Boolean(row);
      },
      async getReservationUnits(clerkUserId, analysisJobId) {
        const [row] = await database
          .select({ units: schema.creditReservations.units })
          .from(schema.creditReservations)
          .where(
            and(
              eq(schema.creditReservations.clerkUserId, clerkUserId),
              eq(schema.creditReservations.analysisJobId, analysisJobId),
            ),
          )
          .limit(1);
        return row?.units ?? null;
      },
    },
    modelPrices: {
      list(input) {
        return database
          .select()
          .from(llmModelPrices)
          .where(
            input.provider
              ? eq(llmModelPrices.provider, input.provider)
              : undefined,
          );
      },
      async upsert(input) {
        const [modelPrice] = await database
          .insert(llmModelPrices)
          .values(input)
          .onConflictDoUpdate({
            target: [
              llmModelPrices.provider,
              llmModelPrices.model,
              llmModelPrices.billingMode,
              llmModelPrices.contextTier,
            ],
            set: {
              currency: input.currency,
              unitTokens: input.unitTokens,
              inputPrice: input.inputPrice,
              cachedInputPrice: input.cachedInputPrice,
              cacheWritePrice: input.cacheWritePrice,
              outputPrice: input.outputPrice,
              sourceUrl: input.sourceUrl,
              updatedAt: new Date(),
            },
          })
          .returning();

        return modelPrice!;
      },
      async delete(key) {
        await database
          .delete(llmModelPrices)
          .where(
            and(
              eq(llmModelPrices.provider, key.provider),
              eq(llmModelPrices.model, key.model),
              eq(llmModelPrices.billingMode, key.billingMode),
              eq(llmModelPrices.contextTier, key.contextTier),
            ),
          );
      },
    },
    pricingSources: {
      list() {
        return database.select().from(llmPricingSources);
      },
    },
  };
}
