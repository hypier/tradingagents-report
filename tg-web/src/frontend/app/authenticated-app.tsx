import type { ReactNode } from 'react';
import {
  ClerkLoaded,
  ClerkLoading,
  Show,
  SignIn,
  SignOutButton,
  SignUp,
  UserButton,
} from '@clerk/react';
import { LogOut } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';

import { BrandMark } from '../components/icons/research-icons';
import { Button } from '../components/ui/button';
import { Spinner } from '../components/ui/spinner';
import { App } from './app';
import { LegalPage } from '../pages/legal-page';
import { WelcomePage } from '../pages/welcome-page';

export function AuthenticatedApp() {
  const { t } = useTranslation('auth');

  return (
    <>
      <ClerkLoading>
        <main className="grid min-h-svh place-items-center">
          <Spinner aria-label={t('loadingSession')} />
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
      <Route path="/" element={<WelcomePage />} />
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
  const { t } = useTranslation('auth');
  const location = useLocation();

  if (isAuthenticationPath(location.pathname)) {
    const redirectUrl = new URLSearchParams(location.search).get(
      'redirect_url',
    );
    return <Navigate replace to={safeRedirectTarget(redirectUrl)} />;
  }

  return (
    <App
      accountMenu={
        <div className="flex items-center gap-1.5">
          <SignOutButton>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 gap-1.5 px-2.5"
            >
              <LogOut className="size-3.5" />
              {t('signOut')}
            </Button>
          </SignOutButton>
          <UserButton signInUrl="/sign-in" />
        </div>
      }
    />
  );
}

function AuthPage({ children }: { children: ReactNode }) {
  const { t } = useTranslation('common');

  return (
    <main className="grid min-h-svh place-items-center bg-muted/30 px-4 py-10">
      <section className="flex w-full max-w-sm flex-col items-center gap-6">
        <div className="flex flex-col items-center gap-3 text-center">
          <BrandMark className="size-10 text-primary" />
          <div className="flex flex-col gap-1.5">
            <h1 className="text-xl leading-none font-semibold tracking-[-0.02em]">
              <span>{t('brand.name')}</span>{' '}
              <span className="text-primary">{t('brand.floorTag')}</span>
            </h1>
            <p className="text-sm text-muted-foreground">
              {t('brand.tagline')}
            </p>
          </div>
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
