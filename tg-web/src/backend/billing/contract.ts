import type {
  AnalysisBillingSettings,
  RewardsSettings,
} from '../../shared/product-credits';

export type BillingInterval = 'month' | 'year';
export type BillingLocale = 'en' | 'zh';

export type BillingPlan = {
  id: string;
  catalogKey: string | null;
  name: string;
  description: string | null;
  unitAmount: number;
  currency: string;
  interval: BillingInterval;
  intervalCount: number;
  analysisCredits: number;
  supportedMarkets: string[];
  features: string[];
};

export type BillingSubscription = {
  id: string;
  status:
    | 'active'
    | 'trialing'
    | 'past_due'
    | 'unpaid'
    | 'incomplete'
    | 'incomplete_expired'
    | 'paused'
    | 'canceled';
  planName: string;
  priceId: string;
  cancelAtPeriodEnd: boolean;
  currentPeriodEnd: number | null;
};

export type BillingInvoice = {
  id: string;
  number: string | null;
  status: 'draft' | 'open' | 'paid' | 'uncollectible' | 'void' | null;
  amountDue: number;
  amountPaid: number;
  currency: string;
  createdAt: number;
  hostedInvoiceUrl: string | null;
};

export type BillingOverview = {
  configured: boolean;
  plans: BillingPlan[];
  subscription: BillingSubscription | null;
  invoices: BillingInvoice[];
  usage?: {
    availableCredits: number;
    periodCredits: number;
    bonusCredits: number;
    reservedCredits: number;
    spentCredits: number;
    periodStart: number | null;
    periodEnd: number | null;
    ledger: Array<{
      id: string;
      entryType: string;
      availableDelta: number;
      reservedDelta: number;
      spentDelta: number;
      description: string;
      referenceType: string;
      referenceId: string;
      metadata: Record<string, unknown>;
      createdAt: Date;
      analysisReport: {
        id: string;
        ticker: string;
        displayName: string | null;
        displayTicker: string | null;
        tradeDate: string;
      } | null;
    }>;
  };
};

export type CreditGrantKind = 'create' | 'cycle' | 'upgrade_delta';

export type StripeCreditGrant = {
  invoiceId: string;
  customerId: string;
  subscriptionId: string;
  priceId: string;
  /** Plan analysis_credits for this invoice (full plan amount). */
  credits: number;
  grantKind: CreditGrantKind;
  expireBeforeGrant: boolean;
  periodStart: number | null;
  periodEnd: number | null;
};

export type StripeCreditClawback = {
  chargeId: string;
  customerId: string;
  invoiceId: string | null;
  amountRefunded: number;
  amountPaid: number;
  reason: 'refund' | 'dispute';
};

export type CreditBillingSettings = AnalysisBillingSettings;

export type UpdateCreditBillingSettingsInput = AnalysisBillingSettings;

export type AnalysisCreditEstimate = {
  analysisBalanceThreshold: number;
  pointsPerUsd: string;
  markupBasisPoints: number;
  availableCredits: number;
  canStart: boolean;
  /** Soft compat: threshold + 1 for older clients that gate on reservedPoints. */
  reservedPoints?: number;
};

export type RewardsBillingSettings = RewardsSettings;

export type UpdateRewardsSettingsInput = RewardsSettings;

export type BillingSettings = {
  configured: boolean;
  connectionHealthy: boolean;
  webhookConfigured: boolean;
  webhookUrl: string;
  mode: 'test' | 'live' | 'unconfigured';
  plans: BillingPlan[];
  /** TradingAgents-managed recurring prices with `active: false`. */
  archivedPlans: BillingPlan[];
  /** Stripe 密钥仅来自部署环境变量。 */
  configurationSource: 'environment' | 'none';
  secretKeyHint: string | null;
  webhookSecretHint: string | null;
};

/** Account-level Stripe money summary for an admin overview window. */
export type AdminStripePeriodSummary = {
  currency: string;
  /** Gross paid charge/payment amount in the smallest currency unit. */
  revenueCents: number;
  /** Absolute refund amount in the smallest currency unit. */
  refundCents: number;
  /** Count of `invoice.payment_failed` events in the window. */
  paymentFailureCount: number;
};

export type CreateBillingPlanInput = {
  name: string;
  description?: string;
  unitAmount: number;
  currency: 'usd' | 'cny' | 'hkd' | 'eur';
  interval: BillingInterval;
  analysisCredits: number;
  supportedMarkets: string[];
  features: string[];
};

/** Editable plan fields — Stripe Price amount/currency/interval stay immutable. */
export type UpdateBillingPlanInput = {
  name: string;
  description?: string;
  analysisCredits: number;
  supportedMarkets: string[];
  features: string[];
};

export type CreateBillingCustomerInput = {
  clerkUserId: string;
  email: string | null;
  displayName: string;
};

export type StripeSubscriptionSnapshot = {
  id: string;
  customerId: string;
  priceId: string;
  status: BillingSubscription['status'];
  cancelAtPeriodEnd: boolean;
  currentPeriodStart: number | null;
  currentPeriodEnd: number | null;
  latestInvoiceId: string | null;
};

export type StripeWebhookEvent = {
  id: string;
  type: string;
  payload: Record<string, unknown>;
  subscription?: StripeSubscriptionSnapshot;
  /** Clear remaining period credits (canceled / unpaid / deleted). */
  expirePeriod?: boolean;
  creditGrant?: StripeCreditGrant;
  creditClawback?: StripeCreditClawback;
};

export interface BillingService {
  getOverview(customerId: string | null): Promise<BillingOverview>;
  getSettings(): Promise<BillingSettings>;
  /**
   * Stripe-authoritative period money summary for ops overview.
   * Returns null when billing is not configured.
   */
  getAdminPeriodSummary(input: {
    from: Date;
    to: Date;
  }): Promise<AdminStripePeriodSummary | null>;
  createCustomer(input: CreateBillingCustomerInput): Promise<string>;
  createCheckout(
    customerId: string,
    priceId: string,
    idempotencyKey: string,
    locale: BillingLocale,
  ): Promise<string>;
  createPortal(
    customerId: string,
    locale: BillingLocale,
    priceId?: string,
  ): Promise<string>;
  createPlan(input: CreateBillingPlanInput): Promise<BillingPlan>;
  updatePlan(
    priceId: string,
    input: UpdateBillingPlanInput,
  ): Promise<BillingPlan>;
  provisionDefaultPlans(): Promise<BillingPlan[]>;
  archivePlan(priceId: string): Promise<void>;
  restorePlan(priceId: string): Promise<BillingPlan>;
  handleWebhook(
    payload: string,
    signature: string,
  ): Promise<StripeWebhookEvent>;
}

export class BillingServiceError extends Error {
  constructor(
    public readonly code: string,
    public readonly status: number,
    public readonly publicMessage: string,
    cause?: unknown,
  ) {
    super(publicMessage);
    this.name = 'BillingServiceError';
    this.cause = cause;
  }
}
