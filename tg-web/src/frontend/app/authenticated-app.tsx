import type { ReactNode } from 'react';
import {
  ClerkLoaded,
  ClerkLoading,
  Show,
  SignIn,
  SignInButton,
  SignUp,
  SignUpButton,
  UserButton,
} from '@clerk/react';
import { Sparkles } from 'lucide-react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';

import { Button } from '../components/ui/button';
import { Spinner } from '../components/ui/spinner';
import { App } from './app';
import { LegalPage } from '../pages/legal-page';

export function AuthenticatedApp() {
  return (
    <>
      <ClerkLoading>
        <main className="grid min-h-svh place-items-center">
          <Spinner aria-label="Loading session" />
        </main>
      </ClerkLoading>
      <ClerkLoaded>
        <Show when="signed-out">
          <SignedOutRoutes />
        </Show>
        <Show when="signed-in">
          <SignedInApp />
        </Show>
      </ClerkLoaded>
    </>
  );
}

function SignedOutRoutes() {
  const location = useLocation();
  const returnTo = `${location.pathname}${location.search}`;
  const signInTarget =
    returnTo === '/'
      ? '/sign-in'
      : `/sign-in?redirect_url=${encodeURIComponent(returnTo)}`;

  return (
    <Routes>
      <Route
        path="/"
        element={
          <AuthPage>
            <div className="flex w-full gap-2">
              <SignInButton mode="redirect">
                <Button className="flex-1" size="lg" variant="outline">
                  Sign in
                </Button>
              </SignInButton>
              <SignUpButton mode="redirect">
                <Button className="flex-1" size="lg">
                  Sign up
                </Button>
              </SignUpButton>
            </div>
          </AuthPage>
        }
      />
      <Route
        path="/sign-in/*"
        element={
          <AuthPage>
            <SignIn
              fallbackRedirectUrl="/"
              path="/sign-in"
              routing="path"
              signUpUrl="/sign-up"
            />
          </AuthPage>
        }
      />
      <Route
        path="/sign-up/*"
        element={
          <AuthPage>
            <SignUp
              fallbackRedirectUrl="/"
              path="/sign-up"
              routing="path"
              signInUrl="/sign-in"
            />
          </AuthPage>
        }
      />
      <Route path="/legal/:document" element={<LegalPage publicView />} />
      <Route path="*" element={<Navigate replace to={signInTarget} />} />
    </Routes>
  );
}

function SignedInApp() {
  const location = useLocation();

  if (isAuthenticationPath(location.pathname)) {
    const redirectUrl = new URLSearchParams(location.search).get(
      'redirect_url',
    );
    return <Navigate replace to={safeRedirectTarget(redirectUrl)} />;
  }

  return <App accountMenu={<UserButton signInUrl="/sign-in" />} />;
}

function AuthPage({ children }: { children: ReactNode }) {
  return (
    <main className="grid min-h-svh place-items-center bg-muted/30 px-4 py-10">
      <section className="flex w-full max-w-sm flex-col items-center gap-6">
        <div className="flex items-center gap-2">
          <Sparkles className="size-5" aria-hidden="true" />
          <h1 className="text-xl font-semibold">TradingAgents</h1>
        </div>
        {children}
      </section>
    </main>
  );
}

function isAuthenticationPath(pathname: string) {
  return (
    pathname === '/sign-in' ||
    pathname.startsWith('/sign-in/') ||
    pathname === '/sign-up' ||
    pathname.startsWith('/sign-up/')
  );
}

function safeRedirectTarget(redirectUrl: string | null) {
  return redirectUrl?.startsWith('/') && !redirectUrl.startsWith('//')
    ? redirectUrl
    : '/';
}
