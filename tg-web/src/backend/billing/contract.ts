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
    reservedCredits: number;
    spentCredits: number;
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
    }>;
  };
};

export type CreditBillingSettings = {
  id: string;
  pointsPerUsd: string;
  markupBasisPoints: number;
  reserveBufferBasisPoints: number;
  defaultEstimatedCostUsd: string;
  signupGrantUsd: string;
  referralRewardUsd: string;
  updatedByClerkUserId: string | null;
  createdAt: string | Date;
  updatedAt: string | Date;
};

export type UpdateCreditBillingSettingsInput = Pick<
  CreditBillingSettings,
  | 'pointsPerUsd'
  | 'markupBasisPoints'
  | 'reserveBufferBasisPoints'
  | 'defaultEstimatedCostUsd'
  | 'signupGrantUsd'
  | 'referralRewardUsd'
>;

export type AnalysisCreditEstimate = {
  reservedPoints: number;
};

export type BillingSettings = {
  configured: boolean;
  connectionHealthy: boolean;
  webhookConfigured: boolean;
  webhookUrl: string;
  mode: 'test' | 'live' | 'unconfigured';
  plans: BillingPlan[];
  configurationSource: 'database' | 'environment' | 'none';
  configurationEditable: boolean;
  secretKeyHint: string | null;
  webhookSecretHint: string | null;
  updatedAt: number | null;
};

export type UpdateStripeConfigurationInput = {
  secretKey: string;
  webhookSecret: string;
  actorClerkUserId: string;
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
  creditGrant?: {
    invoiceId: string;
    customerId: string;
    subscriptionId: string;
    priceId: string;
    credits: number;
    periodStart: number | null;
    periodEnd: number | null;
  };
};

export interface BillingService {
  getOverview(customerId: string | null): Promise<BillingOverview>;
  getSettings(): Promise<BillingSettings>;
  createCustomer(input: CreateBillingCustomerInput): Promise<string>;
  createCheckout(
    customerId: string,
    priceId: string,
    idempotencyKey: string,
    locale: BillingLocale,
  ): Promise<string>;
  createPortal(customerId: string, locale: BillingLocale): Promise<string>;
  createPlan(input: CreateBillingPlanInput): Promise<BillingPlan>;
  provisionDefaultPlans(): Promise<BillingPlan[]>;
  archivePlan(priceId: string): Promise<void>;
  updateConfiguration(
    input: UpdateStripeConfigurationInput,
  ): Promise<BillingSettings>;
  clearConfiguration(actorClerkUserId: string): Promise<BillingSettings>;
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
