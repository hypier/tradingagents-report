// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';

import { fireEvent, render, screen, within } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import {
  formatJobDuration,
  RecentReports,
  ReportsTable,
} from '../../src/frontend/components/dashboard/recent-reports';
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

it('shows library columns for decision and trade date', async () => {
  const { default: i18n } = await import('../../src/frontend/i18n');
  await i18n.changeLanguage('en');

  render(
    <TooltipProvider>
      <RecentReports
        jobs={[
          {
            id: 'job-1',
            ticker: 'AAPL',
            status: 'succeeded',
            decision: 'Buy',
            trade_date: '2026-07-21',
            is_favorite: true,
          },
        ]}
        loading={false}
        error={false}
        onOpenReport={vi.fn()}
      />
    </TooltipProvider>,
  );

  expect(
    screen.getByRole('columnheader', { name: 'Decision' }),
  ).toBeInTheDocument();
  expect(
    screen.getByRole('columnheader', { name: 'Trade date' }),
  ).toBeInTheDocument();
  expect(screen.getByText('Buy')).toHaveAttribute('data-variant', 'up');
  expect(screen.getByLabelText('Favorite')).toBeInTheDocument();

  await i18n.changeLanguage('zh');
  expect(await screen.findByText('买入')).toHaveAttribute('data-variant', 'up');
  await i18n.changeLanguage('en');
});

it('uses the destructive badge variant for failed tasks', () => {
  render(
    <TooltipProvider>
      <ReportsTable
        variant="tasks"
        title="Jobs"
        description="Ops"
        titleId="tasks-title"
        jobs={[
          {
            id: 'job-1',
            ticker: 'AAPL',
            status: 'failed',
            error: 'Vendor timeout',
          },
        ]}
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
  expect(screen.queryByText('Vendor timeout')).not.toBeInTheDocument();
  expect(
    screen.getByRole('button', { name: 'Failure reason' }),
  ).toBeInTheDocument();
  expect(
    screen.queryByRole('button', { name: 'Open job for AAPL' }),
  ).not.toBeInTheDocument();
});

it('uses the market-up badge variant for succeeded tasks', () => {
  const { container } = render(
    <TooltipProvider>
      <ReportsTable
        variant="tasks"
        title="Jobs"
        description="Ops"
        titleId="tasks-title"
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

it('uses the running badge variant for running tasks', () => {
  render(
    <TooltipProvider>
      <ReportsTable
        variant="tasks"
        title="Jobs"
        description="Ops"
        titleId="tasks-title"
        jobs={[
          {
            id: 'job-1',
            ticker: 'AAPL',
            status: 'running',
            current_step: 'Running market analyst',
            progress_percent: 40,
            credit_units: 1,
            created_at: '2026-07-21T08:00:00.000Z',
          },
        ]}
        loading={false}
        error={false}
        onOpenReport={vi.fn()}
      />
    </TooltipProvider>,
  );

  expect(screen.getByText('Running')).toHaveAttribute(
    'data-variant',
    'running',
  );
  expect(
    screen.getByRole('columnheader', { name: 'Step' }),
  ).toBeInTheDocument();
  expect(
    screen.getByRole('columnheader', { name: 'Submitted' }),
  ).toBeInTheDocument();
  expect(
    screen.getByRole('columnheader', { name: 'Duration' }),
  ).toBeInTheDocument();
  expect(
    screen.queryByRole('columnheader', { name: 'Credits' }),
  ).not.toBeInTheDocument();
  expect(screen.getByText('40%')).toBeInTheDocument();
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
  await i18n.changeLanguage('en');

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

  await i18n.changeLanguage('en');
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

it('formats compact job durations', () => {
  expect(
    formatJobDuration(
      '2026-07-21T08:00:00.000Z',
      '2026-07-21T08:03:12.000Z',
    ),
  ).toBe('3:12');
  expect(
    formatJobDuration(
      '2026-07-21T08:00:00.000Z',
      '2026-07-21T09:05:00.000Z',
    ),
  ).toBe('1:05:00');
  expect(
    formatJobDuration(
      '2026-07-21T08:00:00.000Z',
      '2026-07-21T08:00:09.000Z',
    ),
  ).toBe('0:09');
});

it('uses started_at to finished_at for task duration, not created_at', () => {
  render(
    <TooltipProvider>
      <ReportsTable
        variant="tasks"
        title="Jobs"
        description="Ops"
        titleId="tasks-title"
        jobs={[
          {
            id: 'job-1',
            ticker: 'AAPL',
            status: 'succeeded',
            created_at: '2026-06-01T08:00:00.000Z',
            updated_at: '2026-07-21T12:00:00.000Z',
            started_at: '2026-07-21T08:00:00.000Z',
            finished_at: '2026-07-21T08:04:30.000Z',
          },
        ]}
        loading={false}
        error={false}
        onOpenReport={vi.fn()}
      />
    </TooltipProvider>,
  );

  expect(screen.getByText('4:30')).toBeInTheDocument();
});
