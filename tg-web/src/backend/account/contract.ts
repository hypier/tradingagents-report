import type { ProductMarketCode } from '../../shared/product-markets';

export type InterfaceLanguage = 'en' | 'zh-CN';
export type DefaultMarket = ProductMarketCode;

export type AccountProfile = {
  clerkUserId: string;
  displayName: string;
  email: string | null;
  avatarUrl: string;
  interfaceLanguage: InterfaceLanguage;
  reportLanguage: string;
  timezone: string;
  defaultMarket: DefaultMarket;
  stripeCustomerId: string | null;
};

export type AccountPreferences = Pick<
  AccountProfile,
  'interfaceLanguage' | 'reportLanguage' | 'timezone' | 'defaultMarket'
>;

export type ReferralSummary = {
  referralPath: string;
  successfulReferrals: number;
  earnedCredits: number;
};
