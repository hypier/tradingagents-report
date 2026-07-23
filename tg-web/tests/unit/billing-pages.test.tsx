// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { App } from '../../src/frontend/app/app';
import { queryClient } from '../../src/frontend/app/query-client';
import i18n from '../../src/frontend/i18n';

const state = vi.hoisted(() => ({ role: 'user' as 'user' | 'admin' }));
const billing = vi.hoisted(() => ({
  getBillingOverview: vi.fn(),
  getBillingSettings: vi.fn(),
  getAnalysisBillingSettings: vi.fn(),
  updateAnalysisBillingSettings: vi.fn(),
  getRewardsSettings: vi.fn(),
  updateRewardsSettings: vi.fn(),
  createCheckout: vi.fn(),
  createBillingPortal: vi.fn(),
  createBillingPlan: vi.fn(),
  updateBillingPlan: vi.fn(),
  provisionDefaultBillingPlans: vi.fn(),
  archiveBillingPlan: vi.fn(),
  restoreBillingPlan: vi.fn(),
}));

vi.mock('../../src/frontend/hooks/use-auth-session', () => ({
  useAuthSession: () => ({
    data: {
      data: {
        authenticated: true,
        session: { id: 'session-1' },
        user: {
          id: 'user-1',
          displayName: 'Test User',
          email: 'test@example.test',
          imageUrl: '',
          role: state.role,
        },
      },
    },
    isError: false,
    isLoading: false,
  }),
}));
vi.mock('../../src/frontend/lib/billing', () => billing);

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: () => ({
    matches: false,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }),
});

const plan = {
  id: 'price_pro',
  catalogKey: null,
  name: 'Pro',
  description: 'Full research access',
  unitAmount: 1900,
  currency: 'usd',
  interval: 'month' as const,
  intervalCount: 1,
  analysisCredits: 20,
  supportedMarkets: ['US', 'HK'],
  features: ['Full analyst team'],
};

beforeEach(() => {
  state.role = 'user';
  queryClient.clear();
  billing.getBillingOverview.mockResolvedValue({
    data: {
      configured: true,
      plans: [plan],
      subscription: null,
      invoices: [
        {
          id: 'in_test',
          number: 'INV-001',
          status: 'paid',
          amountDue: 1900,
          amountPaid: 1900,
          currency: 'usd',
          createdAt: 1_700_000_000,
          hostedInvoiceUrl: 'https://invoice.stripe.test/in_test',
        },
      ],
    },
    requestId: 'request-1',
  });
  billing.getAnalysisBillingSettings.mockResolvedValue({
    data: {
      analysisBalanceThreshold: 100,
      pointsPerUsd: '100',
      markupBasisPoints: 1000,
    },
    requestId: 'request-1',
  });
  billing.updateAnalysisBillingSettings.mockImplementation(async (input) => ({
    data: input,
    requestId: 'request-2',
  }));
  billing.getRewardsSettings.mockResolvedValue({
    data: {
      signup: { enabled: true, points: 500 },
      referral: { enabled: true, points: 200 },
      campaign: { enabled: false, points: 0, label: '', code: null },
    },
    requestId: 'request-1',
  });
  billing.updateRewardsSettings.mockImplementation(async (input) => ({
    data: input,
    requestId: 'request-2',
  }));
  billing.getBillingSettings.mockResolvedValue({
    data: {
      configured: true,
      connectionHealthy: true,
      webhookConfigured: true,
      webhookUrl: 'https://app.example.test/api/stripe/webhook',
      mode: 'test',
      plans: [plan],
      archivedPlans: [],
      configurationSource: 'environment',
      secretKeyHint: 'sk_test_...1234',
      webhookSecretHint: 'whsec_...1234',
    },
    requestId: 'request-1',
  });
  billing.provisionDefaultBillingPlans.mockResolvedValue({
    data: [],
    requestId: 'request-2',
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

it('shows subscription plans to an authenticated user', async () => {
  render(
    <MemoryRouter initialEntries={['/billing/subscription']}>
      <App />
    </MemoryRouter>,
  );

  expect(
    await screen.findByRole('heading', { name: 'Subscription' }),
  ).toBeInTheDocument();
  expect(
    await screen.findByRole('heading', { name: 'Pro' }),
  ).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Subscription' })).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Invoices' })).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Usage' })).toBeInTheDocument();
  expect(screen.queryByRole('link', { name: 'Payment settings' })).toBeNull();
});

it('shows invoices on the invoices page', async () => {
  render(
    <MemoryRouter initialEntries={['/billing/invoices']}>
      <App />
    </MemoryRouter>,
  );

  expect(
    await screen.findByRole('heading', { name: 'Invoices' }),
  ).toBeInTheDocument();
  expect(await screen.findByText('INV-001')).toBeInTheDocument();
});

it('shows plan and reward deltas for consumption', async () => {
  billing.getBillingOverview.mockResolvedValue({
    data: {
      configured: true,
      plans: [],
      subscription: null,
      invoices: [],
      usage: {
        availableCredits: 118,
        periodCredits: 100,
        bonusCredits: 18,
        reservedCredits: 0,
        spentCredits: 14,
        periodEnd: null,
        ledger: [
          {
            id: 'entry-1',
            entryType: 'consume',
            availableDelta: -14,
            reservedDelta: 0,
            spentDelta: 14,
            description: 'Analysis credit consumed',
            referenceType: 'analysis_job',
            referenceId: 'job-1',
            metadata: {
              periodDelta: -10,
              bonusDelta: -4,
            },
            analysisReport: {
              id: 'job-1',
              ticker: 'AAPL',
              displayName: 'Apple Inc.',
              displayTicker: 'AAPL',
              tradeDate: '2026-07-19',
            },
            createdAt: new Date('2026-07-20T00:00:00Z'),
          },
        ],
      },
    },
    requestId: 'request-1',
  });

  render(
    <MemoryRouter initialEntries={['/billing/usage']}>
      <App />
    </MemoryRouter>,
  );

  expect(await screen.findByText('Analysis usage')).toBeInTheDocument();
  expect(screen.queryByText('$0.123')).toBeNull();
  expect(screen.queryByText('14 points')).toBeNull();
  expect(screen.getByText('-10')).toBeInTheDocument();
  expect(screen.getByText('-4')).toBeInTheDocument();
  expect(screen.getAllByText('Plan').length).toBeGreaterThanOrEqual(1);
  expect(screen.getAllByText('Reward').length).toBeGreaterThanOrEqual(1);
  expect(
    screen.getByRole('link', { name: 'Apple Inc. (AAPL) · 2026-07-19' }),
  ).toHaveAttribute('href', '/reports/job-1');
});

it('localizes signup and referral credit activity', async () => {
  await i18n.changeLanguage('en');
  billing.getBillingOverview.mockResolvedValue({
    data: {
      configured: true,
      plans: [],
      subscription: null,
      invoices: [],
      usage: {
        availableCredits: 700,
        periodCredits: 0,
        bonusCredits: 700,
        reservedCredits: 0,
        spentCredits: 0,
        periodEnd: null,
        ledger: [
          {
            id: 'signup-entry',
            entryType: 'grant',
            referenceType: 'signup_grant',
            referenceId: 'user-1',
            description: 'raw signup description',
            availableDelta: 500,
            reservedDelta: 0,
            spentDelta: 0,
            metadata: {},
            analysisReport: null,
            createdAt: new Date('2026-07-21T00:00:00Z'),
          },
          {
            id: 'referral-entry',
            entryType: 'grant',
            referenceType: 'referral_reward',
            referenceId: 'user-2',
            description: 'raw referral description',
            availableDelta: 200,
            reservedDelta: 0,
            spentDelta: 0,
            metadata: {},
            analysisReport: null,
            createdAt: new Date('2026-07-21T00:00:00Z'),
          },
        ],
      },
    },
    requestId: 'request-1',
  });

  render(
    <MemoryRouter initialEntries={['/billing/usage']}>
      <App />
    </MemoryRouter>,
  );

  expect(await screen.findByText('New user signup credit')).toBeInTheDocument();
  expect(screen.getByText('Referral signup reward')).toBeInTheDocument();
  expect(screen.queryByText('raw signup description')).toBeNull();
});

it('localizes the default subscription catalog in Chinese', async () => {
  await i18n.changeLanguage('zh');
  billing.getBillingOverview.mockResolvedValue({
    data: {
      configured: true,
      plans: [defaultScalePlan()],
      subscription: null,
      invoices: [],
    },
    requestId: 'request-1',
  });

  render(
    <MemoryRouter initialEntries={['/billing/subscription']}>
      <App />
    </MemoryRouter>,
  );

  expect(
    await screen.findByRole('heading', { name: '专业版 100' }),
  ).toBeInTheDocument();
  expect(screen.getByText('每月续订，发放 100 积分')).toBeInTheDocument();
  expect(screen.getByText('每月 100 积分')).toBeInTheDocument();
  expect(screen.getByText('支持全部市场')).toBeInTheDocument();
  expect(screen.getByText('每月')).toBeInTheDocument();
  expect(screen.queryByText('Scale 100')).toBeNull();
});

it('lets an administrator inspect Stripe settings and active plans', async () => {
  state.role = 'admin';
  render(
    <MemoryRouter initialEntries={['/admin/billing']}>
      <App />
    </MemoryRouter>,
  );

  expect(await screen.findByText('Connected')).toBeInTheDocument();
  expect(
    screen.getByDisplayValue('https://app.example.test/api/stripe/webhook'),
  ).toHaveAttribute('readonly');
  fireEvent.mouseDown(screen.getByRole('tab', { name: 'Plans' }), {
    button: 0,
    ctrlKey: false,
  });
  expect(
    await screen.findByRole('heading', { name: 'Active plans' }),
  ).toBeInTheDocument();
  expect(
    screen.getByRole('button', { name: 'Add plan' }),
  ).toBeInTheDocument();
  expect(
    screen.getByRole('button', { name: 'Provision standard tiers' }),
  ).toBeInTheDocument();
  expect(
    screen.getByRole('button', { name: 'Edit Pro' }),
  ).toBeInTheDocument();
  expect(
    screen.getByRole('button', { name: 'Archive Pro' }),
  ).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Archive Pro' }));
  expect(
    await screen.findByRole('heading', { name: 'Archive this plan?' }),
  ).toBeInTheDocument();
  expect(billing.archiveBillingPlan).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Archive plan' }));
  await waitFor(() =>
    expect(billing.archiveBillingPlan).toHaveBeenCalledWith('price_pro'),
  );
  fireEvent.click(
    screen.getByRole('button', { name: 'Provision standard tiers' }),
  );
  await waitFor(() =>
    expect(billing.provisionDefaultBillingPlans).toHaveBeenCalledOnce(),
  );
  expect(
    screen.getByRole('link', { name: 'Payment settings' }),
  ).toBeInTheDocument();
});

it('localizes default plans in the Chinese Stripe settings table', async () => {
  await i18n.changeLanguage('zh');
  state.role = 'admin';
  billing.getBillingSettings.mockResolvedValue({
    data: {
      configured: true,
      connectionHealthy: true,
      webhookConfigured: true,
      webhookUrl: 'https://app.example.test/api/stripe/webhook',
      mode: 'test',
      plans: [defaultScalePlan()],
      archivedPlans: [],
      configurationSource: 'environment',
      secretKeyHint: 'sk_test_...1234',
      webhookSecretHint: 'whsec_...1234',
    },
    requestId: 'request-1',
  });

  render(
    <MemoryRouter initialEntries={['/admin/billing']}>
      <App />
    </MemoryRouter>,
  );

  fireEvent.mouseDown(await screen.findByRole('tab', { name: '套餐' }), {
    button: 0,
    ctrlKey: false,
  });
  expect(await screen.findByText('专业版 100')).toBeInTheDocument();
  expect(screen.getByText('每月续订，发放 100 积分')).toBeInTheDocument();
  expect(screen.getByText('每月')).toBeInTheDocument();
  expect(
    screen.getByRole('button', { name: '归档 专业版 100' }),
  ).toBeInTheDocument();
});

it('lets an administrator preview and save analysis billing settings', async () => {
  state.role = 'admin';
  render(
    <MemoryRouter initialEntries={['/admin/billing/analysis']}>
      <App />
    </MemoryRouter>,
  );

  expect(
    await screen.findByLabelText('Points per USD'),
  ).toBeInTheDocument();
  expect(
    screen.getByText(
      'Sample $1 AI cost: ceil(1 × 100 × (1 + 10%)) = 110 points',
    ),
  ).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Points per USD'), {
    target: { value: '200' },
  });
  fireEvent.change(screen.getByLabelText('Cost markup (%)'), {
    target: { value: '15' },
  });
  fireEvent.change(screen.getByLabelText('Start balance threshold'), {
    target: { value: '250' },
  });
  fireEvent.change(screen.getByLabelText('Sample cost (USD)'), {
    target: { value: '2.5' },
  });
  fireEvent.click(
    screen.getByRole('button', { name: 'Save analysis settings' }),
  );

  await waitFor(() =>
    expect(billing.updateAnalysisBillingSettings).toHaveBeenCalledWith({
      analysisBalanceThreshold: 250,
      pointsPerUsd: '200',
      markupBasisPoints: 1500,
    }),
  );
});

it('does not load payment settings for a regular user', () => {
  render(
    <MemoryRouter initialEntries={['/admin/billing']}>
      <App />
    </MemoryRouter>,
  );

  expect(screen.getByText('Administrator access required')).toBeInTheDocument();
  expect(billing.getBillingSettings).not.toHaveBeenCalled();
});

function defaultScalePlan() {
  return {
    ...plan,
    id: 'price_scale',
    catalogKey: 'scale-usd-monthly-100-v1',
    name: 'Scale 100',
    description: '100 analysis credits, renewed monthly',
    unitAmount: 10_000,
    analysisCredits: 100,
    features: ['100 analysis credits per month', 'All supported markets'],
  };
}
