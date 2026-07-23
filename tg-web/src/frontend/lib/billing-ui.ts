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

export type PlanCardAction = 'subscribe' | 'upgrade' | 'downgrade' | 'current';

/** Compare catalog prices to decide subscribe / upgrade / downgrade / current. */
export function resolvePlanCardAction(
  plan: { id: string; unitAmount: number },
  subscription: { priceId: string } | null | undefined,
  plans: Array<{ id: string; unitAmount: number }>,
): PlanCardAction {
  if (!subscription) return 'subscribe';
  if (plan.id === subscription.priceId) return 'current';
  const current = plans.find((candidate) => candidate.id === subscription.priceId);
  if (!current) return 'upgrade';
  return plan.unitAmount > current.unitAmount ? 'upgrade' : 'downgrade';
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

/** 强制走 billing 命名空间，避免 admin 等多 ns 页面默认 ns 导致漏译。 */
function billingT(t: TFunction, key: string, options?: { defaultValue?: string }) {
  return t(`billing:${key}`, options);
}

/** 用户可读的流水说明（优先结构化字段，避免英文 description 直出）。 */
export function localizeLedgerActivity(
  entry: BillingLedgerEntry,
  t: TFunction,
) {
  if (entry.referenceType === 'signup_grant') {
    return billingT(t, 'ledger.signupGrant');
  }
  if (entry.referenceType === 'referral_reward') {
    return billingT(t, 'ledger.referralReward');
  }
  if (entry.entryType === 'expire') return billingT(t, 'ledger.expire');
  if (entry.entryType === 'clawback') return billingT(t, 'ledger.clawback');
  if (entry.entryType === 'consume') {
    return billingT(t, 'ledger.analysisConsume');
  }
  if (entry.entryType === 'adjustment') {
    return billingT(t, 'ledger.adminAdjustment');
  }
  if (entry.metadata?.grantKind === 'upgrade_delta') {
    return billingT(t, 'ledger.upgradeGrant');
  }
  if (entry.metadata?.grantKind === 'cycle') {
    return billingT(t, 'ledger.cycleGrant');
  }
  if (entry.metadata?.grantKind === 'create') {
    return billingT(t, 'ledger.createGrant');
  }
  if (entry.entryType === 'grant') {
    const pool = entry.metadata?.pool;
    if (pool === 'bonus') return billingT(t, 'ledger.bonusGrant');
    if (pool === 'period') return billingT(t, 'ledger.periodGrant');
    return billingT(t, 'ledger.genericGrant');
  }
  return entry.description;
}

export function localizeLedgerPool(
  entry: BillingLedgerEntry,
  t: TFunction,
) {
  const pool = entry.metadata?.pool;
  if (pool === 'period') return billingT(t, 'ledger.poolPeriod');
  if (pool === 'bonus') return billingT(t, 'ledger.poolBonus');
  return null;
}

export function localizeEntryType(entryType: string, t: TFunction) {
  const label = billingT(t, `ledger.entryTypes.${entryType}`, {
    defaultValue: '',
  });
  return label || formatBillingStatus(entryType);
}

export function localizeReferenceType(referenceType: string, t: TFunction) {
  const label = billingT(t, `ledger.referenceTypes.${referenceType}`, {
    defaultValue: '',
  });
  return label || formatBillingStatus(referenceType);
}

export function entryTypeBadgeVariant(
  entryType: string,
): 'info' | 'down' | 'running' | 'destructive' | 'secondary' | 'outline' {
  switch (entryType) {
    case 'grant':
      return 'info';
    case 'consume':
      return 'down';
    case 'adjustment':
      return 'running';
    case 'expire':
    case 'clawback':
      return 'destructive';
    case 'reserve':
    case 'release':
      return 'secondary';
    default:
      return 'outline';
  }
}
