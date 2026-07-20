import type { ReactNode } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';

import '../i18n';
import { AccountMenuProvider } from './account-menu';
import { queryClient } from './query-client';
import { AppRouter } from './router';
import { AccountLocaleSync } from '../components/account-locale-sync';
import { ThemeProvider } from '../components/theme-provider';
import { TooltipProvider } from '../components/ui/tooltip';
import { Toaster } from '../components/ui/sonner';

export function App({ accountMenu }: { accountMenu?: ReactNode } = {}) {
  return (
    <AccountMenuProvider value={accountMenu}>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <TooltipProvider>
            <AccountLocaleSync />
            <AppRouter />
            <Toaster />
          </TooltipProvider>
        </ThemeProvider>
      </QueryClientProvider>
    </AccountMenuProvider>
  );
}
