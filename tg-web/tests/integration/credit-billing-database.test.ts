import { Client } from 'pg';
import { GenericContainer, type StartedTestContainer } from 'testcontainers';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { buildBillingSignature } from '../../src/backend/billing/credit-pricing';
import {
  createNodeDatabase,
  type NodeDatabase,
} from '../../src/backend/database/client';
import { migrateDatabase } from '../../src/backend/database/migrate';

describe('usage-based credit billing repository', () => {
  let container: StartedTestContainer | undefined;
  let database!: NodeDatabase;
  let connection: Client | undefined;

  beforeAll(async () => {
    container = await new GenericContainer('postgres:16-alpine')
      .withEnvironment({
        POSTGRES_DB: 'credit_billing_test',
        POSTGRES_USER: 'credit_billing_test',
        POSTGRES_PASSWORD: 'credit_billing_test',
      })
      .withExposedPorts(5432)
      .start();
    const connectionString = `postgresql://credit_billing_test:credit_billing_test@${container.getHost()}:${container.getMappedPort(5432)}/credit_billing_test`;
    connection = new Client({ connectionString });
    await connection.connect();
    await migrateDatabase(connectionString);
    database = createNodeDatabase(connectionString);
    await database.account.syncUser({
      id: 'user-credit',
      displayName: 'Credit User',
      email: 'credit@example.test',
      imageUrl: '',
      role: 'user',
    });
  }, 120_000);

  afterAll(async () => {
    await database?.close();
    await connection?.end();
    await container?.stop();
  });

  it('stores default settings and audits administrator updates', async () => {
    await expect(database.billing.getCreditSettings()).resolves.toMatchObject({
      pointsPerUsd: '100.000000',
      markupBasisPoints: 1000,
      reserveBufferBasisPoints: 2000,
      defaultEstimatedCostUsd: '1.00000000',
      signupGrantUsd: '5.00',
      referralRewardUsd: '2.00',
    });

    await database.billing.updateCreditSettings({
      pointsPerUsd: '200',
      markupBasisPoints: 1500,
      reserveBufferBasisPoints: 2500,
      defaultEstimatedCostUsd: '2.5',
      signupGrantUsd: '7.5',
      referralRewardUsd: '0',
      actorClerkUserId: 'admin-1',
    });

    await expect(database.billing.getCreditSettings()).resolves.toMatchObject({
      pointsPerUsd: '200.000000',
      markupBasisPoints: 1500,
      reserveBufferBasisPoints: 2500,
      defaultEstimatedCostUsd: '2.50000000',
      signupGrantUsd: '7.50',
      referralRewardUsd: '0.00',
      updatedByClerkUserId: 'admin-1',
    });
    const audit = await connection!.query(
      'SELECT actor_clerk_user_id, previous_settings, next_settings FROM credit_billing_setting_events',
    );
    expect(audit.rows).toHaveLength(1);
    expect(audit.rows[0]).toMatchObject({ actor_clerk_user_id: 'admin-1' });
  });

  it('estimates matching history and reserves points without a subscription', async () => {
    await database.billing.updateCreditSettings({
      pointsPerUsd: '100',
      markupBasisPoints: 1000,
      reserveBufferBasisPoints: 2000,
      defaultEstimatedCostUsd: '1',
      signupGrantUsd: '5',
      referralRewardUsd: '2',
      actorClerkUserId: 'admin-1',
    });
    const signature = buildBillingSignature({
      analysts: ['market'],
      configOverrides: { output_language: 'en' },
    });
    for (const [index, cost] of ['0.10', '0.20', '0.30'].entries()) {
      await connection!.query(
        `INSERT INTO analysis_jobs (
          id, ticker, trade_date, asset_type, analysts, status, request,
          config, cost_usd, finished_at
        ) VALUES ($1, 'AAPL', '2026-07-20', 'stock', '["market"]', 'succeeded',
          '{}', $2, $3, now())`,
        [
          `00000000-0000-4000-8000-00000000010${index}`,
          {
            llm_provider: 'openai',
            deep_think_llm: 'gpt-deep',
            quick_think_llm: 'gpt-quick',
            max_debate_rounds: 1,
            max_risk_discuss_rounds: 1,
          },
          cost,
        ],
      );
      await connection!.query(
        `INSERT INTO credit_reservations (
          request_id, clerk_user_id, analysis_job_id, units,
          pricing_snapshot, status, settled_units, settled_cost_usd, settled_at
        ) VALUES ($1, 'user-credit', $1, 1, $2, 'consumed', 1, $3, now())`,
        [
          `00000000-0000-4000-8000-00000000010${index}`,
          { billing_signature: signature },
          cost,
        ],
      );
    }
    await database.billing.adjustCredits({
      adjustmentId: '00000000-0000-4000-8000-000000000200',
      clerkUserId: 'user-credit',
      actorClerkUserId: 'admin-1',
      delta: 1000,
      reason: 'Test funding',
    });

    await expect(
      database.billing.estimateAnalysis({ billingSignature: signature }),
    ).resolves.toMatchObject({
      estimatedCostUsd: '0.30000000',
      reservedPoints: 40,
      source: 'history',
      sampleCount: 3,
    });
    await expect(
      database.billing.reserveAnalysis({
        clerkUserId: 'user-credit',
        requestId: '00000000-0000-4000-8000-000000000201',
        billingSignature: signature,
      }),
    ).resolves.toBe('created');
    await expect(
      database.billing.getUsage('user-credit'),
    ).resolves.toMatchObject({
      availableCredits: 960,
      reservedCredits: 40,
    });
  });

  it('adjusts credits idempotently and reads balances in bulk', async () => {
    const input = {
      adjustmentId: '00000000-0000-4000-8000-000000000300',
      clerkUserId: 'user-credit',
      actorClerkUserId: 'admin-1',
      delta: -10,
      reason: 'Correction',
    };
    await database.billing.adjustCredits(input);
    await database.billing.adjustCredits(input);

    await expect(
      database.billing.getAvailableCredits(['user-credit', 'missing-user']),
    ).resolves.toEqual({ 'user-credit': 950, 'missing-user': 0 });
  });
});
