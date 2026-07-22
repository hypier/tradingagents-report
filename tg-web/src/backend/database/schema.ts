/**
 * tg-web PostgreSQL 的 Drizzle 表结构定义。
 *
 * 迁移由 tg-web 生成并执行（`pnpm db:migrate`）。
 * tg-core 仅校验共享表是否存在，不执行 DDL。
 *
 * 域划分：
 * - 账户：从 Clerk 同步的本地用户资料与推荐关系
 * - 计费 / 积分：Stripe 订阅与分析积分账本
 * - 分析任务：与 tg-core 共享的 job 持久化
 * - LLM 定价：模型单价缓存（成本计算用）
 * - LLM 目录：提供商凭据与对用户开放的模型
 * - 自选股：每用户收藏的标的（单表）
 */
import { desc, sql } from 'drizzle-orm';
import {
  type AnyPgColumn,
  bigint,
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

/**
 * Clerk 用户对应的本地账户（偏好设置 + Stripe Customer 关联）。
 */
export const accountUsers = pgTable(
  'account_users',
  {
    /** Clerk 用户 ID；账户/计费相关表共用的主键。 */
    clerkUserId: text('clerk_user_id').primaryKey(),
    /** 从 Clerk 同步的显示名。 */
    displayName: text('display_name').notNull(),
    /** Clerk 主邮箱；若无则为 null。 */
    email: text('email'),
    /** Clerk 头像 URL；未设置时为空字符串。 */
    avatarUrl: text('avatar_url').notNull().default(''),
    /** 界面语言：`en` | `zh-CN`。 */
    interfaceLanguage: text('interface_language').notNull().default('en'),
    /** 研究报告输出语言偏好。 */
    reportLanguage: text('report_language').notNull().default('English'),
    /** 本地时间展示用的 IANA 时区。 */
    timezone: text('timezone').notNull().default('UTC'),
    /** 默认市场：与 `market_configs.code` / `PRODUCT_MARKET_CODES` 对齐。 */
    defaultMarket: text('default_market').notNull().default('US'),
    /** 关联的 Stripe Customer ID（`cus_...`）；创建前为 null。 */
    stripeCustomerId: text('stripe_customer_id'),
    referralCode: text('referral_code').notNull(),
    /** 邀请人 Clerk 用户 ID；无邀请时为 null。 */
    referredByClerkUserId: text('referred_by_clerk_user_id').references(
      (): AnyPgColumn => accountUsers.clerkUserId,
      { onDelete: 'set null' },
    ),
    onboardingCompletedAt: timestamp('onboarding_completed_at', {
      withTimezone: true,
    }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('account_users_stripe_customer_key')
      .on(table.stripeCustomerId)
      .where(sql`${table.stripeCustomerId} is not null`),
    uniqueIndex('account_users_referral_code_key').on(table.referralCode),
    index('account_users_referred_by_idx').on(table.referredByClerkUserId),
    check(
      'account_users_referred_by_distinct_check',
      sql`${table.referredByClerkUserId} is null or ${table.referredByClerkUserId} <> ${table.clerkUserId}`,
    ),
  ],
);

/** Stripe 订阅的本地镜像，用于访问权限校验。 */
export const billingSubscriptions = pgTable(
  'billing_subscriptions',
  {
    /** Stripe Subscription ID（`sub_...`）。 */
    stripeSubscriptionId: text('stripe_subscription_id').primaryKey(),
    /** 所属 Clerk 用户。 */
    clerkUserId: text('clerk_user_id')
      .notNull()
      .references(() => accountUsers.clerkUserId, { onDelete: 'cascade' }),
    /** 订阅上的 Stripe Customer ID。 */
    stripeCustomerId: text('stripe_customer_id').notNull(),
    /** 当前计费的 Stripe Price ID（`price_...`）。 */
    stripePriceId: text('stripe_price_id').notNull(),
    /** Stripe 状态字符串（active、trialing、canceled 等）。 */
    status: text('status').notNull(),
    /** Stripe 开启 cancel_at_period_end 时为 1，否则为 0。 */
    cancelAtPeriodEnd: integer('cancel_at_period_end').notNull().default(0),
    /** 当前计费周期开始时间。 */
    currentPeriodStart: timestamp('current_period_start', {
      withTimezone: true,
    }),
    /** 当前计费周期结束时间；用于判断订阅是否仍有效。 */
    currentPeriodEnd: timestamp('current_period_end', { withTimezone: true }),
    /** 该订阅最近一张 Stripe Invoice ID。 */
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

/** 每用户分析积分余额（可用 / 预留 / 已消费）。 */
export const creditAccounts = pgTable('credit_accounts', {
  /** 每个 Clerk 用户一个积分钱包。 */
  clerkUserId: text('clerk_user_id')
    .primaryKey()
    .references(() => accountUsers.clerkUserId, { onDelete: 'cascade' }),
  /** 可预留给新分析的积分。 */
  availableCredits: bigint('available_credits', { mode: 'number' })
    .notNull()
    .default(0),
  /** 进行中分析预留占用的积分。 */
  reservedCredits: bigint('reserved_credits', { mode: 'number' })
    .notNull()
    .default(0),
  /** 已完成分析永久扣减的积分。 */
  spentCredits: bigint('spent_credits', { mode: 'number' })
    .notNull()
    .default(0),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/** 追加写的积分变动流水（发放、消费、调整等）。 */
export const creditLedgerEntries = pgTable(
  'credit_ledger_entries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** 受影响的 Clerk 用户。 */
    clerkUserId: text('clerk_user_id')
      .notNull()
      .references(() => accountUsers.clerkUserId, { onDelete: 'cascade' }),
    /** 变动类型：grant | reserve | consume | release | adjustment。 */
    entryType: text('entry_type')
      .$type<'grant' | 'reserve' | 'consume' | 'release' | 'adjustment'>()
      .notNull(),
    /** 对 available_credits 的有符号增量。 */
    availableDelta: bigint('available_delta', { mode: 'number' })
      .notNull()
      .default(0),
    /** 对 reserved_credits 的有符号增量。 */
    reservedDelta: bigint('reserved_delta', { mode: 'number' })
      .notNull()
      .default(0),
    /** 对 spent_credits 的有符号增量。 */
    spentDelta: bigint('spent_delta', { mode: 'number' }).notNull().default(0),
    /** 防止重复入账的唯一键。 */
    idempotencyKey: text('idempotency_key').notNull(),
    /** 外部引用类别（如 analysis_request、stripe_invoice）。 */
    referenceType: text('reference_type').notNull(),
    /** 与 referenceType 对应的外部引用 ID。 */
    referenceId: text('reference_id').notNull(),
    /** 供 UI/审计阅读的说明。 */
    description: text('description').notNull(),
    /** 额外结构化上下文（账单周期、释放原因等）。 */
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

/** Stripe webhook 投递日志，用于幂等处理。 */
export const stripeWebhookEvents = pgTable('stripe_webhook_events', {
  /** Stripe Event ID（`evt_...`）。 */
  stripeEventId: text('stripe_event_id').primaryKey(),
  /** Stripe 事件类型（如 invoice.paid）。 */
  eventType: text('event_type').notNull(),
  /** processing | processed | failed | ignored。 */
  status: text('status')
    .$type<'processing' | 'processed' | 'failed' | 'ignored'>()
    .notNull(),
  /** 规范化后的事件载荷，用于审计/重放。 */
  payload: jsonb('payload').$type<Record<string, unknown>>().notNull(),
  /** status 为 failed 时的最近错误信息。 */
  error: text('error'),
  /** 首次接受 webhook 的时间。 */
  receivedAt: timestamp('received_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  /** 处理完成（processed/ignored）的时间。 */
  processedAt: timestamp('processed_at', { withTimezone: true }),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/** 管理员维护的计费提供商凭据（当前为 Stripe，密文存储）。 */
export const billingProviderConfigs = pgTable('billing_provider_configs', {
  /** 提供商键；目前仅 `stripe`。 */
  provider: text('provider').$type<'stripe'>().primaryKey(),
  /** 加密后的 Stripe secret key 密文。 */
  secretKeyCiphertext: text('secret_key_ciphertext').notNull(),
  /** 加密后的 Stripe webhook 签名密钥密文。 */
  webhookSecretCiphertext: text('webhook_secret_ciphertext').notNull(),
  /** 最近写入该配置的管理员 Clerk 用户 ID。 */
  updatedByClerkUserId: text('updated_by_clerk_user_id').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/** 计费提供商配置变更的审计流水。 */
export const billingConfigAuditEvents = pgTable(
  'billing_config_audit_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** 被变更的提供商。 */
    provider: text('provider').$type<'stripe'>().notNull(),
    /** configured | cleared。 */
    action: text('action').$type<'configured' | 'cleared'>().notNull(),
    /** 执行操作的 Clerk 管理员。 */
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

/**
 * 与 tg-core 共享的分析任务持久化。
 * 保存请求快照、进度、最终结果与成本核算。
 */
export const analysisJobs = pgTable(
  'analysis_jobs',
  {
    /** 创建分析时分配的任务 ID。 */
    id: uuid('id').primaryKey(),
    /** 客户端请求 ID，用于幂等创建；可选。 */
    requestId: uuid('request_id'),
    /** 列表展示用的规范化 ticker / 代码。 */
    ticker: text('ticker').notNull(),
    /** 经标的解析得到的交易所代码。 */
    exchange: text('exchange'),
    /** 分析对应的交易日（YYYY-MM-DD）。 */
    tradeDate: date('trade_date').notNull(),
    /** 标的解析得到的资产类型。 */
    assetType: text('asset_type').notNull(),
    /** 本次运行选中的分析师角色。 */
    analysts: jsonb('analysts').$type<string[]>().notNull(),
    /** queued | running | succeeded | failed。 */
    status: text('status')
      .$type<'queued' | 'running' | 'succeeded' | 'failed'>()
      .notNull(),
    /** 原始 API/CLI 请求载荷。 */
    request: jsonb('request').$type<Record<string, unknown>>().notNull(),
    /** 合并覆盖项后的有效运行配置快照。 */
    config: jsonb('config')
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    /** 任务的 UI/展示元数据。 */
    display: jsonb('display')
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    /** 结束后的最终 LangGraph 状态；未完成时为 null。 */
    finalState: jsonb('final_state').$type<Record<string, unknown> | null>(),
    /** 图产出的结构化决策文本/摘要。 */
    decision: text('decision'),
    /** status 为 failed 时的失败信息。 */
    error: text('error'),
    /** 生成报告的文件系统或存储路径。 */
    reportPath: text('report_path'),
    /** 本轮运行的聚合 token 数。 */
    tokensUsed: integer('tokens_used').notNull().default(0),
    /** 按模型/步骤拆分的 token 用量。 */
    tokenUsage: jsonb('token_usage')
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    /** 本轮运行估算的美元成本。 */
    costUsd: numeric('cost_usd', { precision: 18, scale: 8 })
      .notNull()
      .default('0'),
    /** 按提供商/模型/步骤拆分的成本。 */
    costBreakdown: jsonb('cost_breakdown')
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    /** 进度百分比 0–100，供 UI 使用。 */
    progressPercent: integer('progress_percent').notNull().default(0),
    /** 当前图步骤标签，供进度 UI 展示。 */
    currentStep: text('current_step'),
    /** 有序进度/事件日志，供流式 UI。 */
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
    /** Worker 开始执行任务的时间。 */
    startedAt: timestamp('started_at', { withTimezone: true }),
    /** 任务到达终态的时间。 */
    finishedAt: timestamp('finished_at', { withTimezone: true }),
    /** 产品侧任务所有者；CLI/无计费 job 为 null。 */
    clerkUserId: text('clerk_user_id'),
    /** 创建时冻结的计费快照（points_per_usd / markup_basis_points 等）。 */
    creditPricing: jsonb('credit_pricing').$type<Record<string, unknown> | null>(),
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
    index('analysis_jobs_user_created_idx').on(
      table.clerkUserId,
      desc(table.createdAt),
    ),
  ],
);

/** 管理员配置的 LLM 提供商实例（含加密 API Key）。 */
export const llmProviders = pgTable(
  'llm_providers',
  {
    /** 目录实例唯一键（可与 driver 不同，例如自定义兼容端点）。 */
    id: text('id').primaryKey(),
    /** Core LLM 工厂类型（白名单），同 driver 可有多条实例。 */
    driver: text('driver').notNull(),
    displayName: text('display_name').notNull(),
    enabled: boolean('enabled').notNull().default(true),
    backendUrl: text('backend_url'),
    apiKeyCiphertext: text('api_key_ciphertext'),
    apiKeyHint: text('api_key_hint'),
    sortOrder: integer('sort_order').notNull().default(0),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index('llm_providers_driver_idx').on(table.driver)],
);

/** 管理员纳管的 LLM 模型目录；enabled 表示对用户开放。 */
export const llmModels = pgTable(
  'llm_models',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    providerId: text('provider_id')
      .notNull()
      .references(() => llmProviders.id, { onDelete: 'cascade' }),
    model: text('model').notNull(),
    displayName: text('display_name').notNull(),
    role: text('role').notNull().default('both'),
    enabled: boolean('enabled').notNull().default(false),
    currency: text('currency').notNull().default('USD'),
    unitTokens: integer('unit_tokens').notNull().default(1_000_000),
    inputPrice: numeric('input_price', { precision: 18, scale: 8 }),
    outputPrice: numeric('output_price', { precision: 18, scale: 8 }),
    cachedInputPrice: numeric('cached_input_price', {
      precision: 18,
      scale: 8,
    }),
    cacheWritePrice: numeric('cache_write_price', { precision: 18, scale: 8 }),
    contextWindow: integer('context_window'),
    maxOutputTokens: integer('max_output_tokens'),
    params: jsonb('params')
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    capabilities: jsonb('capabilities')
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    syncedAt: timestamp('synced_at', { withTimezone: true }),
    syncError: text('sync_error'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('llm_models_provider_model_uidx').on(
      table.providerId,
      table.model,
    ),
    index('llm_models_enabled_idx').on(table.enabled),
  ],
);

/** 用户自选股 / 收藏标的（单表，无分组与标签）。 */
export const watchlistItems = pgTable(
  'watchlist_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    clerkUserId: text('clerk_user_id')
      .notNull()
      .references(() => accountUsers.clerkUserId, { onDelete: 'cascade' }),
    exchange: text('exchange').notNull(),
    symbol: text('symbol').notNull(),
    displayTicker: text('display_ticker').notNull(),
    providerSymbol: text('provider_symbol').notNull(),
    displayName: text('display_name').notNull(),
    logoUrl: text('logo_url'),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('watchlist_items_user_provider_key').on(
      table.clerkUserId,
      table.providerSymbol,
    ),
    index('watchlist_items_user_sort_idx').on(
      table.clerkUserId,
      table.sortOrder,
    ),
  ],
);

/** 系统级 JSON 设置（维护公告、功能开关、免责声明覆盖、告警 webhook、默认 LLM）。 */
export const systemSettings = pgTable('system_settings', {
  key: text('key').primaryKey(),
  value: jsonb('value').$type<Record<string, unknown>>().notNull(),
  updatedBy: text('updated_by'),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/** 可运营市场配置（启停、展示名、时区、币种、时段说明与免责声明）。 */
export const marketConfigs = pgTable('market_configs', {
  code: text('code').primaryKey(),
  enabled: integer('enabled').notNull().default(1),
  displayName: text('display_name').notNull(),
  timezone: text('timezone').notNull(),
  currency: text('currency').notNull(),
  sessionNotes: text('session_notes'),
  disclaimer: text('disclaimer'),
  sortOrder: integer('sort_order').notNull().default(0),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/** 管理员操作日志（追加写；供 /admin/audit 检索）。 */
export const adminAuditEvents = pgTable(
  'admin_audit_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    actorClerkUserId: text('actor_clerk_user_id').notNull(),
    action: text('action').notNull(),
    targetType: text('target_type'),
    targetId: text('target_id'),
    metadata: jsonb('metadata')
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('admin_audit_events_created_idx').on(table.createdAt),
    index('admin_audit_events_action_idx').on(table.action),
    index('admin_audit_events_actor_idx').on(table.actorClerkUserId),
  ],
);
