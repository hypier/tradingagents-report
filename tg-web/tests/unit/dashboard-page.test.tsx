// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, expect, it, vi } from 'vitest';

import { DashboardPage } from '../../src/frontend/pages/dashboard-page';
import { TooltipProvider } from '../../src/frontend/components/ui/tooltip';
import * as billing from '../../src/frontend/lib/billing';

vi.mock('../../src/frontend/lib/billing', () => ({
  getBillingOverview: vi.fn(),
}));

vi.mock('../../src/frontend/lib/research', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../src/frontend/lib/research')>();
  return {
    ...actual,
    listResearch: vi.fn().mockResolvedValue({
      data: [
        {
          id: 'job-running',
          ticker: 'NASDAQ:AAPL',
          status: 'running',
          progress_percent: 36,
          display: {
            display_name: 'Apple',
            logo_url: 'https://example.test/apple.png',
          },
        },
        {
          id: 'job-complete',
          ticker: 'NASDAQ:MSFT',
          status: 'succeeded',
          display: {
            symbol: 'MSFT',
            display_name: 'Microsoft',
            logo_url: 'https://example.test/microsoft.png',
          },
        },
      ],
      requestId: 'jobs-1',
    }),
  };
});

function renderDashboard() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <MemoryRouter>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <DashboardPage />
        </TooltipProvider>
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.mocked(billing.getBillingOverview).mockResolvedValue({
    data: {
      configured: true,
      plans: [],
      subscription: {
        id: 'sub_1',
        status: 'active',
        planName: 'Growth 50',
        priceId: 'price_growth',
        cancelAtPeriodEnd: false,
        currentPeriodEnd: 1_900_000_000,
      },
      invoices: [],
      usage: { availableCredits: 84 },
    },
    requestId: 'billing-1',
  } as never);
});

it('shows plan summary and a single start-analysis action when subscribed', async () => {
  renderDashboard();

  expect(
    screen.getByRole('heading', { name: 'Research overview' }),
  ).toBeInTheDocument();
  expect(
    await screen.findByRole('link', { name: 'Start analysis' }),
  ).toHaveAttribute('href', '/desk');
  expect(
    screen.queryByRole('link', { name: 'Subscribe' }),
  ).not.toBeInTheDocument();
  expect(screen.getByRole('link', { name: /Task center/ })).toHaveAttribute(
    'href',
    '/tasks',
  );

  const creditsLabel = await screen.findByText('Available credits');
  expect(
    await within(creditsLabel.parentElement!).findByText('84'),
  ).toBeInTheDocument();
  expect(await screen.findByText('Growth 50')).toBeInTheDocument();
  expect(screen.getAllByText('MSFT').length).toBeGreaterThan(0);
  expect(screen.queryByText('Apple')).not.toBeInTheDocument();
  expect(
    screen.getByText('Completed research reports only.'),
  ).toBeInTheDocument();
});

it('guides unsubscribed users to plans with one primary action', async () => {
  vi.mocked(billing.getBillingOverview).mockResolvedValue({
    data: {
      configured: true,
      plans: [],
      subscription: null,
      invoices: [],
      usage: { availableCredits: 12 },
    },
    requestId: 'billing-2',
  } as never);

  renderDashboard();

  expect(
    await screen.findByRole('heading', { name: 'Choose a plan to continue' }),
  ).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Subscribe' })).toHaveAttribute(
    'href',
    '/billing/subscription',
  );
  expect(
    screen.queryByRole('link', { name: 'Start analysis' }),
  ).not.toBeInTheDocument();
  expect(await screen.findByText('No plan')).toBeInTheDocument();
});
