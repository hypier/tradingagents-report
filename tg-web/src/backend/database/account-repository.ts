/**
 * 账户领域持久化。
 *
 * 负责从 Clerk 同步本地用户资料与偏好设置。
 * 创建用户时会同时确保存在余额为 0 的 `credit_accounts` 行。
 */
import { eq, inArray } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

import type {
  AccountPreferences,
  AccountProfile,
} from '../account/contract';
import type { AuthUser } from '../auth/contract';
import { createReferralCode } from './referral-code';
import * as schema from './schema';

export interface AccountRepository {
  /** 将 Clerk 身份 upsert 到账户表，并确保积分钱包存在。 */
  syncUser(user: AuthUser): Promise<void>;
  /** 加载账户设置页所需的资料。 */
  getProfile(clerkUserId: string): Promise<AccountProfile>;
  /** 按 Clerk 用户 ID 批量加载资料（用于管理端列表联表展示）。 */
  listProfilesByIds(
    clerkUserIds: string[],
  ): Promise<Map<string, Pick<AccountProfile, 'displayName' | 'avatarUrl' | 'email'>>>;
  /** 持久化界面/报告偏好字段，并返回刷新后的资料。 */
  updatePreferences(
    clerkUserId: string,
    preferences: AccountPreferences,
  ): Promise<AccountProfile>;
}

export class AccountRepositoryError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'AccountRepositoryError';
  }
}

type Database = NodePgDatabase<typeof schema>;

export function createAccountRepository(database: Database): AccountRepository {
  const getProfile = async (clerkUserId: string): Promise<AccountProfile> => {
    const [user] = await database
      .select()
      .from(schema.accountUsers)
      .where(eq(schema.accountUsers.clerkUserId, clerkUserId));
    if (!user) {
      throw new AccountRepositoryError(
        'PROFILE_NOT_FOUND',
        'Account profile not found',
      );
    }
    return {
      clerkUserId: user.clerkUserId,
      displayName: user.displayName,
      email: user.email,
      avatarUrl: user.avatarUrl,
      interfaceLanguage:
        user.interfaceLanguage as AccountProfile['interfaceLanguage'],
      reportLanguage: user.reportLanguage,
      timezone: user.timezone,
      defaultMarket: user.defaultMarket as AccountProfile['defaultMarket'],
      stripeCustomerId: user.stripeCustomerId,
    };
  };

  return {
    async syncUser(user) {
      await database.transaction(async (tx) => {
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
        await tx
          .insert(schema.creditAccounts)
          .values({ clerkUserId: user.id })
          .onConflictDoNothing();
      });
    },

    getProfile,

    async listProfilesByIds(clerkUserIds) {
      const unique = [
        ...new Set(
          clerkUserIds.map((id) => id.trim()).filter(Boolean),
        ),
      ];
      const result = new Map<
        string,
        Pick<AccountProfile, 'displayName' | 'avatarUrl' | 'email'>
      >();
      if (unique.length === 0) return result;
      const rows = await database
        .select({
          clerkUserId: schema.accountUsers.clerkUserId,
          displayName: schema.accountUsers.displayName,
          avatarUrl: schema.accountUsers.avatarUrl,
          email: schema.accountUsers.email,
        })
        .from(schema.accountUsers)
        .where(inArray(schema.accountUsers.clerkUserId, unique));
      for (const row of rows) {
        result.set(row.clerkUserId, {
          displayName: row.displayName,
          avatarUrl: row.avatarUrl,
          email: row.email,
        });
      }
      return result;
    },

    async updatePreferences(clerkUserId, preferences) {
      const [updated] = await database
        .update(schema.accountUsers)
        .set({ ...preferences, updatedAt: new Date() })
        .where(eq(schema.accountUsers.clerkUserId, clerkUserId))
        .returning();
      if (!updated) {
        throw new AccountRepositoryError(
          'PROFILE_NOT_FOUND',
          'Account profile not found',
        );
      }
      return getProfile(clerkUserId);
    },
  };
}
