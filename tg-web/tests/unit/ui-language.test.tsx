// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { expect, it } from 'vitest';

import i18n from '../../src/frontend/i18n';
import { HomePage } from '../../src/frontend/pages/home-page';
import { TooltipProvider } from '../../src/frontend/components/ui/tooltip';

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: () => ({
    matches: false,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }),
});

it('switches the research desk UI between English and Chinese', async () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  render(
    <MemoryRouter>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <HomePage />
        </TooltipProvider>
      </QueryClientProvider>
    </MemoryRouter>,
  );

  expect(
    screen.getByRole('heading', { name: 'Run multi-agent analysis' }),
  ).toBeInTheDocument();
  expect(i18n.language).toMatch(/^en/);

  fireEvent.click(screen.getByRole('button', { name: '中文' }));

  expect(
    await screen.findByRole('heading', { name: '运行多智能体分析' }),
  ).toBeInTheDocument();
  expect(i18n.language).toBe('zh');
  expect(document.documentElement.lang).toBe('zh');
});
