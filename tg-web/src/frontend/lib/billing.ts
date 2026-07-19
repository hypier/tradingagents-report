import type {
  BillingOverview,
  BillingPlan,
  BillingSettings,
  CreateBillingPlanInput,
} from '@/backend/billing/contract';
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
) {
  const response = await fetchImplementation(path, {
    method: 'POST',
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

export const updateStripeConfiguration = (
  input: { secretKey: string; webhookSecret: string },
  fetchImplementation?: FetchImplementation,
) =>
  write<BillingSettings>(
    '/api/admin/billing/configuration',
    input,
    fetchImplementation,
  );

export const clearStripeConfiguration = (
  fetchImplementation?: FetchImplementation,
) =>
  write<BillingSettings>(
    '/api/admin/billing/configuration/clear',
    undefined,
    fetchImplementation,
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
