import { useEffect, useState, type ReactNode } from 'react';

import { App } from './app';
import { AuthenticationUnavailable } from './authentication-unavailable';
import { ClerkApp } from './clerk-app';
import { resolveClerkPublishableKey } from '../lib/public-config';

type BootstrapState =
  | { status: 'loading' }
  | { status: 'ready'; publishableKey: string }
  | { status: 'unavailable' };

export function BootstrapApp({
  authTestMode = import.meta.env.VITE_AUTH_TEST_MODE === 'true',
  vitePublishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY,
}: {
  authTestMode?: boolean;
  vitePublishableKey?: string;
} = {}): ReactNode {
  const [state, setState] = useState<BootstrapState>(() =>
    authTestMode ? { status: 'ready', publishableKey: '' } : { status: 'loading' },
  );

  useEffect(() => {
    if (authTestMode) {
      return;
    }

    let cancelled = false;
    void resolveClerkPublishableKey(vitePublishableKey).then((key) => {
      if (cancelled) {
        return;
      }
      setState(
        key
          ? { status: 'ready', publishableKey: key }
          : { status: 'unavailable' },
      );
    });

    return () => {
      cancelled = true;
    };
  }, [authTestMode, vitePublishableKey]);

  if (authTestMode) {
    return <App />;
  }
  if (state.status === 'loading') {
    return null;
  }
  if (state.status === 'unavailable') {
    return <AuthenticationUnavailable />;
  }
  return <ClerkApp publishableKey={state.publishableKey} />;
}
