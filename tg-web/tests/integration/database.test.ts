import { Client } from 'pg';
import { GenericContainer, type StartedTestContainer } from 'testcontainers';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  createNodeDatabase,
  type NodeDatabase,
} from '../../src/backend/database/client';
import { migrateDatabase } from '../../src/backend/database/migrate';

describe('Node database', () => {
  let container: StartedTestContainer | undefined;
  let database!: NodeDatabase;
  let connection: Client | undefined;
  let connectionString = '';

  beforeAll(async () => {
    container = await new GenericContainer('postgres:16-alpine')
      .withEnvironment({
        POSTGRES_DB: 'tg_web_test',
        POSTGRES_USER: 'tg_web_test',
        POSTGRES_PASSWORD: 'tg_web_test',
      })
      .withExposedPorts(5432)
      .start();

    connectionString = `postgresql://tg_web_test:tg_web_test@${container.getHost()}:${container.getMappedPort(5432)}/tg_web_test`;
    connection = new Client({ connectionString });
    await connection.connect();
    await migrateDatabase(connectionString);
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
  }, 120_000);

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

  it('exposes exchange and display columns from migrations', async () => {
    const [job] = await database.analysisJobs.list({ limit: 1, offset: 0 });
    expect(job).toMatchObject({
      ticker: 'AAPL',
      exchange: null,
      display: {},
    });
  });
});
