import { QueryClientProvider } from '@tanstack/react-query';

import '../i18n';
import { queryClient } from './query-client';
import { AppRouter } from './router';
import { TooltipProvider } from '../components/ui/tooltip';
import { Toaster } from '../components/ui/sonner';

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AppRouter />
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}
