import { desc, sql } from 'drizzle-orm';
import {
  check,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

export const analysisJobs = pgTable(
  'analysis_jobs',
  {
    id: uuid('id').primaryKey(),
    requestId: uuid('request_id'),
    ticker: text('ticker').notNull(),
    exchange: text('exchange'),
    tradeDate: date('trade_date').notNull(),
    assetType: text('asset_type').notNull(),
    analysts: jsonb('analysts').$type<string[]>().notNull(),
    status: text('status')
      .$type<'queued' | 'running' | 'succeeded' | 'failed'>()
      .notNull(),
    request: jsonb('request').$type<Record<string, unknown>>().notNull(),
    config: jsonb('config')
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    display: jsonb('display')
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    finalState: jsonb('final_state').$type<Record<string, unknown> | null>(),
    decision: text('decision'),
    error: text('error'),
    reportPath: text('report_path'),
    tokensUsed: integer('tokens_used').notNull().default(0),
    tokenUsage: jsonb('token_usage')
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    costUsd: numeric('cost_usd', { precision: 18, scale: 8 })
      .notNull()
      .default('0'),
    costBreakdown: jsonb('cost_breakdown')
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    progressPercent: integer('progress_percent').notNull().default(0),
    currentStep: text('current_step'),
    events: jsonb('events')
      .$type<Record<string, unknown>[]>()
      .notNull()
      .default([]),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    startedAt: timestamp('started_at', { withTimezone: true }),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
  },
  (table) => [
    check(
      'analysis_jobs_status_check',
      sql`${table.status} in ('queued', 'running', 'succeeded', 'failed')`,
    ),
    uniqueIndex('analysis_jobs_request_id_key')
      .on(table.requestId)
      .where(sql`${table.requestId} is not null`),
    index('analysis_jobs_ticker_created_idx').on(
      table.ticker,
      desc(table.createdAt),
    ),
    index('analysis_jobs_status_created_idx').on(
      table.status,
      desc(table.createdAt),
    ),
  ],
);

export const llmModelPrices = pgTable(
  'llm_model_prices',
  {
    provider: text('provider').notNull(),
    model: text('model').notNull(),
    billingMode: text('billing_mode').notNull().default('standard'),
    contextTier: text('context_tier').notNull().default('short'),
    currency: text('currency').notNull().default('USD'),
    unitTokens: integer('unit_tokens').notNull().default(1_000_000),
    inputPrice: numeric('input_price', { precision: 18, scale: 8 }).notNull(),
    cachedInputPrice: numeric('cached_input_price', {
      precision: 18,
      scale: 8,
    }),
    cacheWritePrice: numeric('cache_write_price', { precision: 18, scale: 8 }),
    outputPrice: numeric('output_price', { precision: 18, scale: 8 }).notNull(),
    sourceUrl: text('source_url').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({
      columns: [
        table.provider,
        table.model,
        table.billingMode,
        table.contextTier,
      ],
    }),
  ],
);

export const llmPricingSources = pgTable('llm_pricing_sources', {
  sourceUrl: text('source_url').primaryKey(),
  updateIntervalSeconds: integer('update_interval_seconds')
    .notNull()
    .default(3600),
  lastCheckedAt: timestamp('last_checked_at', { withTimezone: true }),
  lastSuccessAt: timestamp('last_success_at', { withTimezone: true }),
  lastError: text('last_error'),
  modelCount: integer('model_count').notNull().default(0),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});
