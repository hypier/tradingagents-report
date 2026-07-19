// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';

import type { ReactNode } from 'react';
import { act, cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { ClerkApp } from '../../src/frontend/app/clerk-app';

const clerkProviderState = vi.hoisted(() => ({
  failed: false,
  props: null as Record<string, unknown> | null,
}));

vi.mock('@clerk/react', () => ({
  ClerkFailed: ({ children }: { children: ReactNode }) =>
    clerkProviderState.failed ? children : null,
  ClerkProvider: ({
    children,
    ...props
  }: {
    children: ReactNode;
    [key: string]: unknown;
  }) => {
    clerkProviderState.props = props;
    return children;
  },
}));

vi.mock('../../src/frontend/app/authenticated-app', () => ({
  AuthenticatedApp: () =>
    clerkProviderState.failed ? null : <main>Authenticated application</main>,
}));

beforeEach(() => {
  clerkProviderState.failed = false;
  clerkProviderState.props = null;
});

afterEach(cleanup);

it('configures Clerk registration, login, logout, and SPA navigation', () => {
  render(
    <MemoryRouter>
      <ClerkApp publishableKey="pk_test_public" />
      <LocationProbe />
    </MemoryRouter>,
  );

  expect(screen.getByRole('main')).toHaveTextContent(
    'Authenticated application',
  );
  expect(clerkProviderState.props).toMatchObject({
    afterSignOutUrl: '/sign-in',
    publishableKey: 'pk_test_public',
    signInFallbackRedirectUrl: '/',
    signInUrl: '/sign-in',
    signUpFallbackRedirectUrl: '/',
    signUpUrl: '/sign-up',
  });

  act(() => {
    (clerkProviderState.props?.routerPush as (to: string) => void)('/sign-up');
  });
  expect(screen.getByTestId('location')).toHaveTextContent('/sign-up');

  act(() => {
    (clerkProviderState.props?.routerReplace as (to: string) => void)(
      '/sign-in',
    );
  });
  expect(screen.getByTestId('location')).toHaveTextContent('/sign-in');
});

it('shows a visible error instead of a blank page when Clerk fails', () => {
  clerkProviderState.failed = true;

  render(
    <MemoryRouter>
      <ClerkApp publishableKey="pk_test_invalid" />
    </MemoryRouter>,
  );

  expect(screen.getByRole('alert')).toHaveTextContent(
    'Authentication unavailable',
  );
  expect(screen.getByRole('alert')).toHaveTextContent(
    'Configure a valid publishable key',
  );
  expect(
    screen.queryByText('Authenticated application'),
  ).not.toBeInTheDocument();
});

function LocationProbe() {
  const location = useLocation();

  return <output data-testid="location">{location.pathname}</output>;
}
