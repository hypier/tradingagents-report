/**
 * 仓库组合入口。
 *
 * - 账户 / 计费领域逻辑放在独立文件中。
 * - 分析任务、LLM 价格、定价来源、管理员 Stripe 配置等轻量 CRUD 在此内联定义。
 */
import { and, desc, eq } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

import { analysisJobs, llmModelPrices, llmPricingSources } from './schema';
import * as schema from './schema';
import {
  createAccountRepository,
  type AccountRepository,
} from './account-repository';
import {
  createBillingRepository,
  type BillingRepository,
} from './billing-repository';

export type { AccountRepository } from './account-repository';
export type { BillingRepository } from './billing-repository';

export type AnalysisJob = typeof analysisJobs.$inferSelect;
export type ModelPrice = typeof llmModelPrices.$inferSelect;
export type NewModelPrice = typeof llmModelPrices.$inferInsert;
export type PricingSource = typeof llmPricingSources.$inferSelect;
export type ModelPriceKey = Pick<
  ModelPrice,
  'provider' | 'model' | 'billingMode' | 'contextTier'
>;

/** `analysis_jobs` 的只读访问，供管理/列表路径使用。 */
export type AnalysisJobsRepository = {
  getById(id: string): Promise<AnalysisJob | undefined>;
  list(input: {
    ticker?: string;
    status?: AnalysisJob['status'];
    limit: number;
    offset: number;
  }): Promise<AnalysisJob[]>;
};

/** `llm_model_prices` 的 upsert / 删除辅助。 */
export type ModelPricesRepository = {
  list(input: { provider?: string }): Promise<ModelPrice[]>;
  upsert(input: NewModelPrice): Promise<ModelPrice>;
  delete(key: ModelPriceKey): Promise<void>;
};

/** `llm_pricing_sources` 的读取辅助。 */
export type PricingSourcesRepository = {
  list(): Promise<PricingSource[]>;
};

/**
 * 管理员 Stripe 凭据存储（`billing_provider_configs`）。
 * 与负责用户账单/积分状态的 `BillingRepository` 不同。
 */
export type BillingConfigRepository = {
  getStripe(): Promise<
    typeof schema.billingProviderConfigs.$inferSelect | undefined
  >;
  setStripe(input: {
    secretKeyCiphertext: string;
    webhookSecretCiphertext: string;
    actorClerkUserId: string;
  }): Promise<void>;
  clearStripe(actorClerkUserId: string): Promise<void>;
};

type Database = NodePgDatabase<typeof schema>;

/** 将全部仓库绑定到同一个 Drizzle 数据库实例。 */
export function createRepositories(database: Database): {
  analysisJobs: AnalysisJobsRepository;
  modelPrices: ModelPricesRepository;
  pricingSources: PricingSourcesRepository;
  account: AccountRepository;
  billing: BillingRepository;
  billingConfig: BillingConfigRepository;
} {
  return {
    account: createAccountRepository(database),
    billing: createBillingRepository(database),
    billingConfig: {
      async getStripe() {
        const [configuration] = await database
          .select()
          .from(schema.billingProviderConfigs)
          .where(eq(schema.billingProviderConfigs.provider, 'stripe'));
        return configuration;
      },
      async setStripe(input) {
        await database.transaction(async (tx) => {
          await tx
            .insert(schema.billingProviderConfigs)
            .values({
              provider: 'stripe',
              secretKeyCiphertext: input.secretKeyCiphertext,
              webhookSecretCiphertext: input.webhookSecretCiphertext,
              updatedByClerkUserId: input.actorClerkUserId,
            })
            .onConflictDoUpdate({
              target: schema.billingProviderConfigs.provider,
              set: {
                secretKeyCiphertext: input.secretKeyCiphertext,
                webhookSecretCiphertext: input.webhookSecretCiphertext,
                updatedByClerkUserId: input.actorClerkUserId,
                updatedAt: new Date(),
              },
            });
          await tx.insert(schema.billingConfigAuditEvents).values({
            provider: 'stripe',
            action: 'configured',
            actorClerkUserId: input.actorClerkUserId,
          });
        });
      },
      async clearStripe(actorClerkUserId) {
        await database.transaction(async (tx) => {
          await tx
            .delete(schema.billingProviderConfigs)
            .where(eq(schema.billingProviderConfigs.provider, 'stripe'));
          await tx.insert(schema.billingConfigAuditEvents).values({
            provider: 'stripe',
            action: 'cleared',
            actorClerkUserId,
          });
        });
      },
    },
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
