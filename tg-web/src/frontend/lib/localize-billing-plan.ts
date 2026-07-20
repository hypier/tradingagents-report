import type { TFunction } from 'i18next';

import type { BillingInterval, BillingPlan } from '@/backend/billing/contract';

const DEFAULT_PLAN_KEYS = {
  'starter-usd-monthly-20-v1': 'starter',
  'growth-usd-monthly-50-v1': 'growth',
  'scale-usd-monthly-100-v1': 'scale',
  'starter-usd-monthly-2000-v2': 'starter',
  'growth-usd-monthly-5000-v2': 'growth',
  'scale-usd-monthly-10000-v2': 'scale',
} as const;

const LEGACY_PLAN_NAMES = {
  'Starter 20': 'starter',
  'Growth 50': 'growth',
  'Scale 100': 'scale',
} as const;

type DefaultPlanKey =
  (typeof DEFAULT_PLAN_KEYS)[keyof typeof DEFAULT_PLAN_KEYS];

export function localizeBillingPlan(
  plan: BillingPlan,
  t: TFunction,
  translationRoot: string,
): BillingPlan {
  const key = defaultPlanKey(plan.catalogKey, plan.name);
  if (!key) return plan;

  return {
    ...plan,
    name: t(`${translationRoot}.${key}.name`),
    description: t(`${translationRoot}.description`, {
      count: plan.analysisCredits,
    }),
    features: [
      t(`${translationRoot}.credits`, { count: plan.analysisCredits }),
      t(`${translationRoot}.markets`),
    ],
  };
}

export function localizeBillingPlanName(
  name: string,
  t: TFunction,
  translationRoot: string,
): string {
  const key = defaultPlanKey(null, name);
  return key ? t(`${translationRoot}.${key}.name`) : name;
}

export function localizeBillingInterval(
  interval: BillingInterval,
  t: TFunction,
  translationRoot: string,
): string {
  return t(`${translationRoot}.${interval}`);
}

function defaultPlanKey(
  catalogKey: string | null,
  name: string,
): DefaultPlanKey | null {
  if (catalogKey && catalogKey in DEFAULT_PLAN_KEYS) {
    return DEFAULT_PLAN_KEYS[catalogKey as keyof typeof DEFAULT_PLAN_KEYS];
  }
  return LEGACY_PLAN_NAMES[name as keyof typeof LEGACY_PLAN_NAMES] ?? null;
}
