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
      INSERT INTO llm_providers (id, driver, display_name, enabled)
      VALUES ('openai', 'openai', 'OpenAI', true);
      INSERT INTO llm_models (
        provider_id, model, display_name, role, enabled,
        input_price, output_price
      )
      VALUES ('openai', 'gpt-test', 'GPT Test', 'both', true, 1.25, 2.5);
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
    await expect(database.llmCatalog.listProviders()).resolves.toHaveLength(1);
    await expect(database.llmCatalog.listModels()).resolves.toHaveLength(1);
  });

  it('exposes exchange and display columns from migrations', async () => {
    const [job] = await database.analysisJobs.list({ limit: 1, offset: 0 });
    expect(job).toMatchObject({
      ticker: 'AAPL',
      exchange: null,
      display: {},
    });
  });

  it('grants credits and gates analysis starts by balance threshold', async () => {
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
        grantKind: 'create' as const,
        expireBeforeGrant: false,
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
      periodCredits: 5,
      bonusCredits: 0,
      reservedCredits: 0,
      spentCredits: 0,
      ledger: [{ entryType: 'grant', availableDelta: 5 }],
    });

    await expect(
      database.billing.estimateAnalysis({ clerkUserId: 'user-1' }),
    ).resolves.toMatchObject({
      analysisBalanceThreshold: 0,
      availableCredits: 5,
      canStart: true,
      pointsPerUsd: '100',
      markupBasisPoints: 1000,
    });
    await expect(
      database.billing.assertCanStartAnalysis({ clerkUserId: 'user-1' }),
    ).resolves.toMatchObject({
      settings: {
        analysisBalanceThreshold: 0,
        pointsPerUsd: '100',
        markupBasisPoints: 1000,
      },
      pricing: {
        points_per_usd: '100',
        markup_basis_points: 1000,
        analysis_balance_threshold: 0,
      },
    });

    await database.billing.updateBillingSettings({
      analysisBalanceThreshold: 10,
      pointsPerUsd: '100',
      markupBasisPoints: 1000,
      actorClerkUserId: 'admin-1',
    });
    await expect(
      database.billing.estimateAnalysis({ clerkUserId: 'user-1' }),
    ).resolves.toMatchObject({
      analysisBalanceThreshold: 10,
      availableCredits: 5,
      canStart: false,
    });
    await expect(
      database.billing.assertCanStartAnalysis({ clerkUserId: 'user-1' }),
    ).rejects.toMatchObject({ code: 'INSUFFICIENT_CREDITS' });
  });

  it('settles welcome and referral credits exactly once', async () => {
    const inviter = {
      id: 'referral-inviter',
      displayName: 'Inviter',
      email: 'inviter@example.test',
      imageUrl: '',
      role: 'user' as const,
    };
    await database.account.syncUser(inviter);
    const inviterRow = await connection!.query<{ referral_code: string }>(
      'SELECT referral_code FROM account_users WHERE clerk_user_id = $1',
      [inviter.id],
    );
    const invitee = {
      id: 'referral-invitee',
      displayName: 'Invitee',
      email: 'invitee@example.test',
      imageUrl: '',
      role: 'user' as const,
    };

    await database.referrals.completeFirstAccess(
      invitee,
      inviterRow.rows[0]!.referral_code,
    );
    await database.referrals.completeFirstAccess(
      invitee,
      inviterRow.rows[0]!.referral_code,
    );

    await expect(
      database.billing.getAvailableCredits([inviter.id, invitee.id]),
    ).resolves.toEqual({
      [inviter.id]: 200,
      [invitee.id]: 500,
    });
    await expect(database.referrals.getSummary(inviter.id)).resolves.toEqual({
      referralPath: `/invite/${inviterRow.rows[0]!.referral_code}`,
      successfulReferrals: 1,
      earnedCredits: 200,
    });
    const ledger = await connection!.query(
      `SELECT clerk_user_id, idempotency_key, available_delta
       FROM credit_ledger_entries
       WHERE clerk_user_id IN ($1, $2)
       ORDER BY idempotency_key`,
      [inviter.id, invitee.id],
    );
    expect(ledger.rows).toEqual([
      {
        clerk_user_id: inviter.id,
        idempotency_key: `referral:${invitee.id}:reward`,
        available_delta: '200',
      },
      {
        clerk_user_id: invitee.id,
        idempotency_key: `signup:${invitee.id}:grant`,
        available_delta: '500',
      },
    ]);
    const relationships = await connection!.query(
      'SELECT referred_by_clerk_user_id FROM account_users WHERE clerk_user_id = $1',
      [invitee.id],
    );
    expect(relationships.rows).toEqual([
      { referred_by_clerk_user_id: inviter.id },
    ]);
  });

  it('grants welcome credits without an invitation', async () => {
    const user = {
      id: 'welcome-only-user',
      displayName: 'Welcome User',
      email: 'welcome@example.test',
      imageUrl: '',
      role: 'user' as const,
    };

    await database.referrals.completeFirstAccess(user, null);
    await database.referrals.completeFirstAccess(user, null);

    await expect(
      database.billing.getAvailableCredits([user.id]),
    ).resolves.toEqual({ [user.id]: 500 });
    await expect(database.billing.getUsage(user.id)).resolves.toMatchObject({
      availableCredits: 500,
      periodCredits: 0,
      bonusCredits: 500,
    });
  });

  it('clears period credits on renewal while preserving bonus', async () => {
    await database.account.syncUser({
      id: 'user-cycle',
      displayName: 'Cycle User',
      email: 'cycle@example.test',
      imageUrl: '',
      role: 'user',
    });
    await database.billing.setStripeCustomerId('user-cycle', 'cus_cycle');
    await database.billing.adjustCredits({
      adjustmentId: '00000000-0000-4000-8000-000000000601',
      clerkUserId: 'user-cycle',
      actorClerkUserId: 'admin-1',
      delta: 300,
      reason: 'promo',
    });

    await database.billing.processStripeEvent({
      id: 'evt_cycle_create',
      type: 'invoice.paid',
      payload: {},
      subscription: {
        id: 'sub_cycle',
        customerId: 'cus_cycle',
        priceId: 'price_cycle',
        status: 'active',
        cancelAtPeriodEnd: false,
        currentPeriodStart: 1_784_332_800,
        currentPeriodEnd: 1_789_516_800,
        latestInvoiceId: 'in_cycle_create',
      },
      creditGrant: {
        invoiceId: 'in_cycle_create',
        customerId: 'cus_cycle',
        subscriptionId: 'sub_cycle',
        priceId: 'price_cycle',
        credits: 2000,
        grantKind: 'create',
        expireBeforeGrant: false,
        periodStart: 1_784_332_800,
        periodEnd: 1_789_516_800,
      },
    });

    await expect(database.billing.getUsage('user-cycle')).resolves.toMatchObject({
      availableCredits: 2300,
      periodCredits: 2000,
      bonusCredits: 300,
    });

    await database.billing.processStripeEvent({
      id: 'evt_cycle_renew',
      type: 'invoice.paid',
      payload: {},
      subscription: {
        id: 'sub_cycle',
        customerId: 'cus_cycle',
        priceId: 'price_cycle',
        status: 'active',
        cancelAtPeriodEnd: false,
        currentPeriodStart: 1_789_516_800,
        currentPeriodEnd: 1_792_108_800,
        latestInvoiceId: 'in_cycle_renew',
      },
      creditGrant: {
        invoiceId: 'in_cycle_renew',
        customerId: 'cus_cycle',
        subscriptionId: 'sub_cycle',
        priceId: 'price_cycle',
        credits: 2000,
        grantKind: 'cycle',
        expireBeforeGrant: true,
        periodStart: 1_789_516_800,
        periodEnd: 1_792_108_800,
      },
    });

    const usage = await database.billing.getUsage('user-cycle');
    expect(usage).toMatchObject({
      availableCredits: 2300,
      periodCredits: 2000,
      bonusCredits: 300,
    });
    expect(usage.ledger.some((row) => row.entryType === 'expire')).toBe(true);
    expect(
      usage.ledger.filter((row) => row.entryType === 'grant').length,
    ).toBeGreaterThanOrEqual(2);
  });

  it('grants upgrade delta only and expires period on cancel', async () => {
    await database.account.syncUser({
      id: 'user-upgrade',
      displayName: 'Upgrade User',
      email: 'upgrade@example.test',
      imageUrl: '',
      role: 'user',
    });
    await database.billing.setStripeCustomerId('user-upgrade', 'cus_upgrade');

    await database.billing.processStripeEvent({
      id: 'evt_upgrade_create',
      type: 'invoice.paid',
      payload: {},
      subscription: {
        id: 'sub_upgrade',
        customerId: 'cus_upgrade',
        priceId: 'price_2000',
        status: 'active',
        cancelAtPeriodEnd: false,
        currentPeriodStart: 1_784_332_800,
        currentPeriodEnd: 1_789_516_800,
        latestInvoiceId: 'in_upgrade_create',
      },
      creditGrant: {
        invoiceId: 'in_upgrade_create',
        customerId: 'cus_upgrade',
        subscriptionId: 'sub_upgrade',
        priceId: 'price_2000',
        credits: 2000,
        grantKind: 'create',
        expireBeforeGrant: false,
        periodStart: 1_784_332_800,
        periodEnd: 1_789_516_800,
      },
    });

    await database.billing.processStripeEvent({
      id: 'evt_upgrade_update',
      type: 'invoice.paid',
      payload: {},
      subscription: {
        id: 'sub_upgrade',
        customerId: 'cus_upgrade',
        priceId: 'price_5000',
        status: 'active',
        cancelAtPeriodEnd: false,
        currentPeriodStart: 1_784_332_800,
        currentPeriodEnd: 1_789_516_800,
        latestInvoiceId: 'in_upgrade_update',
      },
      creditGrant: {
        invoiceId: 'in_upgrade_update',
        customerId: 'cus_upgrade',
        subscriptionId: 'sub_upgrade',
        priceId: 'price_5000',
        credits: 5000,
        grantKind: 'upgrade_delta',
        expireBeforeGrant: false,
        periodStart: 1_784_332_800,
        periodEnd: 1_789_516_800,
      },
    });

    await expect(
      database.billing.getUsage('user-upgrade'),
    ).resolves.toMatchObject({
      availableCredits: 5000,
      periodCredits: 5000,
      bonusCredits: 0,
    });

    await database.billing.adjustCredits({
      adjustmentId: '00000000-0000-4000-8000-000000000602',
      clerkUserId: 'user-upgrade',
      actorClerkUserId: 'admin-1',
      delta: 100,
      reason: 'keep bonus',
    });

    await database.billing.processStripeEvent({
      id: 'evt_upgrade_cancel',
      type: 'customer.subscription.deleted',
      payload: {},
      expirePeriod: true,
      subscription: {
        id: 'sub_upgrade',
        customerId: 'cus_upgrade',
        priceId: 'price_5000',
        status: 'canceled',
        cancelAtPeriodEnd: false,
        currentPeriodStart: 1_784_332_800,
        currentPeriodEnd: 1_789_516_800,
        latestInvoiceId: 'in_upgrade_update',
      },
    });

    await expect(
      database.billing.getUsage('user-upgrade'),
    ).resolves.toMatchObject({
      availableCredits: 100,
      periodCredits: 0,
      bonusCredits: 100,
    });
  });

  it('claws back unused period credits on refund without touching bonus', async () => {
    await database.account.syncUser({
      id: 'user-refund',
      displayName: 'Refund User',
      email: 'refund@example.test',
      imageUrl: '',
      role: 'user',
    });
    await database.billing.setStripeCustomerId('user-refund', 'cus_refund');
    await database.billing.adjustCredits({
      adjustmentId: '00000000-0000-4000-8000-000000000603',
      clerkUserId: 'user-refund',
      actorClerkUserId: 'admin-1',
      delta: 400,
      reason: 'bonus',
    });

    await database.billing.processStripeEvent({
      id: 'evt_refund_create',
      type: 'invoice.paid',
      payload: {},
      subscription: {
        id: 'sub_refund',
        customerId: 'cus_refund',
        priceId: 'price_refund',
        status: 'active',
        cancelAtPeriodEnd: false,
        currentPeriodStart: 1_784_332_800,
        currentPeriodEnd: 1_789_516_800,
        latestInvoiceId: 'in_refund',
      },
      creditGrant: {
        invoiceId: 'in_refund',
        customerId: 'cus_refund',
        subscriptionId: 'sub_refund',
        priceId: 'price_refund',
        credits: 2000,
        grantKind: 'create',
        expireBeforeGrant: false,
        periodStart: 1_784_332_800,
        periodEnd: 1_789_516_800,
      },
    });

    // Simulate mid-cycle spend from period only.
    await connection!.query(
      `UPDATE credit_accounts
       SET period_credits = 500,
           available_credits = 900
       WHERE clerk_user_id = $1`,
      ['user-refund'],
    );

    await database.billing.processStripeEvent({
      id: 'evt_refund_charge',
      type: 'charge.refunded',
      payload: {},
      creditClawback: {
        chargeId: 'ch_refund',
        customerId: 'cus_refund',
        invoiceId: 'in_refund',
        amountRefunded: 1000,
        amountPaid: 2000,
        reason: 'refund',
      },
    });

    // 50% of 2000 = 1000 target; only 500 period left → claw 500.
    await expect(database.billing.getUsage('user-refund')).resolves.toMatchObject({
      availableCredits: 400,
      periodCredits: 0,
      bonusCredits: 400,
    });

    await database.billing.processStripeEvent({
      id: 'evt_refund_charge',
      type: 'charge.refunded',
      payload: {},
      creditClawback: {
        chargeId: 'ch_refund',
        customerId: 'cus_refund',
        invoiceId: 'in_refund',
        amountRefunded: 1000,
        amountPaid: 2000,
        reason: 'refund',
      },
    });
    await expect(database.billing.getUsage('user-refund')).resolves.toMatchObject({
      availableCredits: 400,
      periodCredits: 0,
      bonusCredits: 400,
    });
  });
});
