/**
 * 仓库组合入口。
 *
 * - 账户 / 计费 / 自选放在独立文件中。
 * - 分析任务、管理员 Stripe 配置等轻量 CRUD 在此内联定义。
 * - LLM 提供商/模型目录见 llm-catalog-repository。
 */
import { and, desc, eq, gt, gte, inArray, lte, sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

import { analysisJobs } from './schema';
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
  createLlmCatalogRepository,
  type LlmCatalogRepository,
} from './llm-catalog-repository';
import {
  createAdminAuditRepository,
  createCreditRulesRepository,
  createMarketsRepository,
  createProductSettingsRepository,
  type AdminAuditRepository,
  type CreditRulesRepository,
  type MarketsRepository,
  type ProductSettingsRepository,
} from './product-ops-repository';
import {
  createReferralRepository,
  type ReferralRepository,
} from './referral-repository';
import {
  createWatchlistRepository,
  type WatchlistRepository,
} from './watchlist-repository';

export type { AccountRepository } from './account-repository';
export type { BillingRepository } from './billing-repository';
export type {
  AdminAuditRepository,
  CreditRulesRepository,
  MarketsRepository,
  ProductSettingsRepository,
} from './product-ops-repository';
export type { ReferralRepository } from './referral-repository';
export type { WatchlistRepository } from './watchlist-repository';

export type AnalysisJob = typeof analysisJobs.$inferSelect;
export type { LlmCatalogRepository } from './llm-catalog-repository';

export type UserAnalysisListItem = {
  job: AnalysisJob;
  creditUnits: number | null;
};

export type AdminAnalysisListItem = {
  job: AnalysisJob;
  clerkUserId: string;
  creditUnits: number | null;
};

export type AdminOverviewMetrics = {
  userCount: number;
  activeSubscriptionCount: number;
  period: {
    from: string;
    to: string;
  };
  analyses: {
    total: number;
    succeeded: number;
    failed: number;
    queued: number;
    running: number;
    successRate: number | null;
  };
  credits: {
    availableTotal: number;
    reservedTotal: number;
    spentTotal: number;
    periodConsumed: number;
  };
  queue: {
    queued: number;
    running: number;
  };
  timing: {
    averageSucceededDurationSeconds: number | null;
  };
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
    /** Prefer reports whose ticker is on the user's watchlist. */
    watchlist?: boolean;
    limit: number;
    offset: number;
  }): Promise<UserAnalysisListItem[]>;
  listAllForAdmin(input: {
    clerkUserId?: string;
    ticker?: string;
    status?: AnalysisJob['status'];
    limit: number;
    offset: number;
  }): Promise<AdminAnalysisListItem[]>;
  getOwner(analysisJobId: string): Promise<string | null>;
  ownsJob(clerkUserId: string, analysisJobId: string): Promise<boolean>;
  getReservationUnits(
    clerkUserId: string,
    analysisJobId: string,
  ): Promise<number | null>;
  getAdminOverview(input: { from: Date; to: Date }): Promise<AdminOverviewMetrics>;
};

/** `billing_provider_configs` 的 upsert / 删除辅助。 */
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
  llmCatalog: LlmCatalogRepository;
  account: AccountRepository;
  billing: BillingRepository;
  referrals: ReferralRepository;
  billingConfig: BillingConfigRepository;
  watchlist: WatchlistRepository;
  settings: ProductSettingsRepository;
  markets: MarketsRepository;
  creditRules: CreditRulesRepository;
  audit: AdminAuditRepository;
} {
  return {
    account: createAccountRepository(database),
    billing: createBillingRepository(database),
    referrals: createReferralRepository(database),
    watchlist: createWatchlistRepository(database),
    settings: createProductSettingsRepository(database),
    markets: createMarketsRepository(database),
    creditRules: createCreditRulesRepository(database),
    audit: createAdminAuditRepository(database),
    llmCatalog: createLlmCatalogRepository(database),
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
        if (input.watchlist === true) {
          const watchlistTickers = await database
            .selectDistinct({
              displayTicker: schema.watchlistItems.displayTicker,
            })
            .from(schema.watchlistItems)
            .where(eq(schema.watchlistItems.clerkUserId, input.clerkUserId));
          const tickers = [
            ...new Set(
              watchlistTickers
                .map((row) => row.displayTicker.trim().toUpperCase())
                .filter(Boolean),
            ),
          ];
          if (tickers.length === 0) {
            conditions.push(sql`false`);
          } else {
            conditions.push(inArray(analysisJobs.ticker, tickers));
          }
        }

        const rows = await database
          .select({
            job: analysisJobs,
            creditUnits: schema.creditReservations.units,
          })
          .from(schema.creditReservations)
          .innerJoin(
            analysisJobs,
            eq(schema.creditReservations.analysisJobId, analysisJobs.id),
          )
          .where(and(...conditions))
          .orderBy(desc(analysisJobs.createdAt))
          .limit(input.limit)
          .offset(input.offset);

        return rows.map((row) => ({
          job: row.job,
          creditUnits: row.creditUnits,
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
      async listAllForAdmin(input) {
        const conditions = [
          sql`${schema.creditReservations.analysisJobId} is not null`,
        ];
        if (input.clerkUserId) {
          conditions.push(
            eq(schema.creditReservations.clerkUserId, input.clerkUserId),
          );
        }
        if (input.ticker) {
          conditions.push(
            eq(analysisJobs.ticker, input.ticker.trim().toUpperCase()),
          );
        }
        if (input.status) {
          conditions.push(eq(analysisJobs.status, input.status));
        }
        const rows = await database
          .select({
            job: analysisJobs,
            clerkUserId: schema.creditReservations.clerkUserId,
            creditUnits: schema.creditReservations.units,
          })
          .from(schema.creditReservations)
          .innerJoin(
            analysisJobs,
            eq(schema.creditReservations.analysisJobId, analysisJobs.id),
          )
          .where(and(...conditions))
          .orderBy(desc(analysisJobs.createdAt))
          .limit(input.limit)
          .offset(input.offset);
        return rows.map((row) => ({
          job: row.job,
          clerkUserId: row.clerkUserId,
          creditUnits: row.creditUnits,
        }));
      },
      async getOwner(analysisJobId) {
        const [row] = await database
          .select({ clerkUserId: schema.creditReservations.clerkUserId })
          .from(schema.creditReservations)
          .where(eq(schema.creditReservations.analysisJobId, analysisJobId))
          .limit(1);
        return row?.clerkUserId ?? null;
      },
      async getAdminOverview(input) {
        const [
          userCountRow,
          activeSubRow,
          statusRows,
          creditTotals,
          periodConsumedRow,
          avgDurationRow,
        ] = await Promise.all([
          database
            .select({ count: sql<number>`count(*)::int` })
            .from(schema.accountUsers)
            .then((rows) => rows[0]),
          database
            .select({ count: sql<number>`count(*)::int` })
            .from(schema.billingSubscriptions)
            .where(
              and(
                inArray(schema.billingSubscriptions.status, [
                  'active',
                  'trialing',
                ]),
                gt(schema.billingSubscriptions.currentPeriodEnd, new Date()),
              ),
            )
            .then((rows) => rows[0]),
          database
            .select({
              status: analysisJobs.status,
              count: sql<number>`count(*)::int`,
            })
            .from(analysisJobs)
            .where(
              and(
                gte(analysisJobs.createdAt, input.from),
                lte(analysisJobs.createdAt, input.to),
              ),
            )
            .groupBy(analysisJobs.status),
          database
            .select({
              available: sql<number>`coalesce(sum(${schema.creditAccounts.availableCredits}), 0)::int`,
              reserved: sql<number>`coalesce(sum(${schema.creditAccounts.reservedCredits}), 0)::int`,
              spent: sql<number>`coalesce(sum(${schema.creditAccounts.spentCredits}), 0)::int`,
            })
            .from(schema.creditAccounts)
            .then((rows) => rows[0]),
          database
            .select({
              consumed: sql<number>`coalesce(sum(abs(${schema.creditLedgerEntries.spentDelta})), 0)::int`,
            })
            .from(schema.creditLedgerEntries)
            .where(
              and(
                eq(schema.creditLedgerEntries.entryType, 'consume'),
                gte(schema.creditLedgerEntries.createdAt, input.from),
                lte(schema.creditLedgerEntries.createdAt, input.to),
              ),
            )
            .then((rows) => rows[0]),
          database
            .select({
              avgSeconds: sql<number | null>`avg(extract(epoch from (${analysisJobs.finishedAt} - ${analysisJobs.startedAt})))`,
            })
            .from(analysisJobs)
            .where(
              and(
                eq(analysisJobs.status, 'succeeded'),
                gte(analysisJobs.createdAt, input.from),
                lte(analysisJobs.createdAt, input.to),
                sql`${analysisJobs.startedAt} is not null`,
                sql`${analysisJobs.finishedAt} is not null`,
              ),
            )
            .then((rows) => rows[0]),
        ]);

        const counts = {
          total: 0,
          succeeded: 0,
          failed: 0,
          queued: 0,
          running: 0,
        };
        for (const row of statusRows) {
          counts.total += row.count;
          if (row.status === 'succeeded') counts.succeeded = row.count;
          if (row.status === 'failed') counts.failed = row.count;
          if (row.status === 'queued') counts.queued = row.count;
          if (row.status === 'running') counts.running = row.count;
        }
        const finished = counts.succeeded + counts.failed;
        return {
          userCount: userCountRow?.count ?? 0,
          activeSubscriptionCount: activeSubRow?.count ?? 0,
          period: {
            from: input.from.toISOString(),
            to: input.to.toISOString(),
          },
          analyses: {
            ...counts,
            successRate:
              finished > 0
                ? Number((counts.succeeded / finished).toFixed(4))
                : null,
          },
          credits: {
            availableTotal: creditTotals?.available ?? 0,
            reservedTotal: creditTotals?.reserved ?? 0,
            spentTotal: creditTotals?.spent ?? 0,
            periodConsumed: periodConsumedRow?.consumed ?? 0,
          },
          queue: {
            queued: counts.queued,
            running: counts.running,
          },
          timing: {
            averageSucceededDurationSeconds:
              avgDurationRow?.avgSeconds == null
                ? null
                : Number(Number(avgDurationRow.avgSeconds).toFixed(1)),
          },
        };
      },
    },
  };
}
