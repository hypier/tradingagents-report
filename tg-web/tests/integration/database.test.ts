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

  it('grants, reserves, and releases credits idempotently', async () => {
    await database.account.syncUser({
      id: 'user-1',
      displayName: 'Test User',
      email: 'test@example.test',
      imageUrl: '',
      role: 'user',
    });
    await database.billing.setStripeCustomerId('user-1', 'cus_test');
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

    await expect(database.billing.processStripeEvent(event)).resolves.toBe(
      true,
    );
    await expect(database.billing.processStripeEvent(event)).resolves.toBe(
      false,
    );
    await expect(database.billing.getUsage('user-1')).resolves.toMatchObject({
      availableCredits: 5,
      reservedCredits: 0,
      spentCredits: 0,
      ledger: [{ entryType: 'grant', availableDelta: 5 }],
    });

    await database.billing.updateCreditSettings({
      pointsPerUsd: '100',
      markupBasisPoints: 1000,
      reserveBufferBasisPoints: 2000,
      defaultEstimatedCostUsd: '0.001',
      actorClerkUserId: 'admin-1',
    });
    const requestId = '00000000-0000-4000-8000-000000000020';
    await expect(
      database.billing.reserveAnalysis({
        clerkUserId: 'user-1',
        requestId,
        billingSignature: 'test-signature',
      }),
    ).resolves.toBe('created');
    await expect(
      database.billing.reserveAnalysis({
        clerkUserId: 'user-1',
        requestId,
        billingSignature: 'test-signature',
      }),
    ).resolves.toBe('existing');
    await expect(database.billing.getUsage('user-1')).resolves.toMatchObject({
      availableCredits: 4,
      reservedCredits: 1,
    });
    await database.billing.releaseAnalysis(requestId, 'test_failure');
    await database.billing.releaseAnalysis(requestId, 'duplicate');
    await expect(database.billing.getUsage('user-1')).resolves.toMatchObject({
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
