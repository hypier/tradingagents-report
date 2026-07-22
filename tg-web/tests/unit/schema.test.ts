import { getTableName } from 'drizzle-orm';
import { getTableConfig, PgDialect } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';

import {
  analysisJobs,
  llmProviders,
  llmModels,
  accountUsers,
  creditAccounts,
  creditLedgerEntries,
  stripeWebhookEvents,
  billingSubscriptions,
  systemSettings,
  marketConfigs,
  adminAuditEvents,
} from '../../src/backend/database/schema';

describe('Core table mappings', () => {
  it('maps Core-owned and LLM catalog table names', () => {
    expect(getTableName(analysisJobs)).toBe('analysis_jobs');
    expect(getTableName(llmProviders)).toBe('llm_providers');
    expect(getTableName(llmModels)).toBe('llm_models');
  });

  it('maps product identity, billing, and credit audit tables', () => {
    expect(getTableName(accountUsers)).toBe('account_users');
    expect(getTableName(creditAccounts)).toBe('credit_accounts');
    expect(getTableName(creditLedgerEntries)).toBe('credit_ledger_entries');
    expect(getTableName(billingSubscriptions)).toBe('billing_subscriptions');
    expect(getTableName(stripeWebhookEvents)).toBe('stripe_webhook_events');
    expect(getTableName(systemSettings)).toBe('system_settings');
  });

  it('maps system settings, market configs, and operation log tables', () => {
    expect(getTableName(systemSettings)).toBe('system_settings');
    expect(getTableName(marketConfigs)).toBe('market_configs');
    expect(getTableName(adminAuditEvents)).toBe('admin_audit_events');
  });

  it('maps referral onboarding columns on account users', () => {
    expect(
      getTableConfig(accountUsers).columns.map((column) => column.name),
    ).toEqual(
      expect.arrayContaining([
        'referral_code',
        'referred_by_clerk_user_id',
        'onboarding_completed_at',
      ]),
    );
  });

  it('stores product ownership and frozen credit pricing on analysis jobs', () => {
    const columns = getTableConfig(analysisJobs).columns.map(
      (column) => column.name,
    );

    expect(columns).toEqual(
      expect.arrayContaining(['clerk_user_id', 'credit_pricing']),
    );
  });

  it('uses bigint columns for point balances and ledger deltas', () => {
    const sqlTypes = [
      ...getTableConfig(creditAccounts)
        .columns.filter((column) => column.name.endsWith('_credits'))
        .map((column) => column.getSQLType()),
      ...getTableConfig(creditLedgerEntries)
        .columns.filter((column) => column.name.endsWith('_delta'))
        .map((column) => column.getSQLType()),
    ];

    expect(sqlTypes).toEqual(Array(sqlTypes.length).fill('bigint'));
  });

  it('declares the Core status check constraint', () => {
    const statusCheck = getTableConfig(analysisJobs).checks.find(
      (check) => check.name === 'analysis_jobs_status_check',
    );

    expect(statusCheck?.name).toBe('analysis_jobs_status_check');
    expect(new PgDialect().sqlToQuery(statusCheck!.value)).toEqual({
      sql: `"analysis_jobs"."status" in ('queued', 'running', 'succeeded', 'failed')`,
      params: [],
    });
  });

  it('mirrors Core instrument display columns', () => {
    const columns = getTableConfig(analysisJobs).columns.map(
      (column) => column.name,
    );

    expect(columns).toEqual(expect.arrayContaining(['exchange', 'display']));
  });
});
