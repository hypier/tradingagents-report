// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';

import { fireEvent, render, screen, within } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import { RecentReports } from '../../src/frontend/components/dashboard/recent-reports';
import { TooltipProvider } from '../../src/frontend/components/ui/tooltip';

it('opens a report from its direct icon action', () => {
  const onOpenReport = vi.fn();

  render(
    <TooltipProvider>
      <RecentReports
        jobs={[{ id: 'job-1', ticker: 'AAPL', status: 'succeeded' }]}
        loading={false}
        error={false}
        onOpenReport={onOpenReport}
      />
    </TooltipProvider>,
  );

  fireEvent.click(screen.getByRole('button', { name: 'View report for AAPL' }));

  expect(onOpenReport).toHaveBeenCalledWith('job-1');
  expect(
    screen.queryByRole('button', { name: 'Actions for AAPL' }),
  ).not.toBeInTheDocument();
});

it('uses the destructive badge variant for failed research', () => {
  render(
    <TooltipProvider>
      <RecentReports
        jobs={[{ id: 'job-1', ticker: 'AAPL', status: 'failed' }]}
        loading={false}
        error={false}
        onOpenReport={vi.fn()}
      />
    </TooltipProvider>,
  );

  expect(screen.getByText('Failed')).toHaveAttribute(
    'data-variant',
    'destructive',
  );
});

it('uses the market-up badge variant for succeeded research', () => {
  const { container } = render(
    <TooltipProvider>
      <RecentReports
        jobs={[{ id: 'job-1', ticker: 'AAPL', status: 'succeeded' }]}
        loading={false}
        error={false}
        onOpenReport={vi.fn()}
      />
    </TooltipProvider>,
  );

  expect(within(container).getByText('Succeeded')).toHaveAttribute(
    'data-variant',
    'up',
  );
});

it('uses the running badge variant for running research', () => {
  render(
    <TooltipProvider>
      <RecentReports
        jobs={[{ id: 'job-1', ticker: 'AAPL', status: 'running' }]}
        loading={false}
        error={false}
        onOpenReport={vi.fn()}
      />
    </TooltipProvider>,
  );

  expect(screen.getByText('Running')).toHaveAttribute('data-variant', 'running');
});

it('shows a TradingView asset logo before the ticker when available', () => {
  const { container } = render(
    <TooltipProvider>
      <RecentReports
        jobs={[{ id: 'job-1', ticker: 'AAPL', status: 'succeeded' }]}
        identities={{
          AAPL: {
            ticker: 'AAPL',
            display_name: 'Apple Inc.',
            logo_url: 'https://tv-logo.tradingviewapi.com/logo/apple.svg',
          },
        }}
        loading={false}
        error={false}
        onOpenReport={vi.fn()}
      />
    </TooltipProvider>,
  );

  expect(container.querySelector('[data-logo-url]')).toHaveAttribute(
    'data-logo-url',
    'https://tv-logo.tradingviewapi.com/logo/apple.svg',
  );
});

it('shows the report output language column', async () => {
  const { default: i18n } = await import('../../src/frontend/i18n');

  render(
    <TooltipProvider>
      <RecentReports
        jobs={[
          {
            id: 'job-1',
            ticker: 'AAPL',
            status: 'succeeded',
            output_language: 'Chinese',
          },
        ]}
        loading={false}
        error={false}
        onOpenReport={vi.fn()}
      />
    </TooltipProvider>,
  );

  expect(
    screen.getByRole('columnheader', { name: 'Language' }),
  ).toBeInTheDocument();
  expect(screen.getByText('Chinese · 中文')).toBeInTheDocument();

  await i18n.changeLanguage('zh');

  expect(
    await screen.findByRole('columnheader', { name: '语言' }),
  ).toBeInTheDocument();
  expect(screen.getByText('中文')).toBeInTheDocument();
});

it('shows logo and company name in the rail density list', () => {
  const { container } = render(
    <TooltipProvider>
      <RecentReports
        density="rail"
        jobs={[{ id: 'job-1', ticker: 'AAPL', status: 'succeeded' }]}
        identities={{
          AAPL: {
            ticker: 'AAPL',
            display_name: 'Apple Inc.',
            logo_url: 'https://tv-logo.tradingviewapi.com/logo/apple.svg',
          },
        }}
        loading={false}
        error={false}
        onOpenReport={vi.fn()}
      />
    </TooltipProvider>,
  );

  expect(screen.getByText('Apple Inc.')).toBeInTheDocument();
  expect(screen.getByText('AAPL')).toBeInTheDocument();
  expect(container.querySelector('[data-logo-url]')).toHaveAttribute(
    'data-logo-url',
    'https://tv-logo.tradingviewapi.com/logo/apple.svg',
  );

  const row = screen.getByText('AAPL').closest('button');
  expect(row).toBeTruthy();
  const nameEl = within(row!).getByText('Apple Inc.');
  const tickerEl = within(row!).getByText('AAPL');
  expect(
    nameEl.compareDocumentPosition(tickerEl) &
      Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy();
});

it('renders Yahoo-style display tickers for multi-market instruments', () => {
  render(
    <TooltipProvider>
      <RecentReports
        jobs={[
          { id: 'job-hk', ticker: '700', status: 'succeeded' },
          { id: 'job-sz', ticker: '300750.SZ', status: 'succeeded' },
        ]}
        identities={{
          '700': {
            ticker: '700',
            display_ticker: '0700.HK',
            display_name: 'Tencent Holdings Ltd',
          },
        }}
        loading={false}
        error={false}
        onOpenReport={vi.fn()}
      />
    </TooltipProvider>,
  );

  expect(screen.getByText('0700.HK')).toBeInTheDocument();
  expect(screen.getByText('300750.SZ')).toBeInTheDocument();
});
