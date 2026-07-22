/**
 * 计费 / 积分领域持久化。
 *
 * 负责 Stripe Customer 关联、订阅镜像、分析余额门槛、账本读取，
 * 以及幂等的 webhook 落地。分析计费配置与奖励配置在 system_settings。
 */
import { and, desc, eq, gte, inArray, lte, sql } from 'drizzle-orm';
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

/** 供 UI 聚合的积分钱包 + 最新订阅 + 近期流水。 */
export type CreditUsage = {
  availableCredits: number;
  reservedCredits: number;
  spentCredits: number;
  subscription: typeof schema.billingSubscriptions.$inferSelect | null;
  ledger: Array<typeof schema.creditLedgerEntries.$inferSelect>;
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
  getUsage(clerkUserId: string): Promise<CreditUsage>;
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

    async getUsage(clerkUserId) {
      const [account, subscriptions, ledger] = await Promise.all([
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
        database
          .select()
          .from(schema.creditLedgerEntries)
          .where(eq(schema.creditLedgerEntries.clerkUserId, clerkUserId))
          .orderBy(desc(schema.creditLedgerEntries.createdAt))
          .limit(100),
      ]);
      return {
        availableCredits: account?.availableCredits ?? 0,
        reservedCredits: account?.reservedCredits ?? 0,
        spentCredits: account?.spentCredits ?? 0,
        subscription: subscriptions[0] ?? null,
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

        const minimumBalance = input.delta < 0 ? -input.delta : 0;
        const [account] = await tx
          .update(schema.creditAccounts)
          .set({
            availableCredits: sql`${schema.creditAccounts.availableCredits} + ${input.delta}`,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(schema.creditAccounts.clerkUserId, input.clerkUserId),
              gte(schema.creditAccounts.availableCredits, minimumBalance),
            ),
          )
          .returning({
            availableCredits: schema.creditAccounts.availableCredits,
          });
        if (!account) {
          throw new BillingRepositoryError(
            'INSUFFICIENT_CREDITS',
            'The adjustment would make the available balance negative',
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
          event.subscription?.customerId ?? event.creditGrant?.customerId;
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

        if (event.creditGrant && event.creditGrant.credits > 0) {
          const grant = event.creditGrant;
          const [entry] = await tx
            .insert(schema.creditLedgerEntries)
            .values({
              clerkUserId: user.clerkUserId,
              entryType: 'grant',
              availableDelta: grant.credits,
              idempotencyKey: `stripe:invoice:${grant.invoiceId}:grant`,
              referenceType: 'stripe_invoice',
              referenceId: grant.invoiceId,
              description: 'Subscription cycle credits granted',
              metadata: {
                subscriptionId: grant.subscriptionId,
                priceId: grant.priceId,
                periodStart: grant.periodStart,
                periodEnd: grant.periodEnd,
              },
            })
            .onConflictDoNothing()
            .returning({ id: schema.creditLedgerEntries.id });
          if (entry) {
            await tx
              .update(schema.creditAccounts)
              .set({
                availableCredits: sql`${schema.creditAccounts.availableCredits} + ${grant.credits}`,
                updatedAt: new Date(),
              })
              .where(eq(schema.creditAccounts.clerkUserId, user.clerkUserId));
          }
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
  };
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
    creditGrant: event.creditGrant,
  };
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
