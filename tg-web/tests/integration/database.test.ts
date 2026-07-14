import { Client } from 'pg';
import { GenericContainer, type StartedTestContainer } from 'testcontainers';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  createNodeDatabase,
  type DatabaseHealth,
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
  let database: DatabaseHealth;
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
});
