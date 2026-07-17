import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';

import { App } from './app/app';
import { AuthenticationUnavailable } from './app/authentication-unavailable';
import { ClerkApp } from './app/clerk-app';
import './styles/globals.css';

const authTestMode = import.meta.env.VITE_AUTH_TEST_MODE === 'true';
const publishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      {authTestMode ? (
        <App />
      ) : publishableKey ? (
        <ClerkApp publishableKey={publishableKey} />
      ) : (
        <AuthenticationUnavailable />
      )}
    </BrowserRouter>
  </StrictMode>,
);
