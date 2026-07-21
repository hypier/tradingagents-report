import { eq, sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

import type { ReferralSummary } from '../account/contract';
import type { AuthUser } from '../auth/contract';
import { calculateGrantPoints } from '../billing/credit-pricing';
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

        const settings = await ensureCreditSettings(tx);
        const signupGrantPoints = calculateGrantPoints(
          settings.signupGrantUsd,
          settings.pointsPerUsd,
        );
        const referralRewardPoints = calculateGrantPoints(
          settings.referralRewardUsd,
          settings.pointsPerUsd,
        );

        if (signupGrantPoints > 0) {
          const [entry] = await tx
            .insert(schema.creditLedgerEntries)
            .values({
              clerkUserId: user.id,
              entryType: 'grant',
              availableDelta: signupGrantPoints,
              idempotencyKey: `signup:${user.id}:grant`,
              referenceType: 'signup_grant',
              referenceId: user.id,
              description: 'New user welcome credits',
              metadata: {
                amountUsd: settings.signupGrantUsd,
                pointsPerUsd: settings.pointsPerUsd,
                points: signupGrantPoints,
              },
            })
            .onConflictDoNothing()
            .returning({ id: schema.creditLedgerEntries.id });
          if (entry) {
            await addAvailableCredits(tx, user.id, signupGrantPoints);
          }
        }

        const inviter = referralCode
          ? await findInviter(tx, referralCode, user.id)
          : undefined;
        if (inviter) {
          const [relationship] = await tx
            .insert(schema.referralRelationships)
            .values({
              inviteeClerkUserId: user.id,
              inviterClerkUserId: inviter.clerkUserId,
              referralCode: inviter.referralCode,
              pointsPerUsd: settings.pointsPerUsd,
              signupGrantUsd: settings.signupGrantUsd,
              signupGrantPoints,
              referralRewardUsd: settings.referralRewardUsd,
              referralRewardPoints,
            })
            .onConflictDoNothing()
            .returning({
              inviteeClerkUserId:
                schema.referralRelationships.inviteeClerkUserId,
            });
          if (relationship && referralRewardPoints > 0) {
            const [entry] = await tx
              .insert(schema.creditLedgerEntries)
              .values({
                clerkUserId: inviter.clerkUserId,
                entryType: 'grant',
                availableDelta: referralRewardPoints,
                idempotencyKey: `referral:${user.id}:reward`,
                referenceType: 'referral_reward',
                referenceId: user.id,
                description: 'Referral signup reward',
                metadata: {
                  inviteeClerkUserId: user.id,
                  inviterClerkUserId: inviter.clerkUserId,
                  referralCode: inviter.referralCode,
                  amountUsd: settings.referralRewardUsd,
                  pointsPerUsd: settings.pointsPerUsd,
                  points: referralRewardPoints,
                },
              })
              .onConflictDoNothing()
              .returning({ id: schema.creditLedgerEntries.id });
            if (entry) {
              await addAvailableCredits(
                tx,
                inviter.clerkUserId,
                referralRewardPoints,
              );
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
      const [user, aggregate] = await Promise.all([
        database
          .select({ referralCode: schema.accountUsers.referralCode })
          .from(schema.accountUsers)
          .where(eq(schema.accountUsers.clerkUserId, clerkUserId))
          .then((rows) => rows[0]),
        database
          .select({
            successfulReferrals: sql<number>`count(*)::int`,
            earnedCredits: sql<number>`coalesce(sum(${schema.referralRelationships.referralRewardPoints}), 0)::bigint`,
          })
          .from(schema.referralRelationships)
          .where(
            eq(schema.referralRelationships.inviterClerkUserId, clerkUserId),
          )
          .then((rows) => rows[0]),
      ]);
      if (!user) throw new Error('Account profile not found');
      return {
        referralPath: `/invite/${user.referralCode}`,
        successfulReferrals: aggregate?.successfulReferrals ?? 0,
        earnedCredits: Number(aggregate?.earnedCredits ?? 0),
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

async function ensureCreditSettings(tx: Transaction) {
  await tx
    .insert(schema.creditBillingSettings)
    .values({ id: 'default' })
    .onConflictDoNothing();
  const [settings] = await tx
    .select()
    .from(schema.creditBillingSettings)
    .where(eq(schema.creditBillingSettings.id, 'default'));
  return settings!;
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
