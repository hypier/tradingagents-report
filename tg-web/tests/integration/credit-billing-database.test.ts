import { Client } from 'pg';
import { GenericContainer, type StartedTestContainer } from 'testcontainers';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  createNodeDatabase,
  type NodeDatabase,
} from '../../src/backend/database/client';
import { migrateDatabase } from '../../src/backend/database/migrate';
import {
  DEFAULT_BILLING_SETTINGS,
  DEFAULT_REWARDS_SETTINGS,
} from '../../src/shared/product-credits';

describe('analysis billing settings repository', () => {
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

  it('stores default billing and rewards settings and audits updates', async () => {
    await expect(database.billing.getBillingSettings()).resolves.toEqual(
      DEFAULT_BILLING_SETTINGS,
    );
    await expect(database.billing.getRewardsSettings()).resolves.toEqual(
      DEFAULT_REWARDS_SETTINGS,
    );

    await database.billing.updateBillingSettings({
      analysisBalanceThreshold: 25,
      pointsPerUsd: '200',
      markupBasisPoints: 1500,
      actorClerkUserId: 'admin-1',
    });
    await database.billing.updateRewardsSettings({
      signup: { enabled: true, points: 750 },
      referral: { enabled: false, points: 0 },
      campaign: {
        enabled: true,
        points: 100,
        label: 'Launch',
        code: 'LAUNCH',
      },
      actorClerkUserId: 'admin-1',
    });

    await expect(database.billing.getBillingSettings()).resolves.toEqual({
      analysisBalanceThreshold: 25,
      pointsPerUsd: '200',
      markupBasisPoints: 1500,
    });
    await expect(database.billing.getRewardsSettings()).resolves.toEqual({
      signup: { enabled: true, points: 750 },
      referral: { enabled: false, points: 0 },
      campaign: {
        enabled: true,
        points: 100,
        label: 'Launch',
        code: 'LAUNCH',
      },
    });

    const audit = await connection!.query(
      `SELECT action, target_id, metadata
       FROM admin_audit_events
       WHERE action IN ('billing.settings.update', 'rewards.settings.update')
       ORDER BY action`,
    );
    expect(audit.rows).toHaveLength(2);
    expect(audit.rows[0]).toMatchObject({
      action: 'billing.settings.update',
      target_id: 'billing',
    });
    expect(audit.rows[1]).toMatchObject({
      action: 'rewards.settings.update',
      target_id: 'rewards',
    });
  });

  it('estimates and gates analysis starts against the balance threshold', async () => {
    await database.billing.updateBillingSettings({
      analysisBalanceThreshold: 100,
      pointsPerUsd: '100',
      markupBasisPoints: 1000,
      actorClerkUserId: 'admin-1',
    });
    await database.billing.adjustCredits({
      adjustmentId: '00000000-0000-4000-8000-000000000200',
      clerkUserId: 'user-credit',
      actorClerkUserId: 'admin-1',
      delta: 1000,
      reason: 'Test funding',
    });

    await expect(
      database.billing.estimateAnalysis({ clerkUserId: 'user-credit' }),
    ).resolves.toMatchObject({
      analysisBalanceThreshold: 100,
      availableCredits: 1000,
      canStart: true,
      pointsPerUsd: '100',
      markupBasisPoints: 1000,
    });
    await expect(
      database.billing.assertCanStartAnalysis({
        clerkUserId: 'user-credit',
      }),
    ).resolves.toMatchObject({
      pricing: {
        points_per_usd: '100',
        markup_basis_points: 1000,
        analysis_balance_threshold: 100,
      },
    });

    await database.billing.updateBillingSettings({
      analysisBalanceThreshold: 2000,
      pointsPerUsd: '100',
      markupBasisPoints: 1000,
      actorClerkUserId: 'admin-1',
    });
    await expect(
      database.billing.estimateAnalysis({ clerkUserId: 'user-credit' }),
    ).resolves.toMatchObject({
      analysisBalanceThreshold: 2000,
      availableCredits: 1000,
      canStart: false,
    });
    await expect(
      database.billing.assertCanStartAnalysis({
        clerkUserId: 'user-credit',
      }),
    ).rejects.toMatchObject({ code: 'INSUFFICIENT_CREDITS' });
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
    ).resolves.toEqual({ 'user-credit': 990, 'missing-user': 0 });
  });
});
