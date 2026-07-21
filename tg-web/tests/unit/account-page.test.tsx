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

const account = vi.hoisted(() => ({
  acceptLegalDocuments: vi.fn(),
  getAccountProfile: vi.fn(),
  getReferralSummary: vi.fn(),
  updateAccountPreferences: vi.fn(),
}));

vi.mock('../../src/frontend/lib/account', () => account);
vi.mock('@clerk/react', () => ({
  UserProfile: () => <div>Clerk profile</div>,
}));
vi.mock('../../src/frontend/hooks/use-auth-session', () => ({
  useAuthSession: () => ({
    data: {
      data: {
        user: { role: 'user' },
      },
    },
    isLoading: false,
  }),
}));

const writeText = vi.fn();

beforeEach(async () => {
  await i18n.changeLanguage('en');
  queryClient.clear();
  writeText.mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText },
  });
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
        consents: [],
        hasCurrentConsents: false,
      },
      legalVersions: {
        risk_disclaimer: '2026-07-18',
        terms: '2026-07-20',
        privacy: '2026-07-18',
      },
    },
    requestId: 'request-1',
  });
  account.getReferralSummary.mockResolvedValue({
    data: {
      referralPath: `/invite/${'a'.repeat(32)}`,
      successfulReferrals: 3,
      earnedCredits: 600,
    },
    requestId: 'request-2',
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

it('shows and copies the current user referral link', async () => {
  render(
    <MemoryRouter initialEntries={['/account']}>
      <App />
    </MemoryRouter>,
  );

  expect(
    await screen.findByRole('heading', { name: 'Invite rewards' }),
  ).toBeInTheDocument();
  expect(
    screen.getByDisplayValue(new RegExp(`/invite/${'a'.repeat(32)}`)),
  ).toHaveAttribute('readonly');
  expect(screen.getByText('3')).toBeInTheDocument();
  expect(screen.getByText('600')).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'Copy invitation link' }));

  await waitFor(() =>
    expect(writeText).toHaveBeenCalledWith(
      expect.stringContaining(`/invite/${'a'.repeat(32)}`),
    ),
  );
});
