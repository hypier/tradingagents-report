import type { TFunction } from 'i18next';

import type { BillingOverview } from '@/backend/billing/contract';

export type BillingLedgerEntry = NonNullable<
  BillingOverview['usage']
>['ledger'][number];

export type LedgerPoolDeltas = {
  period: number | null;
  bonus: number | null;
};

export function formatBillingStatus(status: string) {
  return status.replaceAll('_', ' ');
}

export function formatCreditDelta(value: number) {
  return value > 0 ? `+${value}` : String(value);
}

/** 从 metadata 或 pool 推断套餐/活动变动；历史无分池记录时返回 null。 */
export function resolveLedgerPoolDeltas(
  entry: BillingLedgerEntry,
): LedgerPoolDeltas {
  const periodRaw = entry.metadata?.periodDelta;
  const bonusRaw = entry.metadata?.bonusDelta;
  if (typeof periodRaw === 'number' || typeof bonusRaw === 'number') {
    return {
      period: typeof periodRaw === 'number' ? periodRaw : 0,
      bonus: typeof bonusRaw === 'number' ? bonusRaw : 0,
    };
  }
  const pool = entry.metadata?.pool;
  if (pool === 'period') {
    return { period: entry.availableDelta, bonus: 0 };
  }
  if (pool === 'bonus') {
    return { period: 0, bonus: entry.availableDelta };
  }
  return { period: null, bonus: null };
}

/** 用户可读的流水说明（优先结构化字段，避免英文 description 直出）。 */
export function localizeLedgerActivity(
  entry: BillingLedgerEntry,
  t: TFunction<'billing'>,
) {
  if (entry.referenceType === 'signup_grant') return t('ledger.signupGrant');
  if (entry.referenceType === 'referral_reward') return t('ledger.referralReward');
  if (entry.entryType === 'expire') return t('ledger.expire');
  if (entry.entryType === 'clawback') return t('ledger.clawback');
  if (entry.entryType === 'consume') return t('ledger.analysisConsume');
  if (entry.entryType === 'adjustment') return t('ledger.adminAdjustment');
  if (entry.metadata?.grantKind === 'upgrade_delta') {
    return t('ledger.upgradeGrant');
  }
  if (entry.metadata?.grantKind === 'cycle') return t('ledger.cycleGrant');
  if (entry.metadata?.grantKind === 'create') return t('ledger.createGrant');
  if (entry.entryType === 'grant') {
    const pool = entry.metadata?.pool;
    if (pool === 'bonus') return t('ledger.bonusGrant');
    if (pool === 'period') return t('ledger.periodGrant');
    return t('ledger.genericGrant');
  }
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
