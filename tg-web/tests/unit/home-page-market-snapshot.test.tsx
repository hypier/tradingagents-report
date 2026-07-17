// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';

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

vi.mock('../../src/frontend/lib/research', () => ({
  createResearch: vi.fn(),
  searchMarkets: vi.fn().mockResolvedValue({
    data: [
      {
        ticker: 'AAPL',
        exchange: 'NASDAQ',
        symbol: 'AAPL',
        display_ticker: 'AAPL',
        provider_symbol: 'NASDAQ:AAPL',
        display_name: 'Apple Inc.',
        logo_url: 'https://tv-logo.tradingviewapi.com/logo/apple.svg',
        is_primary_listing: true,
      },
    ],
    requestId: 'request-1',
  }),
  getMarketSnapshot: vi.fn().mockResolvedValue({
    data: {
      change_percent: 1.2,
      currency: 'USD',
      display_name: 'Apple Inc.',
      display_ticker: 'AAPL',
      last_price: 210,
      ticker: 'AAPL',
      logo_url: 'https://tv-logo.tradingviewapi.com/logo/apple.svg',
    },
    requestId: 'request-1',
  }),
  getMarketIdentities: vi.fn().mockResolvedValue({
    data: [
      {
        ticker: 'AAPL',
        display_name: 'Apple Inc.',
        logo_url: 'https://tv-logo.tradingviewapi.com/logo/apple.svg',
      },
    ],
    requestId: 'request-1',
  }),
  getResearchEvents: vi.fn(),
  listResearch: vi.fn().mockResolvedValue({ data: [], requestId: 'request-1' }),
}));

it('uses the up badge variant for a positive market move', async () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  const { container } = render(
    <MemoryRouter>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <HomePage />
        </TooltipProvider>
      </QueryClientProvider>
    </MemoryRouter>,
  );

  fireEvent.change(screen.getByRole('combobox', { name: 'Instrument' }), {
    target: { value: 'AAPL' },
  });
  fireEvent.click(await screen.findByRole('option', { name: /Apple Inc\./i }));

  expect(await screen.findByText('+1.20%')).toHaveAttribute(
    'data-variant',
    'up',
  );
  expect(container.querySelector('[data-logo-url]')).toHaveAttribute(
    'data-logo-url',
    'https://tv-logo.tradingviewapi.com/logo/apple.svg',
  );
});
