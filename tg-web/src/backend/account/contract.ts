export type InterfaceLanguage = 'en' | 'zh-CN';
/** Catalog country code (e.g. US/HK/JP) or CRYPTO; derived from enabled exchanges. */
export type DefaultMarket = string;

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
