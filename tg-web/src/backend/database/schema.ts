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

export const productUsers = pgTable(
  'product_users',
  {
    clerkUserId: text('clerk_user_id').primaryKey(),
    displayName: text('display_name').notNull(),
    email: text('email'),
    avatarUrl: text('avatar_url').notNull().default(''),
    interfaceLanguage: text('interface_language').notNull().default('en'),
    reportLanguage: text('report_language').notNull().default('English'),
    timezone: text('timezone').notNull().default('UTC'),
    defaultMarket: text('default_market').notNull().default('US'),
    stripeCustomerId: text('stripe_customer_id'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('product_users_stripe_customer_key')
      .on(table.stripeCustomerId)
      .where(sql`${table.stripeCustomerId} is not null`),
  ],
);

export const userConsents = pgTable(
  'user_consents',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    clerkUserId: text('clerk_user_id')
      .notNull()
      .references(() => productUsers.clerkUserId, { onDelete: 'cascade' }),
    documentType: text('document_type')
      .$type<'risk_disclaimer' | 'terms' | 'privacy'>()
      .notNull(),
    documentVersion: text('document_version').notNull(),
    acceptedAt: timestamp('accepted_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
  },
  (table) => [
    uniqueIndex('user_consents_document_key').on(
      table.clerkUserId,
      table.documentType,
      table.documentVersion,
    ),
  ],
);

export const billingSubscriptions = pgTable(
  'billing_subscriptions',
  {
    stripeSubscriptionId: text('stripe_subscription_id').primaryKey(),
    clerkUserId: text('clerk_user_id')
      .notNull()
      .references(() => productUsers.clerkUserId, { onDelete: 'cascade' }),
    stripeCustomerId: text('stripe_customer_id').notNull(),
    stripePriceId: text('stripe_price_id').notNull(),
    status: text('status').notNull(),
    cancelAtPeriodEnd: integer('cancel_at_period_end').notNull().default(0),
    currentPeriodStart: timestamp('current_period_start', {
      withTimezone: true,
    }),
    currentPeriodEnd: timestamp('current_period_end', { withTimezone: true }),
    latestInvoiceId: text('latest_invoice_id'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('billing_subscriptions_user_status_idx').on(
      table.clerkUserId,
      table.status,
    ),
  ],
);

export const creditAccounts = pgTable('credit_accounts', {
  clerkUserId: text('clerk_user_id')
    .primaryKey()
    .references(() => productUsers.clerkUserId, { onDelete: 'cascade' }),
  availableCredits: integer('available_credits').notNull().default(0),
  reservedCredits: integer('reserved_credits').notNull().default(0),
  spentCredits: integer('spent_credits').notNull().default(0),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const creditReservations = pgTable(
  'credit_reservations',
  {
    requestId: uuid('request_id').primaryKey(),
    clerkUserId: text('clerk_user_id')
      .notNull()
      .references(() => productUsers.clerkUserId, { onDelete: 'cascade' }),
    analysisJobId: uuid('analysis_job_id'),
    units: integer('units').notNull(),
    status: text('status')
      .$type<'reserved' | 'consumed' | 'released'>()
      .notNull(),
    reason: text('reason'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    settledAt: timestamp('settled_at', { withTimezone: true }),
  },
  (table) => [
    check('credit_reservations_units_check', sql`${table.units} > 0`),
    uniqueIndex('credit_reservations_analysis_job_key')
      .on(table.analysisJobId)
      .where(sql`${table.analysisJobId} is not null`),
    index('credit_reservations_user_created_idx').on(
      table.clerkUserId,
      desc(table.createdAt),
    ),
  ],
);

export const creditLedgerEntries = pgTable(
  'credit_ledger_entries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    clerkUserId: text('clerk_user_id')
      .notNull()
      .references(() => productUsers.clerkUserId, { onDelete: 'cascade' }),
    entryType: text('entry_type')
      .$type<'grant' | 'reserve' | 'consume' | 'release' | 'adjustment'>()
      .notNull(),
    availableDelta: integer('available_delta').notNull().default(0),
    reservedDelta: integer('reserved_delta').notNull().default(0),
    spentDelta: integer('spent_delta').notNull().default(0),
    idempotencyKey: text('idempotency_key').notNull(),
    referenceType: text('reference_type').notNull(),
    referenceId: text('reference_id').notNull(),
    description: text('description').notNull(),
    metadata: jsonb('metadata')
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('credit_ledger_idempotency_key').on(table.idempotencyKey),
    index('credit_ledger_user_created_idx').on(
      table.clerkUserId,
      desc(table.createdAt),
    ),
  ],
);

export const stripeWebhookEvents = pgTable('stripe_webhook_events', {
  stripeEventId: text('stripe_event_id').primaryKey(),
  eventType: text('event_type').notNull(),
  status: text('status')
    .$type<'processing' | 'processed' | 'failed' | 'ignored'>()
    .notNull(),
  payload: jsonb('payload').$type<Record<string, unknown>>().notNull(),
  error: text('error'),
  receivedAt: timestamp('received_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  processedAt: timestamp('processed_at', { withTimezone: true }),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const billingProviderConfigs = pgTable('billing_provider_configs', {
  provider: text('provider').$type<'stripe'>().primaryKey(),
  secretKeyCiphertext: text('secret_key_ciphertext').notNull(),
  webhookSecretCiphertext: text('webhook_secret_ciphertext').notNull(),
  updatedByClerkUserId: text('updated_by_clerk_user_id').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const billingConfigAuditEvents = pgTable(
  'billing_config_audit_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    provider: text('provider').$type<'stripe'>().notNull(),
    action: text('action').$type<'configured' | 'cleared'>().notNull(),
    actorClerkUserId: text('actor_clerk_user_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('billing_config_audit_provider_created_idx').on(
      table.provider,
      desc(table.createdAt),
    ),
  ],
);

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
