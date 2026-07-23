import type { TFunction } from 'i18next';

import type { BillingOverview } from '@/backend/billing/contract';

export type BillingLedgerEntry = NonNullable<
  BillingOverview['usage']
>['ledger'][number];

export function formatBillingStatus(status: string) {
  return status.replaceAll('_', ' ');
}

export function formatCreditDelta(value: number) {
  return value > 0 ? `+${value}` : String(value);
}

export function localizeLedgerActivity(
  entry: BillingLedgerEntry,
  t: TFunction<'billing'>,
) {
  if (entry.referenceType === 'signup_grant') return t('ledger.signupGrant');
  if (entry.referenceType === 'referral_reward') return t('ledger.referralReward');
  if (entry.entryType === 'expire') return t('ledger.expire');
  if (entry.entryType === 'clawback') return t('ledger.clawback');
  if (entry.metadata?.grantKind === 'upgrade_delta') {
    return t('ledger.upgradeGrant');
  }
  if (entry.metadata?.grantKind === 'cycle') return t('ledger.cycleGrant');
  if (entry.metadata?.grantKind === 'create') return t('ledger.createGrant');
  return entry.description;
}

export function localizeLedgerPool(
  entry: BillingLedgerEntry,
  t: TFunction<'billing'>,
) {
  const pool = entry.metadata?.pool;
  if (pool === 'period') return t('ledger.poolPeriod');
  if (pool === 'bonus') return t('ledger.poolBonus');
  return null;
}

export function localizeEntryType(
  entryType: string,
  t: TFunction<'billing'>,
) {
  const key = `ledger.entryTypes.${entryType}` as const;
  const label = t(key, { defaultValue: '' });
  return label || formatBillingStatus(entryType);
}
