import { ClerkFailed, ClerkProvider } from '@clerk/react';
import { useNavigate } from 'react-router-dom';

import { AuthenticatedApp } from './authenticated-app';
import { AuthenticationUnavailable } from './authentication-unavailable';

export function ClerkApp({ publishableKey }: { publishableKey: string }) {
  const navigate = useNavigate();

  return (
    <ClerkProvider
      afterSignOutUrl="/sign-in"
      publishableKey={publishableKey}
      routerPush={(to) => navigate(to)}
      routerReplace={(to) => navigate(to, { replace: true })}
      signInFallbackRedirectUrl="/"
      signInUrl="/sign-in"
      signUpFallbackRedirectUrl="/"
      signUpUrl="/sign-up"
    >
      <ClerkFailed>
        <AuthenticationUnavailable />
      </ClerkFailed>
      <AuthenticatedApp />
    </ClerkProvider>
  );
}
