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
      usage: {
        availableCredits: 0,
        periodCredits: 0,
        bonusCredits: 0,
        spentCredits: 0,
        periodEnd: null,
      },
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
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

it('keeps analysis billing off system settings and saves rewards there', async () => {
  render(
    <MemoryRouter initialEntries={['/admin/settings']}>
      <App />
    </MemoryRouter>,
  );

  expect(await screen.findByText('Credit rewards')).toBeInTheDocument();
  expect(screen.queryByLabelText('Points per USD')).not.toBeInTheDocument();
  expect(
    screen.queryByLabelText('Points per USD (FX rate)'),
  ).not.toBeInTheDocument();
  expect(billing.getAnalysisBillingSettings).not.toHaveBeenCalled();

  fireEvent.click(
    screen.getByRole('button', { name: 'Save rewards settings' }),
  );

  await waitFor(() =>
    expect(billing.updateRewardsSettings).toHaveBeenCalledWith({
      signup: { enabled: true, points: 500 },
      referral: { enabled: true, points: 200 },
      campaign: { enabled: false, points: 0, label: '', code: null },
    }),
  );
});
