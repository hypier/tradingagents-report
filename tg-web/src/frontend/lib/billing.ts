import type {
  BillingOverview,
  BillingPlan,
  BillingSettings,
  CreateBillingPlanInput,
  RewardsBillingSettings,
  UpdateCreditBillingSettingsInput,
  UpdateRewardsSettingsInput,
} from '@/backend/billing/contract';
import type { AnalysisBillingSettings } from '@/shared/product-credits';
import i18n from '@/frontend/i18n';
import { normalizeUiLocale } from '@/frontend/i18n/locales';

type FetchImplementation = typeof fetch;

async function read<T>(
  path: string,
  fetchImplementation: FetchImplementation = fetch,
) {
  const response = await fetchImplementation(path);
  if (!response.ok) throw new Error('Unable to load billing data');
  return response.json() as Promise<{ data: T; requestId: string }>;
}

async function write<T>(
  path: string,
  body?: unknown,
  fetchImplementation: FetchImplementation = fetch,
  method: 'POST' | 'PUT' = 'POST',
) {
  const response = await fetchImplementation(path, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!response.ok) throw new Error('Unable to update billing');
  return response.json() as Promise<{ data: T; requestId: string }>;
}

export const getBillingOverview = (fetchImplementation?: FetchImplementation) =>
  read<BillingOverview>('/api/billing/overview', fetchImplementation);

export const getBillingSettings = (fetchImplementation?: FetchImplementation) =>
  read<BillingSettings>('/api/admin/billing/settings', fetchImplementation);

export const getAnalysisBillingSettings = (
  fetchImplementation?: FetchImplementation,
) =>
  read<AnalysisBillingSettings>(
    '/api/admin/billing/analysis-settings',
    fetchImplementation,
  );

export const updateAnalysisBillingSettings = (
  input: UpdateCreditBillingSettingsInput,
  fetchImplementation?: FetchImplementation,
) =>
  write<AnalysisBillingSettings>(
    '/api/admin/billing/analysis-settings',
    input,
    fetchImplementation,
    'PUT',
  );

export const getRewardsSettings = (
  fetchImplementation?: FetchImplementation,
) =>
  read<RewardsBillingSettings>(
    '/api/admin/billing/rewards-settings',
    fetchImplementation,
  );

export const updateRewardsSettings = (
  input: UpdateRewardsSettingsInput,
  fetchImplementation?: FetchImplementation,
) =>
  write<RewardsBillingSettings>(
    '/api/admin/billing/rewards-settings',
    input,
    fetchImplementation,
    'PUT',
  );

export const createCheckout = (
  priceId: string,
  fetchImplementation?: FetchImplementation,
) =>
  write<{ url: string }>(
    '/api/billing/checkout',
    {
      priceId,
      requestId: crypto.randomUUID(),
      locale: normalizeUiLocale(i18n.resolvedLanguage),
    },
    fetchImplementation,
  );

export const createBillingPortal = (
  fetchImplementation?: FetchImplementation,
) =>
  write<{ url: string }>(
    '/api/billing/portal',
    { locale: normalizeUiLocale(i18n.resolvedLanguage) },
    fetchImplementation,
  );

export const createBillingPlan = (
  input: CreateBillingPlanInput,
  fetchImplementation?: FetchImplementation,
) => write<BillingPlan>('/api/admin/billing/plans', input, fetchImplementation);

export const provisionDefaultBillingPlans = (
  fetchImplementation?: FetchImplementation,
) =>
  write<BillingPlan[]>(
    '/api/admin/billing/plans/defaults',
    undefined,
    fetchImplementation,
  );

export const archiveBillingPlan = (
  priceId: string,
  fetchImplementation?: FetchImplementation,
) =>
  write<{ archived: true }>(
    `/api/admin/billing/plans/${encodeURIComponent(priceId)}/archive`,
    undefined,
    fetchImplementation,
  );

export type AdminStripeWebhookEvent = {
  stripeEventId: string;
  eventType: string;
  status: 'processing' | 'processed' | 'failed' | 'ignored';
  error: string | null;
  receivedAt: string | Date;
  processedAt: string | Date | null;
  livemode: boolean | null;
  customerId: string | null;
  subscriptionId: string | null;
  invoiceId: string | null;
};

export type AdminStripeEventsPayload = {
  days: number;
  summary: {
    processed: number;
    failed: number;
    ignored: number;
    processing: number;
  };
  events: AdminStripeWebhookEvent[];
};

export const listAdminStripeEvents = (
  input: {
    status?: AdminStripeWebhookEvent['status'];
    eventType?: string;
    days?: number;
    limit?: number;
    offset?: number;
  } = {},
  fetchImplementation?: FetchImplementation,
) => {
  const search = new URLSearchParams({
    days: String(input.days ?? 30),
    limit: String(input.limit ?? 50),
    offset: String(input.offset ?? 0),
  });
  if (input.status) search.set('status', input.status);
  if (input.eventType) search.set('eventType', input.eventType);
  return read<AdminStripeEventsPayload>(
    `/api/admin/stripe/events?${search.toString()}`,
    fetchImplementation,
  );
};
