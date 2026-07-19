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

    expect(columns).toEqual(
      expect.arrayContaining(['exchange', 'display']),
    );
  });
});
