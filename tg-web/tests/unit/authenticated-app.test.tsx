// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';

import type { ReactNode } from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { AuthenticatedApp } from '../../src/frontend/app/authenticated-app';

const clerkState = vi.hoisted(() => ({
  signInButtonProps: null as Record<string, unknown> | null,
  signInProps: null as Record<string, unknown> | null,
  signUpButtonProps: null as Record<string, unknown> | null,
  signUpProps: null as Record<string, unknown> | null,
  status: 'signed-out' as 'loading' | 'signed-in' | 'signed-out',
  userButtonProps: null as Record<string, unknown> | null,
}));

vi.mock('@clerk/react', () => ({
  ClerkLoading: ({ children }: { children: ReactNode }) =>
    clerkState.status === 'loading' ? children : null,
  ClerkLoaded: ({ children }: { children: ReactNode }) =>
    clerkState.status === 'loading' ? null : children,
  Show: ({ children, when }: { children: ReactNode; when: string }) =>
    when === clerkState.status ? children : null,
  SignIn: (props: Record<string, unknown>) => {
    clerkState.signInProps = props;
    return <div data-testid="clerk-sign-in" />;
  },
  SignInButton: ({
    children,
    ...props
  }: {
    children: ReactNode;
    [key: string]: unknown;
  }) => {
    clerkState.signInButtonProps = props;
    return children;
  },
  SignUp: (props: Record<string, unknown>) => {
    clerkState.signUpProps = props;
    return <div data-testid="clerk-sign-up" />;
  },
  SignUpButton: ({
    children,
    ...props
  }: {
    children: ReactNode;
    [key: string]: unknown;
  }) => {
    clerkState.signUpButtonProps = props;
    return children;
  },
  UserButton: (props: Record<string, unknown>) => {
    clerkState.userButtonProps = props;
    return <button type="button">Account</button>;
  },
}));

vi.mock('../../src/frontend/app/app', () => ({
  App: ({ accountMenu }: { accountMenu?: ReactNode }) => (
    <main>
      Research workspace
      {accountMenu}
    </main>
  ),
}));

beforeEach(() => {
  clerkState.signInButtonProps = null;
  clerkState.signInProps = null;
  clerkState.signUpButtonProps = null;
  clerkState.signUpProps = null;
  clerkState.status = 'signed-out';
  clerkState.userButtonProps = null;
});

afterEach(cleanup);

it('shows a stable loading state while Clerk restores the session', () => {
  clerkState.status = 'loading';

  renderApp();

  expect(screen.getByLabelText('Loading session')).toBeInTheDocument();
  expect(screen.queryByTestId('clerk-sign-in')).not.toBeInTheDocument();
  expect(screen.queryByText('Research workspace')).not.toBeInTheDocument();
});

it('shows Clerk sign-in and sign-up actions on the homepage', () => {
  renderApp();

  expect(
    screen.getByRole('heading', { name: 'TradingAgents Report' }),
  ).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Sign in' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Sign up' })).toBeInTheDocument();
  expect(screen.getByTestId('location')).toHaveTextContent('/');
  expect(clerkState.signInButtonProps).toMatchObject({ mode: 'redirect' });
  expect(clerkState.signUpButtonProps).toMatchObject({ mode: 'redirect' });
  expect(screen.queryByTestId('clerk-sign-in')).not.toBeInTheDocument();
});

it('renders the path-routed Clerk sign-in flow', () => {
  renderApp('/sign-in');

  expect(screen.getByTestId('clerk-sign-in')).toBeInTheDocument();
  expect(clerkState.signInProps).toMatchObject({
    fallbackRedirectUrl: '/',
    path: '/sign-in',
    routing: 'path',
    signUpUrl: '/sign-up',
  });
});

it('renders the Clerk registration flow at the sign-up route', () => {
  renderApp('/sign-up');

  expect(screen.getByTestId('clerk-sign-up')).toBeInTheDocument();
  expect(screen.queryByTestId('clerk-sign-in')).not.toBeInTheDocument();
  expect(clerkState.signUpProps).toMatchObject({
    fallbackRedirectUrl: '/',
    path: '/sign-up',
    routing: 'path',
    signInUrl: '/sign-in',
  });
});

it('preserves the requested protected route through sign-in', () => {
  renderApp('/reports/job-1?tab=summary');

  expect(screen.getByTestId('location')).toHaveTextContent(
    '/sign-in?redirect_url=%2Freports%2Fjob-1%3Ftab%3Dsummary',
  );
  expect(screen.getByTestId('clerk-sign-in')).toBeInTheDocument();
});

it('returns a signed-in user to the requested internal route', () => {
  clerkState.status = 'signed-in';

  renderApp('/sign-in?redirect_url=%2Freports%2Fjob-1');

  expect(screen.getByTestId('location')).toHaveTextContent('/reports/job-1');
  expect(screen.getByRole('main')).toHaveTextContent('Research workspace');
});

it('rejects an external post-authentication redirect', () => {
  clerkState.status = 'signed-in';

  renderApp('/sign-in?redirect_url=%2F%2Fevil.example');

  expect(screen.getByTestId('location')).toHaveTextContent('/');
  expect(screen.getByRole('main')).toHaveTextContent('Research workspace');
});

it('shows the workspace and account menu when signed in', () => {
  clerkState.status = 'signed-in';

  renderApp();

  expect(screen.getByRole('main')).toHaveTextContent('Research workspace');
  expect(screen.getByRole('button', { name: 'Account' })).toBeInTheDocument();
  expect(clerkState.userButtonProps).toMatchObject({
    signInUrl: '/sign-in',
  });
  expect(screen.queryByTestId('clerk-sign-in')).not.toBeInTheDocument();
});

function renderApp(initialEntry = '/') {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <AuthenticatedApp />
      <LocationProbe />
    </MemoryRouter>,
  );
}

function LocationProbe() {
  const location = useLocation();

  return (
    <output data-testid="location">
      {location.pathname}
      {location.search}
    </output>
  );
}
