import { and, desc, eq } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

import { analysisJobs, llmModelPrices, llmPricingSources } from './schema';

export type AnalysisJob = typeof analysisJobs.$inferSelect;
export type ModelPrice = typeof llmModelPrices.$inferSelect;
export type NewModelPrice = typeof llmModelPrices.$inferInsert;
export type PricingSource = typeof llmPricingSources.$inferSelect;
export type ModelPriceKey = Pick<
  ModelPrice,
  'provider' | 'model' | 'billingMode' | 'contextTier'
>;

export type AnalysisJobsRepository = {
  getById(id: string): Promise<AnalysisJob | undefined>;
  list(input: {
    ticker?: string;
    status?: AnalysisJob['status'];
    limit: number;
    offset: number;
  }): Promise<AnalysisJob[]>;
};

export type ModelPricesRepository = {
  list(input: { provider?: string }): Promise<ModelPrice[]>;
  upsert(input: NewModelPrice): Promise<ModelPrice>;
  delete(key: ModelPriceKey): Promise<void>;
};

export type PricingSourcesRepository = {
  list(): Promise<PricingSource[]>;
};

type Database = NodePgDatabase<{
  analysisJobs: typeof analysisJobs;
  llmModelPrices: typeof llmModelPrices;
  llmPricingSources: typeof llmPricingSources;
}>;

export function createRepositories(database: Database): {
  analysisJobs: AnalysisJobsRepository;
  modelPrices: ModelPricesRepository;
  pricingSources: PricingSourcesRepository;
} {
  return {
    analysisJobs: {
      async getById(id) {
        const [analysisJob] = await database
          .select()
          .from(analysisJobs)
          .where(eq(analysisJobs.id, id));

        return analysisJob;
      },
      list(input) {
        const where = input.ticker
          ? input.status
            ? and(
                eq(analysisJobs.ticker, input.ticker),
                eq(analysisJobs.status, input.status),
              )
            : eq(analysisJobs.ticker, input.ticker)
          : input.status
            ? eq(analysisJobs.status, input.status)
            : undefined;

        return database
          .select()
          .from(analysisJobs)
          .where(where)
          .orderBy(desc(analysisJobs.createdAt))
          .limit(input.limit)
          .offset(input.offset);
      },
    },
    modelPrices: {
      list(input) {
        return database
          .select()
          .from(llmModelPrices)
          .where(
            input.provider
              ? eq(llmModelPrices.provider, input.provider)
              : undefined,
          );
      },
      async upsert(input) {
        const [modelPrice] = await database
          .insert(llmModelPrices)
          .values(input)
          .onConflictDoUpdate({
            target: [
              llmModelPrices.provider,
              llmModelPrices.model,
              llmModelPrices.billingMode,
              llmModelPrices.contextTier,
            ],
            set: {
              currency: input.currency,
              unitTokens: input.unitTokens,
              inputPrice: input.inputPrice,
              cachedInputPrice: input.cachedInputPrice,
              cacheWritePrice: input.cacheWritePrice,
              outputPrice: input.outputPrice,
              sourceUrl: input.sourceUrl,
              updatedAt: new Date(),
            },
          })
          .returning();

        return modelPrice!;
      },
      async delete(key) {
        await database
          .delete(llmModelPrices)
          .where(
            and(
              eq(llmModelPrices.provider, key.provider),
              eq(llmModelPrices.model, key.model),
              eq(llmModelPrices.billingMode, key.billingMode),
              eq(llmModelPrices.contextTier, key.contextTier),
            ),
          );
      },
    },
    pricingSources: {
      list() {
        return database.select().from(llmPricingSources);
      },
    },
  };
}
