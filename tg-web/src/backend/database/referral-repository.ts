import { and, eq, isNull, sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

import type { ReferralSummary } from '../account/contract';
import type { AuthUser } from '../auth/contract';
import {
  DEFAULT_REWARDS_SETTINGS,
  parseRewardsSettings,
  type RewardsSettings,
} from '../../shared/product-credits';
import { createReferralCode } from './referral-code';
import * as schema from './schema';

export interface ReferralRepository {
  isValidCode(code: string): Promise<boolean>;
  completeFirstAccess(
    user: AuthUser,
    referralCode: string | null,
  ): Promise<void>;
  getSummary(clerkUserId: string): Promise<ReferralSummary>;
}

type Database = NodePgDatabase<typeof schema>;
type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];

export function createReferralRepository(
  database: Database,
): ReferralRepository {
  return {
    async isValidCode(code) {
      const [user] = await database
        .select({ clerkUserId: schema.accountUsers.clerkUserId })
        .from(schema.accountUsers)
        .where(eq(schema.accountUsers.referralCode, code));
      return user !== undefined;
    },

    async completeFirstAccess(user, referralCode) {
      await database.transaction(async (tx) => {
        await upsertUser(tx, user);
        await tx
          .insert(schema.creditAccounts)
          .values({ clerkUserId: user.id })
          .onConflictDoNothing();

        const [localUser] = await tx
          .select({
            onboardingCompletedAt: schema.accountUsers.onboardingCompletedAt,
          })
          .from(schema.accountUsers)
          .where(eq(schema.accountUsers.clerkUserId, user.id))
          .for('update');
        if (localUser?.onboardingCompletedAt) return;

        const rewards = await loadRewardsSettings(tx);

        if (rewards.signup.enabled && rewards.signup.points > 0) {
          const points = rewards.signup.points;
          const [entry] = await tx
            .insert(schema.creditLedgerEntries)
            .values({
              clerkUserId: user.id,
              entryType: 'grant',
              availableDelta: points,
              idempotencyKey: `signup:${user.id}:grant`,
              referenceType: 'signup_grant',
              referenceId: user.id,
              description: 'New user welcome credits',
              metadata: {
                points,
                channel: 'signup',
              },
            })
            .onConflictDoNothing()
            .returning({ id: schema.creditLedgerEntries.id });
          if (entry) {
            await addAvailableCredits(tx, user.id, points);
          }
        }

        const inviter = referralCode
          ? await findInviter(tx, referralCode, user.id)
          : undefined;
        if (inviter) {
          await tx
            .update(schema.accountUsers)
            .set({
              referredByClerkUserId: inviter.clerkUserId,
              updatedAt: new Date(),
            })
            .where(
              and(
                eq(schema.accountUsers.clerkUserId, user.id),
                isNull(schema.accountUsers.referredByClerkUserId),
              ),
            );

          if (rewards.referral.enabled && rewards.referral.points > 0) {
            const points = rewards.referral.points;
            const [entry] = await tx
              .insert(schema.creditLedgerEntries)
              .values({
                clerkUserId: inviter.clerkUserId,
                entryType: 'grant',
                availableDelta: points,
                idempotencyKey: `referral:${user.id}:reward`,
                referenceType: 'referral_reward',
                referenceId: user.id,
                description: 'Referral signup reward',
                metadata: {
                  inviteeClerkUserId: user.id,
                  inviterClerkUserId: inviter.clerkUserId,
                  referralCode: inviter.referralCode,
                  points,
                  channel: 'referral',
                },
              })
              .onConflictDoNothing()
              .returning({ id: schema.creditLedgerEntries.id });
            if (entry) {
              await addAvailableCredits(tx, inviter.clerkUserId, points);
            }
          }
        }

        await tx
          .update(schema.accountUsers)
          .set({ onboardingCompletedAt: new Date(), updatedAt: new Date() })
          .where(eq(schema.accountUsers.clerkUserId, user.id));
      });
    },

    async getSummary(clerkUserId) {
      const [user, aggregate, earned] = await Promise.all([
        database
          .select({ referralCode: schema.accountUsers.referralCode })
          .from(schema.accountUsers)
          .where(eq(schema.accountUsers.clerkUserId, clerkUserId))
          .then((rows) => rows[0]),
        database
          .select({
            successfulReferrals: sql<number>`count(*)::int`,
          })
          .from(schema.accountUsers)
          .where(eq(schema.accountUsers.referredByClerkUserId, clerkUserId))
          .then((rows) => rows[0]),
        database
          .select({
            earnedCredits: sql<number>`coalesce(sum(${schema.creditLedgerEntries.availableDelta}), 0)::bigint`,
          })
          .from(schema.creditLedgerEntries)
          .where(
            and(
              eq(schema.creditLedgerEntries.clerkUserId, clerkUserId),
              eq(schema.creditLedgerEntries.referenceType, 'referral_reward'),
            ),
          )
          .then((rows) => rows[0]),
      ]);
      if (!user) throw new Error('Account profile not found');

      return {
        referralPath: `/invite/${user.referralCode}`,
        successfulReferrals: aggregate?.successfulReferrals ?? 0,
        earnedCredits: Number(earned?.earnedCredits ?? 0),
      };
    },
  };
}

async function upsertUser(tx: Transaction, user: AuthUser) {
  await tx
    .insert(schema.accountUsers)
    .values({
      clerkUserId: user.id,
      displayName: user.displayName,
      email: user.email,
      avatarUrl: user.imageUrl,
      referralCode: createReferralCode(),
    })
    .onConflictDoUpdate({
      target: schema.accountUsers.clerkUserId,
      set: {
        displayName: user.displayName,
        email: user.email,
        avatarUrl: user.imageUrl,
        updatedAt: new Date(),
      },
    });
}

async function loadRewardsSettings(tx: Transaction): Promise<RewardsSettings> {
  const [row] = await tx
    .select({ value: schema.systemSettings.value })
    .from(schema.systemSettings)
    .where(eq(schema.systemSettings.key, 'rewards'));
  if (!row) {
    await tx
      .insert(schema.systemSettings)
      .values({ key: 'rewards', value: DEFAULT_REWARDS_SETTINGS })
      .onConflictDoNothing();
    return DEFAULT_REWARDS_SETTINGS;
  }
  return parseRewardsSettings(row.value);
}

async function findInviter(
  tx: Transaction,
  referralCode: string,
  inviteeClerkUserId: string,
) {
  const [inviter] = await tx
    .select({
      clerkUserId: schema.accountUsers.clerkUserId,
      referralCode: schema.accountUsers.referralCode,
    })
    .from(schema.accountUsers)
    .where(eq(schema.accountUsers.referralCode, referralCode));
  return inviter?.clerkUserId === inviteeClerkUserId ? undefined : inviter;
}

async function addAvailableCredits(
  tx: Transaction,
  clerkUserId: string,
  credits: number,
) {
  await tx
    .update(schema.creditAccounts)
    .set({
      availableCredits: sql`${schema.creditAccounts.availableCredits} + ${credits}`,
      updatedAt: new Date(),
    })
    .where(eq(schema.creditAccounts.clerkUserId, clerkUserId));
}
