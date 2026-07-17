import type { ReactNode } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';

import { AccountMenuProvider } from './account-menu';
import { queryClient } from './query-client';
import { AppRouter } from './router';
import { TooltipProvider } from '../components/ui/tooltip';
import { Toaster } from '../components/ui/sonner';

export function App({ accountMenu }: { accountMenu?: ReactNode } = {}) {
  return (
    <AccountMenuProvider value={accountMenu}>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <AppRouter />
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </AccountMenuProvider>
  );
}
