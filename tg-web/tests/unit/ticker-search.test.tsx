// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

import { TickerSearch } from '../../src/frontend/components/ticker-search';

const researchMocks = vi.hoisted(() => ({
  searchMarkets: vi.fn(),
}));

vi.mock('../../src/frontend/lib/research', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('../../src/frontend/lib/research')
  >()),
  searchMarkets: researchMocks.searchMarkets,
}));

function renderSearch(onChange = vi.fn()) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <label htmlFor={'ticker'}>Instrument</label>
      <TickerSearch id={'ticker'} value={null} onChange={onChange} />
    </QueryClientProvider>,
  );
  return onChange;
}

beforeEach(() => {
  researchMocks.searchMarkets.mockReset();
});

it('selects a direct ticker without provider metadata', async () => {
  researchMocks.searchMarkets.mockResolvedValue({
    data: [
      {
        ticker: 'AAPL',
        exchange: null,
        symbol: 'AAPL',
        display_ticker: 'AAPL',
        provider_symbol: null,
        display_name: 'AAPL',
        is_primary_listing: true,
      },
    ],
    requestId: 'request-1',
  });
  const onChange = renderSearch();

  fireEvent.change(screen.getByRole('combobox', { name: 'Instrument' }), {
    target: { value: 'AAPL' },
  });
  fireEvent.click(await screen.findByRole('option', { name: /AAPL/ }));

  expect(onChange).toHaveBeenCalledWith({
    display_ticker: 'AAPL',
    display_name: 'AAPL',
    symbol: 'AAPL',
  });
});

it('shows an unavailable message when market search fails', async () => {
  researchMocks.searchMarkets.mockRejectedValue(new Error('unavailable'));
  renderSearch();

  fireEvent.change(screen.getByRole('combobox', { name: 'Instrument' }), {
    target: { value: 'Tencent' },
  });

  expect(
    await screen.findByText('Stock search is temporarily unavailable'),
  ).toBeVisible();
  expect(screen.queryByText('No matching stocks')).not.toBeInTheDocument();
});
