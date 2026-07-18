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

const state = vi.hoisted(() => ({ role: 'user' as 'user' | 'admin' }));
const billing = vi.hoisted(() => ({
  getBillingOverview: vi.fn(),
  getBillingSettings: vi.fn(),
  createCheckout: vi.fn(),
  createBillingPortal: vi.fn(),
  createBillingPlan: vi.fn(),
  archiveBillingPlan: vi.fn(),
  updateStripeConfiguration: vi.fn(),
  clearStripeConfiguration: vi.fn(),
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
  billing.getBillingSettings.mockResolvedValue({
    data: {
      configured: true,
      connectionHealthy: true,
      webhookConfigured: true,
      webhookUrl: 'https://app.example.test/api/stripe/webhook',
      mode: 'test',
      plans: [plan],
      configurationSource: 'environment',
      configurationEditable: false,
      secretKeyHint: 'sk_test_...1234',
      webhookSecretHint: 'whsec_...1234',
      updatedAt: null,
    },
    requestId: 'request-1',
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

it('shows subscription plans and invoices to an authenticated user', async () => {
  render(
    <MemoryRouter initialEntries={['/billing']}>
      <App />
    </MemoryRouter>,
  );

  expect(
    await screen.findByRole('heading', { name: 'Subscription and billing' }),
  ).toBeInTheDocument();
  expect(
    await screen.findByRole('heading', { name: 'Pro' }),
  ).toBeInTheDocument();
  expect(await screen.findByText('INV-001')).toBeInTheDocument();
  expect(
    screen.getByRole('link', { name: 'Subscription' }),
  ).toBeInTheDocument();
  expect(screen.queryByRole('link', { name: 'Payment settings' })).toBeNull();
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
    await screen.findByRole('heading', { name: 'Create recurring plan' }),
  ).toBeInTheDocument();
  expect(
    screen.getByRole('button', { name: 'Archive Pro' }),
  ).toBeInTheDocument();
  expect(
    screen.getByRole('link', { name: 'Payment settings' }),
  ).toBeInTheDocument();
});

it('lets an administrator save Stripe credentials without displaying them', async () => {
  state.role = 'admin';
  billing.getBillingSettings.mockResolvedValue({
    data: {
      configured: false,
      connectionHealthy: false,
      webhookConfigured: false,
      webhookUrl: 'https://app.example.test/api/stripe/webhook',
      mode: 'unconfigured',
      plans: [],
      configurationSource: 'none',
      configurationEditable: true,
      secretKeyHint: null,
      webhookSecretHint: null,
      updatedAt: null,
    },
    requestId: 'request-1',
  });
  billing.updateStripeConfiguration.mockResolvedValue({
    data: {
      configured: true,
      connectionHealthy: true,
      webhookConfigured: true,
      webhookUrl: 'https://app.example.test/api/stripe/webhook',
      mode: 'test',
      plans: [],
      configurationSource: 'database',
      configurationEditable: true,
      secretKeyHint: 'sk_test_...cdef',
      webhookSecretHint: 'whsec_...cdef',
      updatedAt: 1,
    },
    requestId: 'request-2',
  });
  render(
    <MemoryRouter initialEntries={['/admin/billing']}>
      <App />
    </MemoryRouter>,
  );

  const secretKey = await screen.findByLabelText('Stripe secret key');
  const webhookSecret = screen.getByLabelText('Webhook signing secret');
  expect(secretKey).toHaveAttribute('type', 'password');
  expect(webhookSecret).toHaveAttribute('type', 'password');
  fireEvent.change(secretKey, {
    target: { value: 'sk_test_1234567890abcdef' },
  });
  fireEvent.change(webhookSecret, {
    target: { value: 'whsec_1234567890abcdef' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Save and validate' }));

  await waitFor(() =>
    expect(billing.updateStripeConfiguration).toHaveBeenCalledWith({
      secretKey: 'sk_test_1234567890abcdef',
      webhookSecret: 'whsec_1234567890abcdef',
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
