import { Client } from 'pg';
import { GenericContainer, type StartedTestContainer } from 'testcontainers';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  createNodeDatabase,
  type NodeDatabase,
} from '../../src/backend/database/client';

const fixtureSql = `
  CREATE TABLE analysis_jobs (
    id UUID PRIMARY KEY,
    request_id UUID,
    ticker TEXT NOT NULL,
    trade_date DATE NOT NULL,
    asset_type TEXT NOT NULL,
    analysts JSONB NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('queued', 'running', 'succeeded', 'failed')),
    request JSONB NOT NULL,
    config JSONB NOT NULL DEFAULT '{}'::jsonb,
    final_state JSONB,
    decision TEXT,
    error TEXT,
    report_path TEXT,
    tokens_used INTEGER NOT NULL DEFAULT 0,
    token_usage JSONB NOT NULL DEFAULT '{}'::jsonb,
    cost_usd NUMERIC(18, 8) NOT NULL DEFAULT 0,
    cost_breakdown JSONB NOT NULL DEFAULT '{}'::jsonb,
    progress_percent INTEGER NOT NULL DEFAULT 0,
    current_step TEXT,
    events JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    started_at TIMESTAMPTZ,
    finished_at TIMESTAMPTZ
  );
  CREATE TABLE product_users (
    clerk_user_id TEXT PRIMARY KEY, display_name TEXT NOT NULL, email TEXT,
    avatar_url TEXT NOT NULL DEFAULT '', interface_language TEXT NOT NULL DEFAULT 'en',
    report_language TEXT NOT NULL DEFAULT 'English', timezone TEXT NOT NULL DEFAULT 'UTC',
    default_market TEXT NOT NULL DEFAULT 'US', stripe_customer_id TEXT UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  CREATE TABLE user_consents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(), clerk_user_id TEXT NOT NULL REFERENCES product_users(clerk_user_id),
    document_type TEXT NOT NULL, document_version TEXT NOT NULL, accepted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    ip_address TEXT, user_agent TEXT, UNIQUE (clerk_user_id, document_type, document_version)
  );
  CREATE TABLE billing_subscriptions (
    stripe_subscription_id TEXT PRIMARY KEY, clerk_user_id TEXT NOT NULL REFERENCES product_users(clerk_user_id),
    stripe_customer_id TEXT NOT NULL, stripe_price_id TEXT NOT NULL, status TEXT NOT NULL,
    cancel_at_period_end INTEGER NOT NULL DEFAULT 0, current_period_start TIMESTAMPTZ,
    current_period_end TIMESTAMPTZ, latest_invoice_id TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  CREATE TABLE credit_accounts (
    clerk_user_id TEXT PRIMARY KEY REFERENCES product_users(clerk_user_id),
    available_credits INTEGER NOT NULL DEFAULT 0, reserved_credits INTEGER NOT NULL DEFAULT 0,
    spent_credits INTEGER NOT NULL DEFAULT 0, updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  CREATE TABLE credit_reservations (
    request_id UUID PRIMARY KEY, clerk_user_id TEXT NOT NULL REFERENCES product_users(clerk_user_id),
    analysis_job_id UUID UNIQUE, units INTEGER NOT NULL, status TEXT NOT NULL, reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(), settled_at TIMESTAMPTZ
  );
  CREATE TABLE credit_ledger_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(), clerk_user_id TEXT NOT NULL REFERENCES product_users(clerk_user_id),
    entry_type TEXT NOT NULL, available_delta INTEGER NOT NULL DEFAULT 0, reserved_delta INTEGER NOT NULL DEFAULT 0,
    spent_delta INTEGER NOT NULL DEFAULT 0, idempotency_key TEXT NOT NULL UNIQUE,
    reference_type TEXT NOT NULL, reference_id TEXT NOT NULL, description TEXT NOT NULL,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  CREATE TABLE stripe_webhook_events (
    stripe_event_id TEXT PRIMARY KEY, event_type TEXT NOT NULL, status TEXT NOT NULL,
    payload JSONB NOT NULL, error TEXT, received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    processed_at TIMESTAMPTZ, updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  CREATE TABLE billing_provider_configs (
    provider TEXT PRIMARY KEY, secret_key_ciphertext TEXT NOT NULL,
    webhook_secret_ciphertext TEXT NOT NULL, updated_by_clerk_user_id TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  CREATE TABLE billing_config_audit_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(), provider TEXT NOT NULL,
    action TEXT NOT NULL, actor_clerk_user_id TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  CREATE TABLE llm_model_prices (
    provider TEXT NOT NULL,
    model TEXT NOT NULL,
    billing_mode TEXT NOT NULL DEFAULT 'standard',
    context_tier TEXT NOT NULL DEFAULT 'short',
    currency TEXT NOT NULL DEFAULT 'USD',
    unit_tokens INTEGER NOT NULL DEFAULT 1000000,
    input_price NUMERIC(18, 8) NOT NULL,
    cached_input_price NUMERIC(18, 8),
    cache_write_price NUMERIC(18, 8),
    output_price NUMERIC(18, 8) NOT NULL,
    source_url TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (provider, model, billing_mode, context_tier)
  );
  CREATE TABLE llm_pricing_sources (
    source_url TEXT PRIMARY KEY,
    update_interval_seconds INTEGER NOT NULL DEFAULT 3600,
    last_checked_at TIMESTAMPTZ,
    last_success_at TIMESTAMPTZ,
    last_error TEXT,
    model_count INTEGER NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  CREATE UNIQUE INDEX analysis_jobs_request_id_key
    ON analysis_jobs (request_id)
    WHERE request_id IS NOT NULL;
  CREATE INDEX analysis_jobs_ticker_created_idx
    ON analysis_jobs (ticker, created_at DESC);
  CREATE INDEX analysis_jobs_status_created_idx
    ON analysis_jobs (status, created_at DESC);
`;

describe('Node database', () => {
  let container: StartedTestContainer | undefined;
  let database!: NodeDatabase;
  let connection: Client | undefined;

  beforeAll(async () => {
    container = await new GenericContainer('postgres:16-alpine')
      .withEnvironment({
        POSTGRES_DB: 'tg_web_test',
        POSTGRES_USER: 'tg_web_test',
        POSTGRES_PASSWORD: 'tg_web_test',
      })
      .withExposedPorts(5432)
      .start();

    const connectionString = `postgresql://tg_web_test:tg_web_test@${container.getHost()}:${container.getMappedPort(5432)}/tg_web_test`;
    connection = new Client({ connectionString });
    await connection.connect();
    await connection.query(fixtureSql);
    await connection.query(`
      INSERT INTO analysis_jobs (
        id, ticker, trade_date, asset_type, analysts, status, request
      ) VALUES (
        '00000000-0000-0000-0000-000000000001',
        'AAPL',
        '2026-07-14',
        'stock',
        '["market"]'::jsonb,
        'queued',
        '{}'::jsonb
      );
      INSERT INTO llm_model_prices (
        provider, model, input_price, output_price, source_url
      ) VALUES ('openai', 'gpt-test', 1.25, 2.5, 'https://example.test/pricing');
      INSERT INTO llm_pricing_sources (source_url)
      VALUES ('https://example.test/pricing');
    `);
    database = createNodeDatabase(connectionString);
  });

  afterAll(async () => {
    await database?.close();
    await connection?.end();
    await container?.stop();
  });

  it('reads Core-owned tables through constrained repositories', async () => {
    await expect(database.healthcheck()).resolves.toBeUndefined();
    await expect(
      database.analysisJobs.list({ limit: 10, offset: 0 }),
    ).resolves.toHaveLength(1);
    await expect(
      database.modelPrices.list({ provider: 'openai' }),
    ).resolves.toHaveLength(1);
    await expect(database.pricingSources.list()).resolves.toHaveLength(1);
  });

  it('does not expose an analysis-job mutation method', () => {
    expect('updateStatus' in database.analysisJobs).toBe(false);
  });

  it('upserts and deletes model prices by their Core primary key', async () => {
    const price = await database.modelPrices.upsert({
      provider: 'openai',
      model: 'gpt-test',
      billingMode: 'standard',
      contextTier: 'short',
      currency: 'USD',
      unitTokens: 1_000_000,
      inputPrice: '3',
      outputPrice: '6',
      sourceUrl: 'https://example.test/pricing',
    });

    expect(price.inputPrice).toBe('3.00000000');
    await database.modelPrices.delete({
      provider: 'openai',
      model: 'gpt-test',
      billingMode: 'standard',
      contextTier: 'short',
    });
    await expect(
      database.modelPrices.list({ provider: 'openai' }),
    ).resolves.toEqual([]);
  });

  it('grants, reserves, and releases credits idempotently', async () => {
    await database.product.syncUser({
      id: 'user-1',
      displayName: 'Test User',
      email: 'test@example.test',
      imageUrl: '',
      role: 'user',
    });
    await database.product.setStripeCustomerId('user-1', 'cus_test');
    const event = {
      id: 'evt_invoice_paid',
      type: 'invoice.paid',
      payload: { livemode: false },
      subscription: {
        id: 'sub_test',
        customerId: 'cus_test',
        priceId: 'price_test',
        status: 'active' as const,
        cancelAtPeriodEnd: false,
        currentPeriodStart: 1_784_332_800,
        currentPeriodEnd: 1_789_516_800,
        latestInvoiceId: 'in_test',
      },
      creditGrant: {
        invoiceId: 'in_test',
        customerId: 'cus_test',
        subscriptionId: 'sub_test',
        priceId: 'price_test',
        credits: 5,
        periodStart: 1_784_332_800,
        periodEnd: 1_789_516_800,
      },
    };

    await expect(database.product.processStripeEvent(event)).resolves.toBe(
      true,
    );
    await expect(database.product.processStripeEvent(event)).resolves.toBe(
      false,
    );
    await expect(database.product.getUsage('user-1')).resolves.toMatchObject({
      availableCredits: 5,
      reservedCredits: 0,
      spentCredits: 0,
      ledger: [{ entryType: 'grant', availableDelta: 5 }],
    });

    const requestId = '00000000-0000-4000-8000-000000000020';
    await expect(
      database.product.reserveAnalysis({
        clerkUserId: 'user-1',
        requestId,
        units: 1,
      }),
    ).resolves.toBe('created');
    await expect(
      database.product.reserveAnalysis({
        clerkUserId: 'user-1',
        requestId,
        units: 1,
      }),
    ).resolves.toBe('existing');
    await expect(database.product.getUsage('user-1')).resolves.toMatchObject({
      availableCredits: 4,
      reservedCredits: 1,
    });
    await database.product.releaseAnalysis(requestId, 'test_failure');
    await database.product.releaseAnalysis(requestId, 'duplicate');
    await expect(database.product.getUsage('user-1')).resolves.toMatchObject({
      availableCredits: 5,
      reservedCredits: 0,
      ledger: [
        { entryType: 'release' },
        { entryType: 'reserve' },
        { entryType: 'grant' },
      ],
    });
  });

  it('stores Stripe configuration ciphertext and audits changes', async () => {
    await database.billingConfig.setStripe({
      secretKeyCiphertext: 'v1.secret',
      webhookSecretCiphertext: 'v1.webhook',
      actorClerkUserId: 'admin-1',
    });
    await expect(database.billingConfig.getStripe()).resolves.toMatchObject({
      provider: 'stripe',
      secretKeyCiphertext: 'v1.secret',
      webhookSecretCiphertext: 'v1.webhook',
      updatedByClerkUserId: 'admin-1',
    });

    await database.billingConfig.clearStripe('admin-2');
    await expect(database.billingConfig.getStripe()).resolves.toBeUndefined();
    const audit = await connection!.query(
      'SELECT action, actor_clerk_user_id FROM billing_config_audit_events ORDER BY created_at',
    );
    expect(audit.rows).toEqual([
      { action: 'configured', actor_clerk_user_id: 'admin-1' },
      { action: 'cleared', actor_clerk_user_id: 'admin-2' },
    ]);
  });
});
