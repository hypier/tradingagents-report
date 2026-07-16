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

  expect(screen.getByText('failed')).toHaveAttribute(
    'data-variant',
    'destructive',
  );
});

it('uses the primary green badge variant for succeeded research', () => {
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

  expect(within(container).getByText('succeeded')).toHaveAttribute(
    'data-variant',
    'default',
  );
});

it('uses the blue info badge variant for running research', () => {
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

  expect(screen.getByText('running')).toHaveAttribute('data-variant', 'info');
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
