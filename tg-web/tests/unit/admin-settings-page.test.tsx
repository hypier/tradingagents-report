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
  provisionDefaultBillingPlans: vi.fn(),
  archiveBillingPlan: vi.fn(),
  listAdminStripeEvents: vi.fn(),
}));

const adminOps = vi.hoisted(() => ({
  getAdminSettings: vi.fn(),
  updateAdminSettings: vi.fn(),
}));

const adminLlm = vi.hoisted(() => ({
  listAdminLlmModels: vi.fn(),
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
          role: 'admin',
        },
      },
    },
    isError: false,
    isLoading: false,
  }),
}));
vi.mock('../../src/frontend/lib/billing', () => billing);
vi.mock('../../src/frontend/lib/admin-ops', () => adminOps);
vi.mock('../../src/frontend/lib/admin-llm', () => adminLlm);

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: () => ({
    matches: false,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }),
});

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal('ResizeObserver', ResizeObserverStub);

beforeEach(async () => {
  queryClient.clear();
  await i18n.changeLanguage('en');
  billing.getBillingOverview.mockResolvedValue({
    data: {
      configured: true,
      plans: [],
      subscription: null,
      invoices: [],
      usage: { availableCredits: 0, spentCredits: 0, periodEnd: null },
    },
    requestId: 'request-1',
  });
  adminOps.getAdminSettings.mockResolvedValue({
    data: {
      llm: { defaultQuickModelId: '', defaultDeepModelId: '' },
    },
    requestId: 'request-1',
  });
  adminLlm.listAdminLlmModels.mockResolvedValue({
    data: { models: [] },
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
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

it('lets an administrator preview and save analysis FX rate and markup on system settings', async () => {
  render(
    <MemoryRouter initialEntries={['/admin/settings']}>
      <App />
    </MemoryRouter>,
  );

  expect(
    await screen.findByLabelText('Points per USD (FX rate)'),
  ).toBeInTheDocument();
  expect(
    screen.getByText(
      'Sample $1 AI cost: ceil(1 × 100 × (1 + 10%)) = 110 points',
    ),
  ).toBeInTheDocument();

  fireEvent.change(screen.getByLabelText('Points per USD (FX rate)'), {
    target: { value: '200' },
  });
  fireEvent.change(screen.getByLabelText('Charge markup (%)'), {
    target: { value: '15' },
  });
  fireEvent.change(screen.getByLabelText('Start balance threshold'), {
    target: { value: '250' },
  });
  fireEvent.change(screen.getByLabelText('Sample cost (USD)'), {
    target: { value: '2.5' },
  });
  fireEvent.click(
    screen.getByRole('button', { name: 'Save analysis charging settings' }),
  );

  await waitFor(() =>
    expect(billing.updateAnalysisBillingSettings).toHaveBeenCalledWith({
      analysisBalanceThreshold: 250,
      pointsPerUsd: '200',
      markupBasisPoints: 1500,
    }),
  );
});
