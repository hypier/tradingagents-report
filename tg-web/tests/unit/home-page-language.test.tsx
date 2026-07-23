// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { HomePage } from '../../src/frontend/pages/home-page';
import { TooltipProvider } from '../../src/frontend/components/ui/tooltip';
import i18n from '../../src/frontend/i18n';

const account = vi.hoisted(() => ({
  getAccountProfile: vi.fn(),
}));

vi.mock('../../src/frontend/lib/account', () => account);
vi.mock('../../src/frontend/lib/billing', () => ({
  getBillingOverview: vi.fn().mockResolvedValue({
    data: { usage: { availableCredits: 100 } },
    requestId: 'billing-1',
  }),
}));
vi.mock('../../src/frontend/lib/research', () => ({
  createResearch: vi.fn(),
  estimateResearch: vi.fn(),
  getMarketSnapshot: vi.fn(),
  listResearch: vi.fn().mockResolvedValue({ data: [], requestId: 'jobs-1' }),
  stopResearch: vi.fn(),
}));
vi.mock('../../src/frontend/lib/llm-catalog', () => ({
  getLlmCatalog: vi.fn().mockResolvedValue({
    data: {
      providers: [],
      models: [],
      defaults: { defaultQuickModelId: '', defaultDeepModelId: '' },
    },
    requestId: 'llm-1',
  }),
}));

beforeEach(async () => {
  await i18n.changeLanguage('en');
  account.getAccountProfile.mockResolvedValue({
    data: {
      profile: {
        clerkUserId: 'user-1',
        displayName: 'Test User',
        email: 'test@example.test',
        avatarUrl: '',
        interfaceLanguage: 'en',
        reportLanguage: 'English',
        timezone: 'UTC',
        defaultMarket: 'US',
        stripeCustomerId: null,
      },
    },
    requestId: 'request-1',
  });
});

afterEach(() => {
  vi.clearAllMocks();
});

function renderHome() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <MemoryRouter>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <HomePage />
        </TooltipProvider>
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

it('shows an output language selector with the Core default', async () => {
  renderHome();

  expect(
    await screen.findByRole('combobox', { name: 'Report language' }),
  ).toHaveTextContent('English');
});

it('prefills the output language from account preferences', async () => {
  account.getAccountProfile.mockResolvedValue({
    data: {
      profile: {
        clerkUserId: 'user-1',
        displayName: 'Test User',
        email: 'test@example.test',
        avatarUrl: '',
        interfaceLanguage: 'zh-CN',
        reportLanguage: 'Chinese',
        timezone: 'Asia/Shanghai',
        defaultMarket: 'CN',
        stripeCustomerId: null,
      },
    },
    requestId: 'request-1',
  });

  renderHome();

  await waitFor(() =>
    expect(
      screen.getByRole('combobox', { name: 'Report language' }),
    ).toHaveTextContent('Chinese'),
  );
});

it('normalizes legacy account language values onto the desk selector', async () => {
  account.getAccountProfile.mockResolvedValue({
    data: {
      profile: {
        clerkUserId: 'user-1',
        displayName: 'Test User',
        email: 'test@example.test',
        avatarUrl: '',
        interfaceLanguage: 'zh-CN',
        reportLanguage: '中文',
        timezone: 'Asia/Shanghai',
        defaultMarket: 'CN',
        stripeCustomerId: null,
      },
    },
    requestId: 'request-1',
  });

  renderHome();

  await waitFor(() =>
    expect(
      screen.getByRole('combobox', { name: 'Report language' }),
    ).toHaveTextContent('Chinese'),
  );
});
