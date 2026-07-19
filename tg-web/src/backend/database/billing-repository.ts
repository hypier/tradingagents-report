/**
 * 计费 / 积分领域持久化。
 *
 * 负责 Stripe Customer 关联、订阅镜像、分析积分预留/释放、账本读取，
 * 以及幂等的 webhook 落地。管理员 Stripe API 密钥由 `BillingConfigRepository` 管理。
 */
import { and, desc, eq, gt, gte, inArray, sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

import type { StripeWebhookEvent } from '../billing/contract';
import * as schema from './schema';

/** 供 UI 聚合的积分钱包 + 最新订阅 + 近期流水。 */
export type CreditUsage = {
  availableCredits: number;
  reservedCredits: number;
  spentCredits: number;
  subscription: typeof schema.billingSubscriptions.$inferSelect | null;
  ledger: Array<typeof schema.creditLedgerEntries.$inferSelect>;
};

export interface BillingRepository {
  /** 将 Stripe Customer ID 写入本地账户行。 */
  setStripeCustomerId(clerkUserId: string, customerId: string): Promise<void>;
  /** 读取已关联的 Stripe Customer ID；尚未创建时为 null。 */
  getStripeCustomerId(clerkUserId: string): Promise<string | null>;
  /** 积分余额、最新订阅镜像与近期账本行。 */
  getUsage(clerkUserId: string): Promise<CreditUsage>;
  /**
   * 为分析请求预留积分（按 requestId 幂等）。
   * 需要有效/试用中的订阅，且可用积分充足。
   */
  reserveAnalysis(input: {
    clerkUserId: string;
    requestId: string;
    units: number;
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

    async reserveAnalysis(input) {
      return database.transaction(async (tx) => {
        const [created] = await tx
          .insert(schema.creditReservations)
          .values({
            requestId: input.requestId,
            clerkUserId: input.clerkUserId,
            units: input.units,
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
            existing.units === input.units &&
            existing.status !== 'released'
          ) {
            return 'existing';
          }
          throw new BillingRepositoryError(
            'IDEMPOTENCY_CONFLICT',
            'The analysis request ID was already used',
          );
        }

        const [subscription] = await tx
          .select({ id: schema.billingSubscriptions.stripeSubscriptionId })
          .from(schema.billingSubscriptions)
          .where(
            and(
              eq(schema.billingSubscriptions.clerkUserId, input.clerkUserId),
              inArray(schema.billingSubscriptions.status, [
                'active',
                'trialing',
              ]),
              gt(schema.billingSubscriptions.currentPeriodEnd, new Date()),
            ),
          )
          .limit(1);
        if (!subscription) {
          throw new BillingRepositoryError(
            'SUBSCRIPTION_REQUIRED',
            'An active subscription is required to run an analysis',
          );
        }

        const [account] = await tx
          .update(schema.creditAccounts)
          .set({
            availableCredits: sql`${schema.creditAccounts.availableCredits} - ${input.units}`,
            reservedCredits: sql`${schema.creditAccounts.reservedCredits} + ${input.units}`,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(schema.creditAccounts.clerkUserId, input.clerkUserId),
              gte(schema.creditAccounts.availableCredits, input.units),
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
          availableDelta: -input.units,
          reservedDelta: input.units,
          idempotencyKey: `analysis:${input.requestId}:reserve`,
          referenceType: 'analysis_request',
          referenceId: input.requestId,
          description: 'Analysis credit reserved',
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
