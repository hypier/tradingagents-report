/**
 * 计费 / 积分领域持久化。
 *
 * 负责 Stripe Customer 关联、订阅镜像、分析余额门槛、账本读取，
 * 以及幂等的 webhook 落地。分析计费配置与奖励配置在 system_settings。
 */
import { and, desc, eq, gte, inArray, lte, notInArray, sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

import type { StripeWebhookEvent } from '../billing/contract';
import {
  type AnalysisBillingSettings,
  type CreditPricingSnapshot,
  type RewardsSettings,
  DEFAULT_BILLING_SETTINGS,
  DEFAULT_REWARDS_SETTINGS,
  parseBillingSettings,
  parseRewardsSettings,
  toCreditPricingSnapshot,
} from '../../shared/product-credits';
import * as schema from './schema';

export type StripeWebhookEventRow =
  typeof schema.stripeWebhookEvents.$inferSelect;

export type StripeWebhookEventStatus = StripeWebhookEventRow['status'];

export type StripeWebhookEventsSummary = {
  processed: number;
  failed: number;
  ignored: number;
  processing: number;
};

/** 消费流水关联的分析报告摘要（用户侧展示用）。 */
export type LedgerAnalysisReport = {
  id: string;
  ticker: string;
  displayName: string | null;
  displayTicker: string | null;
  tradeDate: string;
};

/** 供 UI 聚合的积分钱包 + 最新订阅 + 流水。 */
export type CreditUsage = {
  availableCredits: number;
  periodCredits: number;
  bonusCredits: number;
  reservedCredits: number;
  spentCredits: number;
  /** 当前计费周期起点（有订阅时）。 */
  periodStart: Date | null;
  periodEnd: Date | null;
  subscription: typeof schema.billingSubscriptions.$inferSelect | null;
  ledger: Array<
    typeof schema.creditLedgerEntries.$inferSelect & {
      analysisReport: LedgerAnalysisReport | null;
    }
  >;
};

export type GetUsageOptions = {
  /** 仅返回当前订阅周期内的流水（无订阅则不按周期裁剪）。 */
  currentPeriodOnly?: boolean;
};

export type AnalysisCreditEstimate = {
  analysisBalanceThreshold: number;
  pointsPerUsd: string;
  markupBasisPoints: number;
  availableCredits: number;
  canStart: boolean;
};

export interface BillingRepository {
  setStripeCustomerId(clerkUserId: string, customerId: string): Promise<void>;
  getStripeCustomerId(clerkUserId: string): Promise<string | null>;
  getUsage(
    clerkUserId: string,
    options?: GetUsageOptions,
  ): Promise<CreditUsage>;
  getBillingSettings(): Promise<AnalysisBillingSettings>;
  updateBillingSettings(
    input: AnalysisBillingSettings & { actorClerkUserId: string },
  ): Promise<AnalysisBillingSettings>;
  getRewardsSettings(): Promise<RewardsSettings>;
  updateRewardsSettings(
    input: RewardsSettings & { actorClerkUserId: string },
  ): Promise<RewardsSettings>;
  estimateAnalysis(input: {
    clerkUserId: string;
  }): Promise<AnalysisCreditEstimate>;
  getAvailableCredits(clerkUserIds: string[]): Promise<Record<string, number>>;
  adjustCredits(input: {
    adjustmentId: string;
    clerkUserId: string;
    actorClerkUserId: string;
    delta: number;
    reason?: string;
  }): Promise<number>;
  assertCanStartAnalysis(input: {
    clerkUserId: string;
  }): Promise<{
    settings: AnalysisBillingSettings;
    pricing: CreditPricingSnapshot;
  }>;
  processStripeEvent(event: StripeWebhookEvent): Promise<boolean>;
  recordStripeFailure(event: StripeWebhookEvent, error: unknown): Promise<void>;
  listStripeWebhookEvents(input: {
    status?: StripeWebhookEventStatus;
    eventType?: string;
    from?: Date;
    to?: Date;
    limit: number;
    offset: number;
  }): Promise<StripeWebhookEventRow[]>;
  summarizeStripeWebhookEvents(input: {
    from?: Date;
    to?: Date;
  }): Promise<StripeWebhookEventsSummary>;
  listLedgerForAdmin(input: {
    clerkUserId?: string;
    entryType?: CreditUsage['ledger'][number]['entryType'];
    referenceType?: string;
    referenceId?: string;
    limit: number;
    offset: number;
  }): Promise<
    Array<
      typeof schema.creditLedgerEntries.$inferSelect & {
        analysisReport: LedgerAnalysisReport | null;
      }
    >
  >;
  getLedgerEntryForAdmin(entryId: string): Promise<
    | (typeof schema.creditLedgerEntries.$inferSelect & {
        analysisReport: LedgerAnalysisReport | null;
      })
    | null
  >;
}

export class BillingRepositoryError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'BillingRepositoryError';
  }
}

type Database = NodePgDatabase<typeof schema>;
type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];
type QueryDatabase = Database | Transaction;

export function createBillingRepository(database: Database): BillingRepository {
  return {
    async setStripeCustomerId(clerkUserId, customerId) {
      await database
        .update(schema.accountUsers)
        .set({ stripeCustomerId: customerId, updatedAt: new Date() })
        .where(eq(schema.accountUsers.clerkUserId, clerkUserId));
    },

    async getStripeCustomerId(clerkUserId) {
      const [user] = await database
        .select({ stripeCustomerId: schema.accountUsers.stripeCustomerId })
        .from(schema.accountUsers)
        .where(eq(schema.accountUsers.clerkUserId, clerkUserId));
      return user?.stripeCustomerId ?? null;
    },

    async getUsage(clerkUserId, options = {}) {
      const [account, subscriptions] = await Promise.all([
        database
          .select()
          .from(schema.creditAccounts)
          .where(eq(schema.creditAccounts.clerkUserId, clerkUserId))
          .then((rows) => rows[0]),
        database
          .select()
          .from(schema.billingSubscriptions)
          .where(eq(schema.billingSubscriptions.clerkUserId, clerkUserId))
          .orderBy(desc(schema.billingSubscriptions.updatedAt))
          .limit(1),
      ]);
      const subscription = subscriptions[0] ?? null;
      const periodStart = subscription?.currentPeriodStart ?? null;
      const periodEnd =
        account?.periodEnd ?? subscription?.currentPeriodEnd ?? null;

      const ledgerFilters = [
        eq(schema.creditLedgerEntries.clerkUserId, clerkUserId),
        // 新路径不再预扣；历史 reserve/release 对用户用量页只是噪音。
        notInArray(schema.creditLedgerEntries.entryType, [
          'reserve',
          'release',
        ]),
      ];
      if (options.currentPeriodOnly && periodStart) {
        ledgerFilters.push(
          gte(schema.creditLedgerEntries.createdAt, periodStart),
        );
      }

      const ledgerRows = await database
        .select()
        .from(schema.creditLedgerEntries)
        .where(and(...ledgerFilters))
        .orderBy(desc(schema.creditLedgerEntries.createdAt))
        .limit(100);

      const analysisJobIds = [
        ...new Set(
          ledgerRows
            .filter((entry) => entry.referenceType === 'analysis_job')
            .map((entry) => entry.referenceId)
            .filter(Boolean),
        ),
      ];
      const analysisJobs =
        analysisJobIds.length === 0
          ? []
          : await database
              .select({
                id: schema.analysisJobs.id,
                ticker: schema.analysisJobs.ticker,
                tradeDate: schema.analysisJobs.tradeDate,
                display: schema.analysisJobs.display,
                clerkUserId: schema.analysisJobs.clerkUserId,
              })
              .from(schema.analysisJobs)
              .where(
                and(
                  inArray(schema.analysisJobs.id, analysisJobIds),
                  eq(schema.analysisJobs.clerkUserId, clerkUserId),
                ),
              );
      const reportsById = new Map(
        analysisJobs.map((job) => {
          const display = job.display ?? {};
          const displayName =
            typeof display.display_name === 'string' && display.display_name.trim()
              ? display.display_name.trim()
              : null;
          const displayTicker =
            typeof display.display_ticker === 'string' &&
            display.display_ticker.trim()
              ? display.display_ticker.trim()
              : null;
          const report: LedgerAnalysisReport = {
            id: job.id,
            ticker: job.ticker,
            displayName,
            displayTicker,
            tradeDate: String(job.tradeDate),
          };
          return [job.id, report] as const;
        }),
      );

      const ledger = ledgerRows.map((entry) => ({
        ...entry,
        analysisReport:
          entry.referenceType === 'analysis_job'
            ? (reportsById.get(entry.referenceId) ?? null)
            : null,
      }));

      return {
        availableCredits: account?.availableCredits ?? 0,
        periodCredits: account?.periodCredits ?? 0,
        bonusCredits: account?.bonusCredits ?? 0,
        reservedCredits: account?.reservedCredits ?? 0,
        spentCredits: account?.spentCredits ?? 0,
        periodStart,
        periodEnd,
        subscription,
        ledger,
      };
    },

    getBillingSettings() {
      return loadBillingSettings(database);
    },

    async updateBillingSettings(input) {
      const next = parseBillingSettings({
        analysisBalanceThreshold: input.analysisBalanceThreshold,
        pointsPerUsd: input.pointsPerUsd,
        markupBasisPoints: input.markupBasisPoints,
      });
      await database
        .insert(schema.systemSettings)
        .values({
          key: 'billing',
          value: next,
          updatedBy: input.actorClerkUserId,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: schema.systemSettings.key,
          set: {
            value: next,
            updatedBy: input.actorClerkUserId,
            updatedAt: new Date(),
          },
        });
      await database.insert(schema.adminAuditEvents).values({
        actorClerkUserId: input.actorClerkUserId,
        action: 'billing.settings.update',
        targetType: 'system_settings',
        targetId: 'billing',
        metadata: next,
      });
      return next;
    },

    getRewardsSettings() {
      return loadRewardsSettings(database);
    },

    async updateRewardsSettings(input) {
      const next = parseRewardsSettings({
        signup: input.signup,
        referral: input.referral,
        campaign: input.campaign,
      });
      await database
        .insert(schema.systemSettings)
        .values({
          key: 'rewards',
          value: next,
          updatedBy: input.actorClerkUserId,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: schema.systemSettings.key,
          set: {
            value: next,
            updatedBy: input.actorClerkUserId,
            updatedAt: new Date(),
          },
        });
      await database.insert(schema.adminAuditEvents).values({
        actorClerkUserId: input.actorClerkUserId,
        action: 'rewards.settings.update',
        targetType: 'system_settings',
        targetId: 'rewards',
        metadata: next,
      });
      return next;
    },

    async estimateAnalysis(input) {
      const [settings, usage] = await Promise.all([
        loadBillingSettings(database),
        database
          .select({
            availableCredits: schema.creditAccounts.availableCredits,
          })
          .from(schema.creditAccounts)
          .where(eq(schema.creditAccounts.clerkUserId, input.clerkUserId))
          .then((rows) => rows[0]),
      ]);
      const availableCredits = usage?.availableCredits ?? 0;
      return {
        analysisBalanceThreshold: settings.analysisBalanceThreshold,
        pointsPerUsd: settings.pointsPerUsd,
        markupBasisPoints: settings.markupBasisPoints,
        availableCredits,
        canStart: availableCredits > settings.analysisBalanceThreshold,
      };
    },

    async getAvailableCredits(clerkUserIds) {
      const result = Object.fromEntries(clerkUserIds.map((id) => [id, 0]));
      if (clerkUserIds.length === 0) return result;
      const rows = await database
        .select({
          clerkUserId: schema.creditAccounts.clerkUserId,
          availableCredits: schema.creditAccounts.availableCredits,
        })
        .from(schema.creditAccounts)
        .where(inArray(schema.creditAccounts.clerkUserId, clerkUserIds));
      for (const row of rows) result[row.clerkUserId] = row.availableCredits;
      return result;
    },

    async adjustCredits(input) {
      return database.transaction(async (tx) => {
        const idempotencyKey = `adjustment:${input.adjustmentId}`;
        const [entry] = await tx
          .insert(schema.creditLedgerEntries)
          .values({
            clerkUserId: input.clerkUserId,
            entryType: 'adjustment',
            availableDelta: input.delta,
            idempotencyKey,
            referenceType: 'admin_adjustment',
            referenceId: input.adjustmentId,
            description: input.reason?.trim() || 'Admin credit adjustment',
            metadata: {
              actorClerkUserId: input.actorClerkUserId,
              reason: input.reason ?? null,
              pool: 'bonus',
              grantKind: 'admin_adjustment',
              periodDelta: 0,
              bonusDelta: input.delta,
            },
          })
          .onConflictDoNothing()
          .returning({ id: schema.creditLedgerEntries.id });
        if (!entry) {
          const [existing] = await tx
            .select()
            .from(schema.creditLedgerEntries)
            .where(eq(schema.creditLedgerEntries.idempotencyKey, idempotencyKey));
          if (
            existing?.clerkUserId !== input.clerkUserId ||
            existing.availableDelta !== input.delta
          ) {
            throw new BillingRepositoryError(
              'IDEMPOTENCY_CONFLICT',
              'The adjustment ID was already used with different values',
            );
          }
          const [account] = await tx
            .select({
              availableCredits: schema.creditAccounts.availableCredits,
            })
            .from(schema.creditAccounts)
            .where(eq(schema.creditAccounts.clerkUserId, input.clerkUserId));
          return account?.availableCredits ?? 0;
        }

        const minimumBonus = input.delta < 0 ? -input.delta : 0;
        const [account] = await tx
          .update(schema.creditAccounts)
          .set({
            bonusCredits: sql`${schema.creditAccounts.bonusCredits} + ${input.delta}`,
            availableCredits: sql`${schema.creditAccounts.availableCredits} + ${input.delta}`,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(schema.creditAccounts.clerkUserId, input.clerkUserId),
              gte(schema.creditAccounts.bonusCredits, minimumBonus),
            ),
          )
          .returning({
            availableCredits: schema.creditAccounts.availableCredits,
          });
        if (!account) {
          throw new BillingRepositoryError(
            'INSUFFICIENT_CREDITS',
            'The adjustment would make the bonus balance negative',
          );
        }
        return account.availableCredits;
      });
    },

    async assertCanStartAnalysis(input) {
      const settings = await loadBillingSettings(database);
      const [account] = await database
        .select({
          availableCredits: schema.creditAccounts.availableCredits,
        })
        .from(schema.creditAccounts)
        .where(eq(schema.creditAccounts.clerkUserId, input.clerkUserId));
      const available = account?.availableCredits ?? 0;
      if (!(available > settings.analysisBalanceThreshold)) {
        throw new BillingRepositoryError(
          'INSUFFICIENT_CREDITS',
          'Available credits are not above the analysis balance threshold',
        );
      }
      return {
        settings,
        pricing: toCreditPricingSnapshot(settings),
      };
    },

    async processStripeEvent(event) {
      return database.transaction(async (tx) => {
        const [accepted] = await tx
          .insert(schema.stripeWebhookEvents)
          .values({
            stripeEventId: event.id,
            eventType: event.type,
            status: 'processing',
            payload: webhookAuditPayload(event),
          })
          .onConflictDoNothing()
          .returning();
        if (!accepted) {
          const [existing] = await tx
            .select()
            .from(schema.stripeWebhookEvents)
            .where(eq(schema.stripeWebhookEvents.stripeEventId, event.id));
          if (
            existing?.status === 'processed' ||
            existing?.status === 'ignored'
          )
            return false;
          await tx
            .update(schema.stripeWebhookEvents)
            .set({ status: 'processing', error: null, updatedAt: new Date() })
            .where(eq(schema.stripeWebhookEvents.stripeEventId, event.id));
        }

        const customerId =
          event.subscription?.customerId ??
          event.creditGrant?.customerId ??
          event.creditClawback?.customerId;
        if (!customerId) {
          await finishWebhook(tx, event.id, 'ignored');
          return true;
        }
        const [user] = await tx
          .select({ clerkUserId: schema.accountUsers.clerkUserId })
          .from(schema.accountUsers)
          .where(eq(schema.accountUsers.stripeCustomerId, customerId));
        if (!user) {
          throw new BillingRepositoryError(
            'BILLING_CUSTOMER_NOT_FOUND',
            `Stripe customer ${customerId} is not linked to an account`,
          );
        }

        if (event.subscription) {
          const subscription = event.subscription;
          await tx
            .insert(schema.billingSubscriptions)
            .values({
              stripeSubscriptionId: subscription.id,
              clerkUserId: user.clerkUserId,
              stripeCustomerId: subscription.customerId,
              stripePriceId: subscription.priceId,
              status: subscription.status,
              cancelAtPeriodEnd: subscription.cancelAtPeriodEnd ? 1 : 0,
              currentPeriodStart: fromUnix(subscription.currentPeriodStart),
              currentPeriodEnd: fromUnix(subscription.currentPeriodEnd),
              latestInvoiceId: subscription.latestInvoiceId,
            })
            .onConflictDoUpdate({
              target: schema.billingSubscriptions.stripeSubscriptionId,
              set: {
                stripePriceId: subscription.priceId,
                status: subscription.status,
                cancelAtPeriodEnd: subscription.cancelAtPeriodEnd ? 1 : 0,
                currentPeriodStart: fromUnix(subscription.currentPeriodStart),
                currentPeriodEnd: fromUnix(subscription.currentPeriodEnd),
                latestInvoiceId: subscription.latestInvoiceId,
                updatedAt: new Date(),
              },
            });
        }

        if (event.expirePeriod) {
          const periodEndUnix =
            event.subscription?.currentPeriodEnd ??
            Math.floor(Date.now() / 1000);
          await expirePeriodCredits(tx, {
            clerkUserId: user.clerkUserId,
            idempotencyKey: `stripe:sub:${event.subscription?.id ?? customerId}:expire:${periodEndUnix}`,
            referenceType: 'stripe_subscription',
            referenceId: event.subscription?.id ?? customerId,
            description: 'Subscription period credits expired',
            metadata: {
              pool: 'period',
              reason: event.subscription?.status ?? 'expire',
              subscriptionId: event.subscription?.id ?? null,
            },
          });
        }

        if (event.creditGrant && event.creditGrant.credits > 0) {
          await applySubscriptionCreditGrant(tx, user.clerkUserId, event.creditGrant);
        }

        if (event.creditClawback) {
          await applyCreditClawback(tx, user.clerkUserId, event.creditClawback);
        }

        await finishWebhook(tx, event.id, 'processed');
        return true;
      });
    },

    async recordStripeFailure(event, error) {
      await database
        .insert(schema.stripeWebhookEvents)
        .values({
          stripeEventId: event.id,
          eventType: event.type,
          status: 'failed',
          payload: webhookAuditPayload(event),
          error: String(error),
        })
        .onConflictDoUpdate({
          target: schema.stripeWebhookEvents.stripeEventId,
          set: {
            status: 'failed',
            error: String(error),
            updatedAt: new Date(),
          },
        });
    },

    async listStripeWebhookEvents(input) {
      const conditions = [];
      if (input.status) {
        conditions.push(eq(schema.stripeWebhookEvents.status, input.status));
      }
      if (input.eventType) {
        conditions.push(
          eq(schema.stripeWebhookEvents.eventType, input.eventType),
        );
      }
      if (input.from) {
        conditions.push(
          gte(schema.stripeWebhookEvents.receivedAt, input.from),
        );
      }
      if (input.to) {
        conditions.push(lte(schema.stripeWebhookEvents.receivedAt, input.to));
      }
      return database
        .select()
        .from(schema.stripeWebhookEvents)
        .where(conditions.length ? and(...conditions) : undefined)
        .orderBy(desc(schema.stripeWebhookEvents.receivedAt))
        .limit(input.limit)
        .offset(input.offset);
    },

    async summarizeStripeWebhookEvents(input) {
      const conditions = [];
      if (input.from) {
        conditions.push(
          gte(schema.stripeWebhookEvents.receivedAt, input.from),
        );
      }
      if (input.to) {
        conditions.push(lte(schema.stripeWebhookEvents.receivedAt, input.to));
      }
      const rows = await database
        .select({
          status: schema.stripeWebhookEvents.status,
          count: sql<number>`count(*)::int`,
        })
        .from(schema.stripeWebhookEvents)
        .where(conditions.length ? and(...conditions) : undefined)
        .groupBy(schema.stripeWebhookEvents.status);

      const summary: StripeWebhookEventsSummary = {
        processed: 0,
        failed: 0,
        ignored: 0,
        processing: 0,
      };
      for (const row of rows) {
        if (row.status in summary) {
          summary[row.status as keyof StripeWebhookEventsSummary] = Number(
            row.count,
          );
        }
      }
      return summary;
    },

    async listLedgerForAdmin(input) {
      const conditions = [];
      if (input.clerkUserId) {
        conditions.push(
          eq(schema.creditLedgerEntries.clerkUserId, input.clerkUserId),
        );
      }
      if (input.entryType) {
        conditions.push(
          eq(schema.creditLedgerEntries.entryType, input.entryType),
        );
      }
      if (input.referenceType) {
        conditions.push(
          eq(schema.creditLedgerEntries.referenceType, input.referenceType),
        );
      }
      if (input.referenceId) {
        conditions.push(
          eq(schema.creditLedgerEntries.referenceId, input.referenceId),
        );
      }

      const ledgerRows = await database
        .select()
        .from(schema.creditLedgerEntries)
        .where(conditions.length ? and(...conditions) : undefined)
        .orderBy(desc(schema.creditLedgerEntries.createdAt))
        .limit(input.limit)
        .offset(input.offset);

      return attachAnalysisReportsToLedger(database, ledgerRows);
    },

    async getLedgerEntryForAdmin(entryId) {
      const [entry] = await database
        .select()
        .from(schema.creditLedgerEntries)
        .where(eq(schema.creditLedgerEntries.id, entryId))
        .limit(1);
      if (!entry) return null;
      const [enriched] = await attachAnalysisReportsToLedger(database, [entry]);
      return enriched ?? null;
    },
  };
}

async function attachAnalysisReportsToLedger(
  database: QueryDatabase,
  ledgerRows: Array<typeof schema.creditLedgerEntries.$inferSelect>,
) {
  const analysisJobIds = [
    ...new Set(
      ledgerRows
        .filter((entry) => entry.referenceType === 'analysis_job')
        .map((entry) => entry.referenceId)
        .filter(Boolean),
    ),
  ];
  const analysisJobs =
    analysisJobIds.length === 0
      ? []
      : await database
          .select({
            id: schema.analysisJobs.id,
            ticker: schema.analysisJobs.ticker,
            tradeDate: schema.analysisJobs.tradeDate,
            display: schema.analysisJobs.display,
            clerkUserId: schema.analysisJobs.clerkUserId,
          })
          .from(schema.analysisJobs)
          .where(inArray(schema.analysisJobs.id, analysisJobIds));

  const reportsById = new Map(
    analysisJobs.map((job) => {
      const display = job.display ?? {};
      const displayName =
        typeof display.display_name === 'string' && display.display_name.trim()
          ? display.display_name.trim()
          : null;
      const displayTicker =
        typeof display.display_ticker === 'string' &&
        display.display_ticker.trim()
          ? display.display_ticker.trim()
          : null;
      const report: LedgerAnalysisReport = {
        id: job.id,
        ticker: job.ticker,
        displayName,
        displayTicker,
        tradeDate: String(job.tradeDate),
      };
      return [job.id, report] as const;
    }),
  );

  return ledgerRows.map((entry) => ({
    ...entry,
    analysisReport:
      entry.referenceType === 'analysis_job'
        ? (reportsById.get(entry.referenceId) ?? null)
        : null,
  }));
}

/** 将 Stripe 的 unix 秒转为 Date；null 保持 null。 */
function fromUnix(value: number | null): Date | null {
  return value === null ? null : new Date(value * 1000);
}

/** 保存紧凑审计载荷（原始数据 + 规范化后的订阅/积分发放）。 */
function webhookAuditPayload(event: StripeWebhookEvent) {
  return {
    ...event.payload,
    subscription: event.subscription,
    expirePeriod: event.expirePeriod ?? false,
    creditGrant: event.creditGrant,
    creditClawback: event.creditClawback,
  };
}

async function ensureCreditAccount(tx: Transaction, clerkUserId: string) {
  await tx
    .insert(schema.creditAccounts)
    .values({ clerkUserId })
    .onConflictDoNothing();
}

async function expirePeriodCredits(
  tx: Transaction,
  input: {
    clerkUserId: string;
    idempotencyKey: string;
    referenceType: string;
    referenceId: string;
    description: string;
    metadata: Record<string, unknown>;
  },
) {
  await ensureCreditAccount(tx, input.clerkUserId);
  const [account] = await tx
    .select({
      periodCredits: schema.creditAccounts.periodCredits,
      bonusCredits: schema.creditAccounts.bonusCredits,
    })
    .from(schema.creditAccounts)
    .where(eq(schema.creditAccounts.clerkUserId, input.clerkUserId))
    .for('update');
  const periodCredits = account?.periodCredits ?? 0;
  if (periodCredits <= 0) {
    await tx
      .update(schema.creditAccounts)
      .set({
        periodBaselineCredits: 0,
        periodEnd: null,
        updatedAt: new Date(),
      })
      .where(eq(schema.creditAccounts.clerkUserId, input.clerkUserId));
    return;
  }

  const [entry] = await tx
    .insert(schema.creditLedgerEntries)
    .values({
      clerkUserId: input.clerkUserId,
      entryType: 'expire',
      availableDelta: -periodCredits,
      idempotencyKey: input.idempotencyKey,
      referenceType: input.referenceType,
      referenceId: input.referenceId,
      description: input.description,
      metadata: {
        ...input.metadata,
        periodDelta: -periodCredits,
        bonusDelta: 0,
      },
    })
    .onConflictDoNothing()
    .returning({ id: schema.creditLedgerEntries.id });
  if (!entry) return;

  const bonusCredits = account?.bonusCredits ?? 0;
  await tx
    .update(schema.creditAccounts)
    .set({
      periodCredits: 0,
      periodBaselineCredits: 0,
      periodEnd: null,
      availableCredits: bonusCredits,
      updatedAt: new Date(),
    })
    .where(eq(schema.creditAccounts.clerkUserId, input.clerkUserId));
}

async function applySubscriptionCreditGrant(
  tx: Transaction,
  clerkUserId: string,
  grant: NonNullable<StripeWebhookEvent['creditGrant']>,
) {
  await ensureCreditAccount(tx, clerkUserId);
  const [account] = await tx
    .select({
      periodCredits: schema.creditAccounts.periodCredits,
      bonusCredits: schema.creditAccounts.bonusCredits,
      periodBaselineCredits: schema.creditAccounts.periodBaselineCredits,
    })
    .from(schema.creditAccounts)
    .where(eq(schema.creditAccounts.clerkUserId, clerkUserId))
    .for('update');

  if (grant.expireBeforeGrant || grant.grantKind === 'cycle') {
    await expirePeriodCredits(tx, {
      clerkUserId,
      idempotencyKey: `stripe:invoice:${grant.invoiceId}:expire`,
      referenceType: 'stripe_invoice',
      referenceId: grant.invoiceId,
      description: 'Unused period credits cleared before renewal',
      metadata: {
        pool: 'period',
        grantKind: grant.grantKind,
        subscriptionId: grant.subscriptionId,
      },
    });
  }

  let grantAmount = grant.credits;
  let nextBaseline = grant.credits;
  if (grant.grantKind === 'upgrade_delta') {
    const baseline = account?.periodBaselineCredits ?? 0;
    grantAmount = Math.max(0, grant.credits - baseline);
    nextBaseline = Math.max(baseline, grant.credits);
    if (grantAmount <= 0) {
      await tx
        .update(schema.creditAccounts)
        .set({
          periodBaselineCredits: nextBaseline,
          periodEnd: fromUnix(grant.periodEnd),
          updatedAt: new Date(),
        })
        .where(eq(schema.creditAccounts.clerkUserId, clerkUserId));
      return;
    }
  }

  const [entry] = await tx
    .insert(schema.creditLedgerEntries)
    .values({
      clerkUserId,
      entryType: 'grant',
      availableDelta: grantAmount,
      idempotencyKey: `stripe:invoice:${grant.invoiceId}:grant`,
      referenceType: 'stripe_invoice',
      referenceId: grant.invoiceId,
      description:
        grant.grantKind === 'upgrade_delta'
          ? 'Subscription upgrade credits granted'
          : 'Subscription cycle credits granted',
      metadata: {
        pool: 'period',
        grantKind: grant.grantKind,
        planCredits: grant.credits,
        subscriptionId: grant.subscriptionId,
        priceId: grant.priceId,
        periodStart: grant.periodStart,
        periodEnd: grant.periodEnd,
        periodDelta: grantAmount,
        bonusDelta: 0,
      },
    })
    .onConflictDoNothing()
    .returning({ id: schema.creditLedgerEntries.id });
  if (!entry) return;

  await tx
    .update(schema.creditAccounts)
    .set({
      periodCredits: sql`${schema.creditAccounts.periodCredits} + ${grantAmount}`,
      availableCredits: sql`${schema.creditAccounts.availableCredits} + ${grantAmount}`,
      periodBaselineCredits: nextBaseline,
      periodEnd: fromUnix(grant.periodEnd),
      updatedAt: new Date(),
    })
    .where(eq(schema.creditAccounts.clerkUserId, clerkUserId));
}

async function applyCreditClawback(
  tx: Transaction,
  clerkUserId: string,
  clawback: NonNullable<StripeWebhookEvent['creditClawback']>,
) {
  if (clawback.amountPaid <= 0 || clawback.amountRefunded <= 0) return;
  await ensureCreditAccount(tx, clerkUserId);

  let grantCredits = 0;
  if (clawback.invoiceId) {
    const [grant] = await tx
      .select({
        availableDelta: schema.creditLedgerEntries.availableDelta,
        metadata: schema.creditLedgerEntries.metadata,
      })
      .from(schema.creditLedgerEntries)
      .where(
        and(
          eq(schema.creditLedgerEntries.clerkUserId, clerkUserId),
          eq(schema.creditLedgerEntries.entryType, 'grant'),
          eq(schema.creditLedgerEntries.referenceType, 'stripe_invoice'),
          eq(schema.creditLedgerEntries.referenceId, clawback.invoiceId),
        ),
      )
      .limit(1);
    if (grant) {
      const planCredits = Number(grant.metadata?.planCredits);
      grantCredits =
        Number.isFinite(planCredits) && planCredits > 0
          ? planCredits
          : Math.max(0, grant.availableDelta);
    }
  }
  if (grantCredits <= 0) {
    const [account] = await tx
      .select({
        periodBaselineCredits: schema.creditAccounts.periodBaselineCredits,
      })
      .from(schema.creditAccounts)
      .where(eq(schema.creditAccounts.clerkUserId, clerkUserId));
    grantCredits = account?.periodBaselineCredits ?? 0;
  }
  if (grantCredits <= 0) return;

  const ratio = Math.min(1, clawback.amountRefunded / clawback.amountPaid);
  const targetClaw = Math.floor(grantCredits * ratio);
  if (targetClaw <= 0) return;

  const prior = await tx
    .select({
      availableDelta: schema.creditLedgerEntries.availableDelta,
    })
    .from(schema.creditLedgerEntries)
    .where(
      and(
        eq(schema.creditLedgerEntries.clerkUserId, clerkUserId),
        eq(schema.creditLedgerEntries.entryType, 'clawback'),
        eq(schema.creditLedgerEntries.referenceType, 'stripe_charge'),
        eq(schema.creditLedgerEntries.referenceId, clawback.chargeId),
      ),
    );
  const alreadyClawed = prior.reduce(
    (sum, row) => sum + Math.abs(row.availableDelta),
    0,
  );
  const remainingTarget = targetClaw - alreadyClawed;
  if (remainingTarget <= 0) return;

  const [account] = await tx
    .select({
      periodCredits: schema.creditAccounts.periodCredits,
      bonusCredits: schema.creditAccounts.bonusCredits,
      periodBaselineCredits: schema.creditAccounts.periodBaselineCredits,
      periodEnd: schema.creditAccounts.periodEnd,
    })
    .from(schema.creditAccounts)
    .where(eq(schema.creditAccounts.clerkUserId, clerkUserId))
    .for('update');
  const claw = Math.min(remainingTarget, account?.periodCredits ?? 0);
  if (claw <= 0) return;

  const [entry] = await tx
    .insert(schema.creditLedgerEntries)
    .values({
      clerkUserId,
      entryType: 'clawback',
      availableDelta: -claw,
      idempotencyKey: `stripe:charge:${clawback.chargeId}:clawback:${clawback.amountRefunded}`,
      referenceType: 'stripe_charge',
      referenceId: clawback.chargeId,
      description:
        clawback.reason === 'dispute'
          ? 'Period credits clawed back after dispute'
          : 'Period credits clawed back after refund',
      metadata: {
        pool: 'period',
        reason: clawback.reason,
        chargeId: clawback.chargeId,
        invoiceId: clawback.invoiceId,
        amountRefunded: clawback.amountRefunded,
        amountPaid: clawback.amountPaid,
        refundRatio: ratio,
        targetClaw,
        claw,
        periodDelta: -claw,
        bonusDelta: 0,
      },
    })
    .onConflictDoNothing()
    .returning({ id: schema.creditLedgerEntries.id });
  if (!entry) return;

  const nextPeriod = (account?.periodCredits ?? 0) - claw;
  const bonusCredits = account?.bonusCredits ?? 0;
  const fullClaw = ratio >= 1;
  await tx
    .update(schema.creditAccounts)
    .set({
      periodCredits: nextPeriod,
      availableCredits: nextPeriod + bonusCredits,
      periodBaselineCredits: fullClaw
        ? 0
        : (account?.periodBaselineCredits ?? 0),
      periodEnd: fullClaw ? null : (account?.periodEnd ?? null),
      updatedAt: new Date(),
    })
    .where(eq(schema.creditAccounts.clerkUserId, clerkUserId));
}

/** 成功处理后将 webhook 行标记为终态。 */
async function finishWebhook(
  tx: Parameters<Parameters<Database['transaction']>[0]>[0],
  eventId: string,
  status: 'processed' | 'ignored',
) {
  await tx
    .update(schema.stripeWebhookEvents)
    .set({ status, processedAt: new Date(), updatedAt: new Date() })
    .where(eq(schema.stripeWebhookEvents.stripeEventId, eventId));
}

async function loadBillingSettings(
  database: QueryDatabase,
): Promise<AnalysisBillingSettings> {
  const [row] = await database
    .select({ value: schema.systemSettings.value })
    .from(schema.systemSettings)
    .where(eq(schema.systemSettings.key, 'billing'));
  if (!row) {
    await database
      .insert(schema.systemSettings)
      .values({ key: 'billing', value: DEFAULT_BILLING_SETTINGS })
      .onConflictDoNothing();
    return DEFAULT_BILLING_SETTINGS;
  }
  return parseBillingSettings(row.value);
}

async function loadRewardsSettings(
  database: QueryDatabase,
): Promise<RewardsSettings> {
  const [row] = await database
    .select({ value: schema.systemSettings.value })
    .from(schema.systemSettings)
    .where(eq(schema.systemSettings.key, 'rewards'));
  if (!row) {
    await database
      .insert(schema.systemSettings)
      .values({ key: 'rewards', value: DEFAULT_REWARDS_SETTINGS })
      .onConflictDoNothing();
    return DEFAULT_REWARDS_SETTINGS;
  }
  return parseRewardsSettings(row.value);
}
