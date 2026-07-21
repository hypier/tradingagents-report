/**
 * 计费 / 积分领域持久化。
 *
 * 负责 Stripe Customer 关联、订阅镜像、分析积分预留/释放、账本读取，
 * 以及幂等的 webhook 落地。管理员 Stripe API 密钥由 `BillingConfigRepository` 管理。
 */
import { and, desc, eq, gt, gte, inArray, sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

import type { StripeWebhookEvent } from '../billing/contract';
import {
  calculateReservedPoints,
  discreteP90,
} from '../billing/credit-pricing';
import * as schema from './schema';

/** 供 UI 聚合的积分钱包 + 最新订阅 + 近期流水。 */
export type CreditUsage = {
  availableCredits: number;
  reservedCredits: number;
  spentCredits: number;
  subscription: typeof schema.billingSubscriptions.$inferSelect | null;
  ledger: Array<typeof schema.creditLedgerEntries.$inferSelect>;
};

export type CreditBillingSettings =
  typeof schema.creditBillingSettings.$inferSelect;

export type AnalysisCreditEstimate = {
  estimatedCostUsd: string;
  reservedPoints: number;
  source: 'default' | 'history';
  sampleCount: number;
};

export interface BillingRepository {
  /** 将 Stripe Customer ID 写入本地账户行。 */
  setStripeCustomerId(clerkUserId: string, customerId: string): Promise<void>;
  /** 读取已关联的 Stripe Customer ID；尚未创建时为 null。 */
  getStripeCustomerId(clerkUserId: string): Promise<string | null>;
  /** 积分余额、最新订阅镜像与近期账本行。 */
  getUsage(clerkUserId: string): Promise<CreditUsage>;
  getCreditSettings(): Promise<CreditBillingSettings>;
  updateCreditSettings(input: {
    pointsPerUsd: string;
    markupBasisPoints: number;
    reserveBufferBasisPoints: number;
    defaultEstimatedCostUsd: string;
    signupGrantUsd: string;
    referralRewardUsd: string;
    actorClerkUserId: string;
  }): Promise<CreditBillingSettings>;
  estimateAnalysis(input: {
    billingSignature: string;
  }): Promise<AnalysisCreditEstimate>;
  getAvailableCredits(clerkUserIds: string[]): Promise<Record<string, number>>;
  adjustCredits(input: {
    adjustmentId: string;
    clerkUserId: string;
    actorClerkUserId: string;
    delta: number;
    reason?: string;
  }): Promise<number>;
  /**
   * 为分析请求预留积分（按 requestId 幂等）。
   * 需要有效/试用中的订阅，且可用积分充足。
   */
  reserveAnalysis(input: {
    clerkUserId: string;
    requestId: string;
    billingSignature: string;
  }): Promise<'created' | 'existing'>;
  /** 提交成功后，将预留绑定到 Core 的 `analysis_jobs.id`。 */
  attachAnalysis(requestId: string, analysisJobId: string): Promise<void>;
  /** 释放仍处于 reserved 的预留，退回可用积分。 */
  releaseAnalysis(requestId: string, reason: string): Promise<void>;
  /**
   * 在事务内应用规范化后的 Stripe webhook。
   * 若事件已处理或已忽略则返回 false。
   */
  processStripeEvent(event: StripeWebhookEvent): Promise<boolean>;
  /** 将 webhook 投递标记为失败，供后续排查/重试。 */
  recordStripeFailure(event: StripeWebhookEvent, error: unknown): Promise<void>;
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

    getCreditSettings() {
      return ensureCreditSettings(database);
    },

    async updateCreditSettings(input) {
      return database.transaction(async (tx) => {
        await ensureCreditSettings(tx);
        const [previous] = await tx
          .select()
          .from(schema.creditBillingSettings)
          .where(eq(schema.creditBillingSettings.id, 'default'))
          .for('update');
        const [next] = await tx
          .update(schema.creditBillingSettings)
          .set({
            pointsPerUsd: input.pointsPerUsd,
            markupBasisPoints: input.markupBasisPoints,
            reserveBufferBasisPoints: input.reserveBufferBasisPoints,
            defaultEstimatedCostUsd: input.defaultEstimatedCostUsd,
            signupGrantUsd: input.signupGrantUsd,
            referralRewardUsd: input.referralRewardUsd,
            updatedByClerkUserId: input.actorClerkUserId,
            updatedAt: new Date(),
          })
          .where(eq(schema.creditBillingSettings.id, 'default'))
          .returning();
        await tx.insert(schema.creditBillingSettingEvents).values({
          previousSettings: settingsSnapshot(previous),
          nextSettings: settingsSnapshot(next!),
          actorClerkUserId: input.actorClerkUserId,
        });
        return next!;
      });
    },

    estimateAnalysis(input) {
      return estimateAnalysis(database, input.billingSignature);
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
            description: 'Administrator credit adjustment',
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
            .where(
              eq(schema.creditLedgerEntries.idempotencyKey, idempotencyKey),
            );
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

    async reserveAnalysis(input) {
      return database.transaction(async (tx) => {
        const settings = await ensureCreditSettings(tx);
        const estimate = await estimateAnalysis(
          tx,
          input.billingSignature,
          settings,
        );
        const [created] = await tx
          .insert(schema.creditReservations)
          .values({
            requestId: input.requestId,
            clerkUserId: input.clerkUserId,
            units: estimate.reservedPoints,
            estimatedCostUsd: estimate.estimatedCostUsd,
            pricingSnapshot: {
              points_per_usd: settings.pointsPerUsd,
              markup_basis_points: settings.markupBasisPoints,
              reserve_buffer_basis_points: settings.reserveBufferBasisPoints,
              estimate_source: estimate.source,
              sample_count: estimate.sampleCount,
              billing_signature: input.billingSignature,
            },
            status: 'reserved',
          })
          .onConflictDoNothing()
          .returning();
        if (!created) {
          const [existing] = await tx
            .select()
            .from(schema.creditReservations)
            .where(eq(schema.creditReservations.requestId, input.requestId));
          if (
            existing?.clerkUserId === input.clerkUserId &&
            existing.pricingSnapshot?.billing_signature ===
              input.billingSignature &&
            existing.status !== 'released'
          ) {
            return 'existing';
          }
          throw new BillingRepositoryError(
            'IDEMPOTENCY_CONFLICT',
            'The analysis request ID was already used',
          );
        }

        const [account] = await tx
          .update(schema.creditAccounts)
          .set({
            availableCredits: sql`${schema.creditAccounts.availableCredits} - ${estimate.reservedPoints}`,
            reservedCredits: sql`${schema.creditAccounts.reservedCredits} + ${estimate.reservedPoints}`,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(schema.creditAccounts.clerkUserId, input.clerkUserId),
              gte(
                schema.creditAccounts.availableCredits,
                estimate.reservedPoints,
              ),
            ),
          )
          .returning({ clerkUserId: schema.creditAccounts.clerkUserId });
        if (!account) {
          throw new BillingRepositoryError(
            'INSUFFICIENT_CREDITS',
            'There are not enough analysis credits available',
          );
        }
        await tx.insert(schema.creditLedgerEntries).values({
          clerkUserId: input.clerkUserId,
          entryType: 'reserve',
          availableDelta: -estimate.reservedPoints,
          reservedDelta: estimate.reservedPoints,
          idempotencyKey: `analysis:${input.requestId}:reserve`,
          referenceType: 'analysis_request',
          referenceId: input.requestId,
          description: 'Analysis credit reserved',
          metadata: {
            estimatedCostUsd: estimate.estimatedCostUsd,
            reservedPoints: estimate.reservedPoints,
            source: estimate.source,
            sampleCount: estimate.sampleCount,
          },
        });
        return 'created';
      });
    },

    async attachAnalysis(requestId, analysisJobId) {
      const [reservation] = await database
        .update(schema.creditReservations)
        .set({ analysisJobId, updatedAt: new Date() })
        .where(eq(schema.creditReservations.requestId, requestId))
        .returning({ requestId: schema.creditReservations.requestId });
      if (!reservation) {
        throw new BillingRepositoryError(
          'RESERVATION_NOT_FOUND',
          'Credit reservation not found',
        );
      }
    },

    async releaseAnalysis(requestId, reason) {
      await database.transaction(async (tx) => {
        const [reservation] = await tx
          .update(schema.creditReservations)
          .set({
            status: 'released',
            reason,
            settledAt: new Date(),
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(schema.creditReservations.requestId, requestId),
              eq(schema.creditReservations.status, 'reserved'),
            ),
          )
          .returning();
        if (!reservation) return;
        await tx
          .update(schema.creditAccounts)
          .set({
            availableCredits: sql`${schema.creditAccounts.availableCredits} + ${reservation.units}`,
            reservedCredits: sql`${schema.creditAccounts.reservedCredits} - ${reservation.units}`,
            updatedAt: new Date(),
          })
          .where(
            eq(schema.creditAccounts.clerkUserId, reservation.clerkUserId),
          );
        await tx.insert(schema.creditLedgerEntries).values({
          clerkUserId: reservation.clerkUserId,
          entryType: 'release',
          availableDelta: reservation.units,
          reservedDelta: -reservation.units,
          idempotencyKey: `analysis:${requestId}:release`,
          referenceType: 'analysis_request',
          referenceId: requestId,
          description: 'Analysis credit released',
          metadata: { reason },
        });
      });
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

async function ensureCreditSettings(
  database: QueryDatabase,
): Promise<CreditBillingSettings> {
  const [created] = await database
    .insert(schema.creditBillingSettings)
    .values({ id: 'default' })
    .onConflictDoNothing()
    .returning();
  if (created) return created;
  const [settings] = await database
    .select()
    .from(schema.creditBillingSettings)
    .where(eq(schema.creditBillingSettings.id, 'default'));
  return settings!;
}

async function estimateAnalysis(
  database: QueryDatabase,
  billingSignature: string,
  currentSettings?: CreditBillingSettings,
): Promise<AnalysisCreditEstimate> {
  const settings = currentSettings ?? (await ensureCreditSettings(database));
  const matchingCosts = await database
    .select({
      costUsd: schema.analysisJobs.costUsd,
    })
    .from(schema.creditReservations)
    .innerJoin(
      schema.analysisJobs,
      eq(schema.creditReservations.analysisJobId, schema.analysisJobs.id),
    )
    .where(
      and(
        eq(schema.analysisJobs.status, 'succeeded'),
        gt(schema.analysisJobs.costUsd, '0'),
        sql`${schema.creditReservations.pricingSnapshot}->>'billing_signature' = ${billingSignature}`,
      ),
    )
    .orderBy(desc(schema.analysisJobs.finishedAt))
    .limit(100);
  const historicalCost = discreteP90(matchingCosts.map((job) => job.costUsd));
  const estimatedCostUsd = historicalCost ?? settings.defaultEstimatedCostUsd;
  return {
    estimatedCostUsd,
    reservedPoints: calculateReservedPoints(estimatedCostUsd, {
      pointsPerUsd: settings.pointsPerUsd,
      markupBasisPoints: settings.markupBasisPoints,
      reserveBufferBasisPoints: settings.reserveBufferBasisPoints,
    }),
    source: historicalCost === undefined ? 'default' : 'history',
    sampleCount: matchingCosts.length,
  };
}

function settingsSnapshot(
  settings: CreditBillingSettings,
): Record<string, unknown> {
  return {
    pointsPerUsd: settings.pointsPerUsd,
    markupBasisPoints: settings.markupBasisPoints,
    reserveBufferBasisPoints: settings.reserveBufferBasisPoints,
    defaultEstimatedCostUsd: settings.defaultEstimatedCostUsd,
    signupGrantUsd: settings.signupGrantUsd,
    referralRewardUsd: settings.referralRewardUsd,
    updatedByClerkUserId: settings.updatedByClerkUserId,
    updatedAt: settings.updatedAt.toISOString(),
  };
}
