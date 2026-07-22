/**
 * Product billing + rewards settings stored in system_settings.
 * Billing and rewards are independent; rewards types are independently optional.
 */
export type AnalysisBillingSettings = {
  analysisBalanceThreshold: number;
  pointsPerUsd: string;
  markupBasisPoints: number;
};

export type RewardChannelSettings = {
  enabled: boolean;
  points: number;
};

export type CampaignRewardSettings = RewardChannelSettings & {
  label: string;
  code: string | null;
};

export type RewardsSettings = {
  signup: RewardChannelSettings;
  referral: RewardChannelSettings;
  campaign: CampaignRewardSettings;
};

export const DEFAULT_BILLING_SETTINGS: AnalysisBillingSettings = {
  analysisBalanceThreshold: 0,
  pointsPerUsd: '100',
  markupBasisPoints: 1000,
};

export const DEFAULT_REWARDS_SETTINGS: RewardsSettings = {
  signup: { enabled: true, points: 500 },
  referral: { enabled: true, points: 200 },
  campaign: { enabled: false, points: 0, label: '', code: null },
};

export type CreditPricingSnapshot = {
  points_per_usd: string;
  markup_basis_points: number;
  analysis_balance_threshold: number;
};

export function toCreditPricingSnapshot(
  settings: AnalysisBillingSettings,
): CreditPricingSnapshot {
  return {
    points_per_usd: settings.pointsPerUsd,
    markup_basis_points: settings.markupBasisPoints,
    analysis_balance_threshold: settings.analysisBalanceThreshold,
  };
}

export function parseBillingSettings(
  value: Record<string, unknown> | null | undefined,
): AnalysisBillingSettings {
  const threshold = numberOr(
    value?.analysisBalanceThreshold,
    DEFAULT_BILLING_SETTINGS.analysisBalanceThreshold,
  );
  const markup = numberOr(
    value?.markupBasisPoints,
    DEFAULT_BILLING_SETTINGS.markupBasisPoints,
  );
  const pointsPerUsd =
    typeof value?.pointsPerUsd === 'string' && value.pointsPerUsd.trim()
      ? value.pointsPerUsd.trim()
      : DEFAULT_BILLING_SETTINGS.pointsPerUsd;
  return {
    analysisBalanceThreshold: Math.max(0, Math.floor(threshold)),
    pointsPerUsd,
    markupBasisPoints: Math.max(0, Math.floor(markup)),
  };
}

export function parseRewardsSettings(
  value: Record<string, unknown> | null | undefined,
): RewardsSettings {
  const signup = asRecord(value?.signup);
  const referral = asRecord(value?.referral);
  const campaign = asRecord(value?.campaign);
  return {
    signup: parseChannel(signup, DEFAULT_REWARDS_SETTINGS.signup),
    referral: parseChannel(referral, DEFAULT_REWARDS_SETTINGS.referral),
    campaign: {
      ...parseChannel(campaign, DEFAULT_REWARDS_SETTINGS.campaign),
      label:
        typeof campaign.label === 'string'
          ? campaign.label
          : DEFAULT_REWARDS_SETTINGS.campaign.label,
      code:
        typeof campaign.code === 'string' && campaign.code.trim()
          ? campaign.code.trim()
          : null,
    },
  };
}

function parseChannel(
  value: Record<string, unknown>,
  fallback: RewardChannelSettings,
): RewardChannelSettings {
  return {
    enabled: booleanOr(value.enabled, fallback.enabled),
    points: Math.max(0, Math.floor(numberOr(value.points, fallback.points))),
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)
    : {};
}

function numberOr(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function booleanOr(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}
