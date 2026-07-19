/**
 * 账户领域持久化。
 *
 * 负责从 Clerk 同步本地用户资料、偏好设置与法律文档同意。
 * 创建用户时会同时确保存在余额为 0 的 `credit_accounts` 行。
 */
import { desc, eq } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

import {
  LEGAL_DOCUMENT_VERSIONS,
  type AccountPreferences,
  type AccountProfile,
  type LegalDocumentType,
} from '../account/contract';
import type { AuthUser } from '../auth/contract';
import * as schema from './schema';

export interface AccountRepository {
  /** 将 Clerk 身份 upsert 到账户表，并确保积分钱包存在。 */
  syncUser(user: AuthUser): Promise<void>;
  /** 加载账户设置页所需的资料与同意历史。 */
  getProfile(clerkUserId: string): Promise<AccountProfile>;
  /** 持久化界面/报告偏好字段，并返回刷新后的资料。 */
  updatePreferences(
    clerkUserId: string,
    preferences: AccountPreferences,
  ): Promise<AccountProfile>;
  /** 记录对当前法律文档版本的同意。 */
  recordConsents(input: {
    clerkUserId: string;
    documentTypes: LegalDocumentType[];
    ipAddress: string | null;
    userAgent: string | null;
  }): Promise<AccountProfile>;
  /** 当 LEGAL_DOCUMENT_VERSIONS 中的每份文档均已同意时返回 true。 */
  hasCurrentConsents(clerkUserId: string): Promise<boolean>;
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
        user.interfaceLanguage as AccountProfile['interfaceLanguage'],
      defaultMarket: user.defaultMarket as AccountProfile['defaultMarket'],
      consents,
      hasCurrentConsents: hasEveryCurrentConsent(consents),
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
