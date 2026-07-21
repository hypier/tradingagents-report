import { getTableName } from 'drizzle-orm';
import { getTableConfig, PgDialect } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';

import {
  analysisJobs,
  llmModelPrices,
  llmPricingSources,
  accountUsers,
  creditAccounts,
  creditReservations,
  creditLedgerEntries,
  stripeWebhookEvents,
  billingProviderConfigs,
  billingConfigAuditEvents,
  creditBillingSettings,
  creditBillingSettingEvents,
} from '../../src/backend/database/schema';

describe('Core table mappings', () => {
  it('maps the three Core-owned table names', () => {
    expect(getTableName(analysisJobs)).toBe('analysis_jobs');
    expect(getTableName(llmModelPrices)).toBe('llm_model_prices');
    expect(getTableName(llmPricingSources)).toBe('llm_pricing_sources');
  });

  it('maps product identity, billing, and credit audit tables', () => {
    expect(getTableName(accountUsers)).toBe('product_users');
    expect(getTableName(creditAccounts)).toBe('credit_accounts');
    expect(getTableName(creditReservations)).toBe('credit_reservations');
    expect(getTableName(creditLedgerEntries)).toBe('credit_ledger_entries');
    expect(getTableName(stripeWebhookEvents)).toBe('stripe_webhook_events');
    expect(getTableName(billingProviderConfigs)).toBe(
      'billing_provider_configs',
    );
    expect(getTableName(billingConfigAuditEvents)).toBe(
      'billing_config_audit_events',
    );
    expect(getTableName(creditBillingSettings)).toBe('credit_billing_settings');
    expect(getTableName(creditBillingSettingEvents)).toBe(
      'credit_billing_setting_events',
    );
  });

  it('stores pricing snapshots and settlement results on reservations', () => {
    const columns = getTableConfig(creditReservations).columns.map(
      (column) => column.name,
    );

    expect(columns).toEqual(
      expect.arrayContaining([
        'estimated_cost_usd',
        'pricing_snapshot',
        'settled_units',
        'settled_cost_usd',
      ]),
    );
  });

  it('uses bigint columns for point balances and ledger deltas', () => {
    const sqlTypes = [
      ...getTableConfig(creditAccounts).columns
        .filter((column) => column.name.endsWith('_credits'))
        .map((column) => column.getSQLType()),
      ...getTableConfig(creditReservations).columns
        .filter((column) => ['units', 'settled_units'].includes(column.name))
        .map((column) => column.getSQLType()),
      ...getTableConfig(creditLedgerEntries).columns
        .filter((column) => column.name.endsWith('_delta'))
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
