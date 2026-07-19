import { and, desc, eq, gt, gte, inArray, sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

import {
  LEGAL_DOCUMENT_VERSIONS,
  type LegalDocumentType,
  type ProductPreferences,
  type ProductProfile,
} from '../account/contract';
import type { AuthUser } from '../auth/contract';
import type { StripeWebhookEvent } from '../billing/contract';
import * as schema from './schema';

export type CreditUsage = {
  availableCredits: number;
  reservedCredits: number;
  spentCredits: number;
  subscription: typeof schema.billingSubscriptions.$inferSelect | null;
  ledger: Array<typeof schema.creditLedgerEntries.$inferSelect>;
};

export interface ProductRepository {
  syncUser(user: AuthUser): Promise<void>;
  getProfile(clerkUserId: string): Promise<ProductProfile>;
  updatePreferences(
    clerkUserId: string,
    preferences: ProductPreferences,
  ): Promise<ProductProfile>;
  recordConsents(input: {
    clerkUserId: string;
    documentTypes: LegalDocumentType[];
    ipAddress: string | null;
    userAgent: string | null;
  }): Promise<ProductProfile>;
  hasCurrentConsents(clerkUserId: string): Promise<boolean>;
  setStripeCustomerId(clerkUserId: string, customerId: string): Promise<void>;
  getStripeCustomerId(clerkUserId: string): Promise<string | null>;
  getUsage(clerkUserId: string): Promise<CreditUsage>;
  reserveAnalysis(input: {
    clerkUserId: string;
    requestId: string;
    units: number;
  }): Promise<'created' | 'existing'>;
  attachAnalysis(requestId: string, analysisJobId: string): Promise<void>;
  releaseAnalysis(requestId: string, reason: string): Promise<void>;
  processStripeEvent(event: StripeWebhookEvent): Promise<boolean>;
  recordStripeFailure(event: StripeWebhookEvent, error: unknown): Promise<void>;
}

export class ProductRepositoryError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ProductRepositoryError';
  }
}

type Database = NodePgDatabase<typeof schema>;

export function createProductRepository(database: Database): ProductRepository {
  const getProfile = async (clerkUserId: string): Promise<ProductProfile> => {
    const [user] = await database
      .select()
      .from(schema.productUsers)
      .where(eq(schema.productUsers.clerkUserId, clerkUserId));
    if (!user) {
      throw new ProductRepositoryError(
        'PROFILE_NOT_FOUND',
        'Product profile not found',
      );
    }
    const consents = await database
      .select({
        documentType: schema.userConsents.documentType,
        documentVersion: schema.userConsents.documentVersion,
        acceptedAt: schema.userConsents.acceptedAt,
      })
      .from(schema.userConsents)
      .where(eq(schema.userConsents.clerkUserId, clerkUserId))
      .orderBy(desc(schema.userConsents.acceptedAt));

    return {
      ...user,
      interfaceLanguage:
        user.interfaceLanguage as ProductProfile['interfaceLanguage'],
      defaultMarket: user.defaultMarket as ProductProfile['defaultMarket'],
      consents,
      hasCurrentConsents: hasEveryCurrentConsent(consents),
    };
  };

  return {
    async syncUser(user) {
      await database.transaction(async (tx) => {
        await tx
          .insert(schema.productUsers)
          .values({
            clerkUserId: user.id,
            displayName: user.displayName,
            email: user.email,
            avatarUrl: user.imageUrl,
          })
          .onConflictDoUpdate({
            target: schema.productUsers.clerkUserId,
            set: {
              displayName: user.displayName,
              email: user.email,
              avatarUrl: user.imageUrl,
              updatedAt: new Date(),
            },
          });
        await tx
          .insert(schema.creditAccounts)
          .values({ clerkUserId: user.id })
          .onConflictDoNothing();
      });
    },

    getProfile,

    async updatePreferences(clerkUserId, preferences) {
      const [updated] = await database
        .update(schema.productUsers)
        .set({ ...preferences, updatedAt: new Date() })
        .where(eq(schema.productUsers.clerkUserId, clerkUserId))
        .returning();
      if (!updated) {
        throw new ProductRepositoryError(
          'PROFILE_NOT_FOUND',
          'Product profile not found',
        );
      }
      return getProfile(clerkUserId);
    },

    async recordConsents(input) {
      await database
        .insert(schema.userConsents)
        .values(
          input.documentTypes.map((documentType) => ({
            clerkUserId: input.clerkUserId,
            documentType,
            documentVersion: LEGAL_DOCUMENT_VERSIONS[documentType],
            ipAddress: input.ipAddress,
            userAgent: input.userAgent,
          })),
        )
        .onConflictDoNothing();
      return getProfile(input.clerkUserId);
    },

    async hasCurrentConsents(clerkUserId) {
      const rows = await database
        .select({
          documentType: schema.userConsents.documentType,
          documentVersion: schema.userConsents.documentVersion,
        })
        .from(schema.userConsents)
        .where(eq(schema.userConsents.clerkUserId, clerkUserId));
      return hasEveryCurrentConsent(rows);
    },

    async setStripeCustomerId(clerkUserId, customerId) {
      await database
        .update(schema.productUsers)
        .set({ stripeCustomerId: customerId, updatedAt: new Date() })
        .where(eq(schema.productUsers.clerkUserId, clerkUserId));
    },

    async getStripeCustomerId(clerkUserId) {
      const [user] = await database
        .select({ stripeCustomerId: schema.productUsers.stripeCustomerId })
        .from(schema.productUsers)
        .where(eq(schema.productUsers.clerkUserId, clerkUserId));
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
          throw new ProductRepositoryError(
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
          throw new ProductRepositoryError(
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
          throw new ProductRepositoryError(
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
        throw new ProductRepositoryError(
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
          .select({ clerkUserId: schema.productUsers.clerkUserId })
          .from(schema.productUsers)
          .where(eq(schema.productUsers.stripeCustomerId, customerId));
        if (!user) {
          throw new ProductRepositoryError(
            'BILLING_CUSTOMER_NOT_FOUND',
            `Stripe customer ${customerId} is not linked to a product user`,
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

function hasEveryCurrentConsent(
  rows: Array<{ documentType: LegalDocumentType; documentVersion: string }>,
) {
  return Object.entries(LEGAL_DOCUMENT_VERSIONS).every(
    ([documentType, version]) =>
      rows.some(
        (row) =>
          row.documentType === documentType && row.documentVersion === version,
      ),
  );
}

function fromUnix(value: number | null): Date | null {
  return value === null ? null : new Date(value * 1000);
}

function webhookAuditPayload(event: StripeWebhookEvent) {
  return {
    ...event.payload,
    subscription: event.subscription,
    creditGrant: event.creditGrant,
  };
}

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
