import { and, eq } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

import * as schema from './schema';

export type UserReportMeta = typeof schema.userReportMeta.$inferSelect;

export interface ReportMetaRepository {
  get(
    clerkUserId: string,
    analysisJobId: string,
  ): Promise<UserReportMeta | undefined>;
  listForUser(clerkUserId: string): Promise<UserReportMeta[]>;
  upsert(input: {
    clerkUserId: string;
    analysisJobId: string;
    isFavorite?: boolean;
    isArchived?: boolean;
    notes?: string | null;
  }): Promise<UserReportMeta>;
}

type Database = NodePgDatabase<typeof schema>;

export function createReportMetaRepository(
  database: Database,
): ReportMetaRepository {
  return {
    async get(clerkUserId, analysisJobId) {
      const [row] = await database
        .select()
        .from(schema.userReportMeta)
        .where(
          and(
            eq(schema.userReportMeta.clerkUserId, clerkUserId),
            eq(schema.userReportMeta.analysisJobId, analysisJobId),
          ),
        );
      return row;
    },

    listForUser(clerkUserId) {
      return database
        .select()
        .from(schema.userReportMeta)
        .where(eq(schema.userReportMeta.clerkUserId, clerkUserId));
    },

    async upsert(input) {
      const existing = await this.get(input.clerkUserId, input.analysisJobId);
      const isFavorite =
        input.isFavorite === undefined
          ? (existing?.isFavorite ?? 0)
          : input.isFavorite
            ? 1
            : 0;
      const isArchived =
        input.isArchived === undefined
          ? (existing?.isArchived ?? 0)
          : input.isArchived
            ? 1
            : 0;
      const notes =
        input.notes === undefined ? (existing?.notes ?? null) : input.notes;

      const [row] = await database
        .insert(schema.userReportMeta)
        .values({
          clerkUserId: input.clerkUserId,
          analysisJobId: input.analysisJobId,
          isFavorite,
          isArchived,
          notes,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [
            schema.userReportMeta.clerkUserId,
            schema.userReportMeta.analysisJobId,
          ],
          set: {
            isFavorite,
            isArchived,
            notes,
            updatedAt: new Date(),
          },
        })
        .returning();
      return row!;
    },
  };
}

export function metaFlags(meta?: UserReportMeta | null) {
  return {
    isFavorite: Boolean(meta?.isFavorite),
    isArchived: Boolean(meta?.isArchived),
    notes: meta?.notes ?? null,
  };
}
