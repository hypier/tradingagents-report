export const LEGAL_DOCUMENT_VERSIONS = {
  risk_disclaimer: '2026-07-18',
  terms: '2026-07-20',
  privacy: '2026-07-18',
} as const;

export type LegalDocumentType = keyof typeof LEGAL_DOCUMENT_VERSIONS;
export type InterfaceLanguage = 'en' | 'zh-CN';
export type DefaultMarket = 'US' | 'HK' | 'CN' | 'CRYPTO';

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
  consents: Array<{
    documentType: LegalDocumentType;
    documentVersion: string;
    acceptedAt: Date;
  }>;
  hasCurrentConsents: boolean;
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
